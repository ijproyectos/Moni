import { createLucideIcon } from 'lucide-react'

/**
 * Moni's ant, for "Gastos hormiga": a friendly little ant drawn with the same round, 2px line style as the rest of the
 * icons (24×24, `currentColor`), so it takes the size, color and stroke of whatever tile or button it sits in.
 * Round head with antennae, a small thorax, a round abdomen and three legs on each side.
 */
export const AntIcon = createLucideIcon('Ant', [
  ['circle', { cx: '12', cy: '5.2', r: '2.6', key: 'head' }],
  ['path', { d: 'M10.6 3 8.6 1', key: 'antenna-left' }],
  ['path', { d: 'M13.4 3 15.4 1', key: 'antenna-right' }],
  ['ellipse', { cx: '12', cy: '10.9', rx: '2', ry: '1.7', key: 'thorax' }],
  ['ellipse', { cx: '12', cy: '17.6', rx: '3.9', ry: '4.4', key: 'abdomen' }],
  ['path', { d: 'M10 9.8 5 7.6', key: 'leg-left-1' }],
  ['path', { d: 'M10 10.9H3.6', key: 'leg-left-2' }],
  ['path', { d: 'M10.1 12 5.4 14.4', key: 'leg-left-3' }],
  ['path', { d: 'M14 9.8 19 7.6', key: 'leg-right-1' }],
  ['path', { d: 'M14 10.9h6.4', key: 'leg-right-2' }],
  ['path', { d: 'M13.9 12 18.6 14.4', key: 'leg-right-3' }],
])
