// HTTP helpers shared by NEW Edge Functions (parse-receipt). Web-standard APIs only (no Deno imports), so
// Vitest runs the tests from the Node project. parse-movements keeps its own copies and is intentionally untouched.

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}

export function jsonResponse(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  })
}

/** Reads the body as text, stopping as soon as it exceeds the byte cap. Returns null when over the cap. */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<string | null> {
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/**
 * POSTs a Messages API request. Returns the parsed JSON response or null on any failure. Only the failure
 * class is logged: never the key, the request body (it may carry an image) or the response body.
 */
export async function callAnthropic(
  url: string,
  version: string,
  apiKey: string,
  requestBody: unknown,
  timeoutMs: number,
  logLabel: string,
): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': version,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error(`${logLabel}: model call failed`, response.status)
      return null
    }
    return await response.json()
  } catch (error) {
    console.error(`${logLabel}: model call failed`, error instanceof Error ? error.name : 'unknown')
    return null
  } finally {
    clearTimeout(timer)
  }
}
