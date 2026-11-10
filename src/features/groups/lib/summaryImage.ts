import mascotUrl from '@/assets/mascot/expresion_picaro.svg'
import type { SummaryModel } from '../domain/summaryShare'

// Moni's light palette on purpose, whichever theme the app is in: the image is a keepsake that gets sent to other
// people and looks like the Resumen card (cream paper, forest header, lime accent).
const C = {
  canvas: '#fff8ec',
  card: '#ffffff',
  forest: '#064735',
  lime: '#b8ec7c',
  sand: '#f3e8d2',
  muted: '#3f5a50',
  income: '#2f7d1f',
  expense: '#b8321f',
}
const FONT = "'Bricolage Grotesque Variable', system-ui, sans-serif"
const W = 1080
const PAD = 56
const INNER = W - PAD * 2

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Lines of `text` that fit in `width` at the font already set on `ctx`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > width) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out.length ? out : ['']
}

type Draw = (ctx: CanvasRenderingContext2D, top: number) => void
interface Block {
  height: number
  draw: Draw
}

/** A neat PNG of the whole summary, drawn straight on a canvas (no extra libraries). */
export async function renderSummaryImage(model: SummaryModel): Promise<Blob> {
  await document.fonts?.load(`800 36px 'Bricolage Grotesque Variable'`).catch(() => undefined)
  await document.fonts?.load(`400 30px 'Bricolage Grotesque Variable'`).catch(() => undefined)
  const mascot = await loadImage(mascotUrl)
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) throw new Error('canvas_unavailable')

  const blocks: Block[] = []
  const gap = (h: number) => blocks.push({ height: h, draw: () => undefined })
  const section = (label: string) =>
    blocks.push({
      height: 56,
      draw: (ctx, top) => {
        ctx.fillStyle = C.muted
        ctx.font = `800 26px ${FONT}`
        ctx.textAlign = 'left'
        ctx.fillText(label.toUpperCase(), PAD, top + 36)
      },
    })

  // Header: mascot, title, date
  measure.font = `800 50px ${FONT}`
  const titleLines = wrap(measure, model.title, INNER - 130).slice(0, 2)
  const headerH = Math.max(110, 56 + titleLines.length * 58)
  blocks.push({
    height: headerH + 20,
    draw: (ctx, top) => {
      ctx.fillStyle = C.lime
      ctx.beginPath()
      ctx.roundRect(PAD, top, 104, 104, 24)
      ctx.fill()
      if (mascot) ctx.drawImage(mascot, PAD + 10, top + 10, 84, 84)
      ctx.fillStyle = C.forest
      ctx.font = `800 50px ${FONT}`
      ctx.textAlign = 'left'
      titleLines.forEach((l, i) => ctx.fillText(l, PAD + 130, top + 50 + i * 58))
      ctx.fillStyle = C.muted
      ctx.font = `400 30px ${FONT}`
      ctx.fillText(
        `${model.dateLabel} · ${model.peopleCount} ${model.peopleCount === 1 ? 'persona' : 'personas'}`,
        PAD + 130,
        top + 50 + titleLines.length * 58 - 8,
      )
    },
  })

  // Gastos
  section('Gastos')
  if (model.expenses.length === 0)
    blocks.push({
      height: 52,
      draw: (ctx, top) => {
        ctx.fillStyle = C.forest
        ctx.font = `400 32px ${FONT}`
        ctx.fillText('Todavía no hay gastos.', PAD, top + 36)
      },
    })
  for (const e of model.expenses) {
    measure.font = `800 32px ${FONT}`
    const amountW = measure.measureText(e.amount).width
    const descLines = wrap(measure, e.description, INNER - amountW - 30)
    measure.font = `400 26px ${FONT}`
    const paidLines = wrap(
      measure,
      `${e.manyPayers ? 'Pagaron' : 'Pagó'} ${e.paidBy}`,
      INNER - amountW - 30,
    )
    blocks.push({
      height: descLines.length * 40 + paidLines.length * 32 + 22,
      draw: (ctx, top) => {
        ctx.textAlign = 'left'
        ctx.fillStyle = C.forest
        ctx.font = `800 32px ${FONT}`
        descLines.forEach((l, i) => ctx.fillText(l, PAD, top + 32 + i * 40))
        ctx.fillStyle = C.muted
        ctx.font = `400 26px ${FONT}`
        paidLines.forEach((l, i) => ctx.fillText(l, PAD, top + 32 + descLines.length * 40 + i * 32))
        ctx.textAlign = 'right'
        ctx.fillStyle = C.forest
        ctx.font = `800 32px ${FONT}`
        ctx.fillText(e.amount, W - PAD, top + 32)
      },
    })
  }
  blocks.push({
    height: 84,
    draw: (ctx, top) => {
      ctx.fillStyle = C.forest
      ctx.fillRect(PAD, top + 8, INNER, 3)
      ctx.textAlign = 'left'
      ctx.font = `800 36px ${FONT}`
      ctx.fillText('Total gastado', PAD, top + 58)
      ctx.textAlign = 'right'
      ctx.font = `800 44px ${FONT}`
      ctx.fillText(model.total, W - PAD, top + 60)
    },
  })
  gap(24)

  // Cuentas
  section('Cuentas')
  blocks.push({
    height: 44,
    draw: (ctx, top) => {
      ctx.fillStyle = C.muted
      ctx.font = `400 26px ${FONT}`
      ctx.textAlign = 'right'
      ctx.fillText('Puso', PAD + INNER * 0.5, top + 30)
      ctx.fillText('Su parte', PAD + INNER * 0.74, top + 30)
      ctx.fillText('Saldo', W - PAD, top + 30)
    },
  })
  for (const p of model.people)
    blocks.push({
      height: 52,
      draw: (ctx, top) => {
        ctx.textAlign = 'left'
        ctx.fillStyle = C.forest
        ctx.font = `800 30px ${FONT}`
        ctx.fillText(p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name, PAD, top + 36)
        ctx.textAlign = 'right'
        ctx.font = `400 28px ${FONT}`
        ctx.fillText(p.paid, PAD + INNER * 0.5, top + 36)
        ctx.fillText(p.owed, PAD + INNER * 0.74, top + 36)
        ctx.font = `800 30px ${FONT}`
        ctx.fillStyle = p.netCents > 0 ? C.income : p.netCents < 0 ? C.expense : C.forest
        ctx.fillText(p.net, W - PAD, top + 36)
      },
    })
  gap(24)

  // Liquidación
  section('Quién le pasa a quién')
  if (model.transfers.length === 0)
    blocks.push({
      height: 56,
      draw: (ctx, top) => {
        ctx.textAlign = 'left'
        ctx.fillStyle = C.forest
        ctx.font = `800 32px ${FONT}`
        ctx.fillText('¡Están todos a mano!', PAD, top + 38)
      },
    })
  for (const t of model.transfers) {
    measure.font = `800 44px ${FONT}`
    const amountW = measure.measureText(t.amount).width
    measure.font = `800 32px ${FONT}`
    const who = wrap(measure, `${t.from} → ${t.to}`, INNER - amountW - 30)
    measure.font = `400 26px ${FONT}`
    const via = t.transfer ? wrap(measure, t.transfer, INNER - amountW - 30) : []
    blocks.push({
      height: who.length * 40 + via.length * 32 + 26,
      draw: (ctx, top) => {
        ctx.textAlign = 'left'
        ctx.fillStyle = C.forest
        ctx.font = `800 32px ${FONT}`
        who.forEach((l, i) => ctx.fillText(l, PAD, top + 34 + i * 40))
        ctx.fillStyle = C.muted
        ctx.font = `400 26px ${FONT}`
        via.forEach((l, i) => ctx.fillText(l, PAD, top + 34 + who.length * 40 + i * 32))
        ctx.textAlign = 'right'
        ctx.fillStyle = C.income
        ctx.font = `800 44px ${FONT}`
        ctx.fillText(t.amount, W - PAD, top + 40)
      },
    })
  }
  gap(16)
  blocks.push({
    height: 70,
    draw: (ctx, top) => {
      ctx.fillStyle = C.sand
      ctx.fillRect(PAD, top + 4, INNER, 2)
      ctx.textAlign = 'center'
      ctx.fillStyle = C.muted
      ctx.font = `400 26px ${FONT}`
      ctx.fillText('Hecho con Moni', W / 2, top + 48)
    },
  })

  const SCALE = 2
  const bodyH = blocks.reduce((s, b) => s + b.height, 0)
  const height = 40 + bodyH + 40
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = C.canvas
  ctx.fillRect(0, 0, W, height)
  ctx.fillStyle = C.card
  ctx.beginPath()
  ctx.roundRect(24, 24, W - 48, height - 48, 40)
  ctx.fill()
  let top = 40 + 8
  for (const b of blocks) {
    b.draw(ctx, top)
    top += b.height
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('image_failed'))),
      'image/png',
    ),
  )
}
