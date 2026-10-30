// WCAG 2.1 contrast check for the token pairs the UI actually renders.
// Run: node scripts/check-contrast.mjs
// Exits 1 when a pair that carries text falls under its threshold.

const TOKENS = {
  'ink-950': '#08090b',
  'ink-925': '#0a0c0f',
  'ink-900': '#0d0f13',
  'ink-850': '#101318',
  'ink-800': '#14181e',
  'ink-750': '#181d24',
  'ink-700': '#1e242c',
  line: '#222831',
  'line-strong': '#2f3742',
  'line-input': '#59636f',
  fg: '#e9edf3',
  'fg-dim': '#a9b2be',
  'fg-faint': '#8b95a3',
  ok: '#3ddc91',
  near: '#f0b429',
  over: '#f96a6f'
}

// [foreground, background, kind] where kind is 'body' (4.5), 'large' (3.0) or 'ui' (3.0)
const PAIRS = [
  ['fg', 'ink-950', 'body', 'primary text on the page'],
  ['fg', 'ink-900', 'body', 'primary text in a panel'],
  ['fg', 'ink-850', 'body', 'primary text in an input'],
  ['fg-dim', 'ink-950', 'body', 'secondary text, source strings'],
  ['fg-dim', 'ink-900', 'body', 'secondary text in a row'],
  ['fg-faint', 'ink-950', 'body', 'metadata, ids, budgets'],
  ['fg-faint', 'ink-900', 'body', 'metadata on a zebra row'],
  ['fg-faint', 'ink-800', 'body', 'metadata in a menu'],
  ['fg-dim', 'ink-925', 'body', 'status bar text'],
  ['ok', 'ink-950', 'body', 'fits verdict'],
  ['near', 'ink-950', 'body', 'close to limit verdict'],
  ['over', 'ink-950', 'body', 'over budget verdict'],
  ['over', 'ink-900', 'body', 'over budget verdict on a row'],
  ['fg', 'ink-800', 'body', 'button label on a raised surface'],
  ['ink-950', 'fg', 'body', 'primary button label'],
  ['line-input', 'ink-850', 'ui', 'input border against its fill'],
  ['line-input', 'ink-950', 'ui', 'input border against the page']
]

const srgb = (value) => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (hex) => {
  const clean = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16))
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
}

const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

let failed = 0
const rows = PAIRS.map(([fgKey, bgKey, kind, note]) => {
  const value = ratio(TOKENS[fgKey], TOKENS[bgKey])
  const min = kind === 'body' ? 4.5 : 3
  const pass = value >= min
  if (!pass) failed += 1
  return {
    pair: `${fgKey} on ${bgKey}`,
    ratio: value.toFixed(2),
    needs: `>= ${min}`,
    result: pass ? 'pass' : 'FAIL',
    note
  }
})

const width = Math.max(...rows.map((r) => r.pair.length))
console.log(`${'pair'.padEnd(width)}  ratio  needs  result  note`)
for (const row of rows) {
  console.log(
    `${row.pair.padEnd(width)}  ${row.ratio.padStart(5)}  ${row.needs.padEnd(5)}  ${row.result.padEnd(6)}  ${row.note}`
  )
}

console.log(`\n${rows.length - failed}/${rows.length} pairs meet WCAG 2.1 AA.`)
process.exit(failed ? 1 : 0)
