// The change prompt against a real-shaped working set, without a browser.
// Run: node scripts/change-prompt.test.mjs
import { areaOf, buildChangePrompt, changeLine, roleOf, sectionOf } from '../shared/change-prompt.mjs'

const rows = [
  { id: 'transcripts.panel.title', source: 'Session Transcripts', text: 'Transcripts', where: 'panel header', tags: ['heading', 'transcripts'] },
  { id: 'settings.providers.hint', source: 'Cloud providers are opt-in.', text: 'Cloud providers are opt-in. Nothing leaves this machine.', where: 'provider settings', tags: ['hint', 'settings'] },
  { id: 'buttons.save', source: 'Save changes', text: 'Save', where: 'dialog footer', tags: ['button', 'upload'] },
  { id: 'buttons.cancel', source: 'Cancel', text: 'Cancel', where: 'dialog footer', tags: ['button', 'upload'] },
  { id: 'errors.upload', source: 'Upload failed', text: 'Upload "failed"', where: 'dialog', tags: ['error'] },
  { id: 'menu.export', source: 'Export transcripts', text: 'Export run', where: 'menu', tags: [] }
]

const checks = []
const check = (name, pass, detail = '') => checks.push({ name, pass, detail })

const { text, lines, stats } = buildChangePrompt(rows, { app: 'Session Transcripts' })

check('only changed rows are listed', stats.changed === 5 && lines.length === 5, `${lines.length} lines`)
check('an unchanged row is never a line of its own', !lines.some((line) => line.startsWith('Replace "Cancel"')), 'Cancel untouched')
check('one line per change, in the replace shape', lines.every((line) => /^Replace ".+" with ".+" in .+/.test(line)), lines[0])
check('a tag pair names area and role', sectionOf(rows[0]) === 'Transcripts · Heading', sectionOf(rows[0]))
check('a lone role names the role', sectionOf(rows[4]) === 'Error', sectionOf(rows[4]))
check('an untagged row falls back to its where line', sectionOf(rows[5]) === 'menu', sectionOf(rows[5]))
check('ids ride along', lines.every((line) => line.includes('(id: ')), 'ids present')
check('quotes inside text are escaped', lines.some((line) => line.includes('\\"failed\\"')), 'quote escaped')
check('the heading carries the area', text.includes('## Settings') && text.includes('## Upload'), 'headings present')
check('a grouped line names only the role', /Replace "Cloud providers are opt-in\." with .+ in Hint \(id:/.test(text), 'role line under heading')
check('area and role split cleanly', areaOf(rows[0]) === 'Transcripts' && roleOf(rows[0]) === 'Heading', `${areaOf(rows[0])} / ${roleOf(rows[0])}`)
check('the count in the header matches the lines', text.includes('Apply 5 string changes'), 'header count')
check('a closing report is asked for', /report how many of these changes you applied/.test(text), 'footer')
check('ids can be dropped', buildChangePrompt(rows, { includeIds: false }).lines.every((line) => !line.includes('(id: ')), 'no ids')
check('lines only skips the preamble', buildChangePrompt(rows, { linesOnly: true }).text.split('\n').every((line) => line.startsWith('Replace ')), 'lines only')
check('nothing changed means nothing to say', buildChangePrompt([{ id: 'a', source: 'same', text: 'same' }]).lines.length === 0, 'empty')

// Two rows with one source text and two targets: the id has to stay, or the
// agent cannot tell which line means which string.
const twins = [
  { id: 'a', source: 'Settings', text: 'Preferences', tags: ['tab'] },
  { id: 'b', source: 'Settings', text: 'Options', tags: ['tab'] }
]
const twin = buildChangePrompt(twins, { includeIds: false })
check('duplicate sources force the id to stay', twin.lines.every((line) => line.includes('(id: ')), twin.lines[0])
check('duplicate sources are counted', twin.stats.ambiguous === 1, String(twin.stats.ambiguous))

check('a line for a string with a line break escapes it', changeLine({ id: 'x', source: 'one\ntwo', text: 'one two', tags: ['paragraph'] }).includes('\\n'), changeLine({ id: 'x', source: 'one\ntwo', text: 'one two', tags: ['paragraph'] }))

const failed = checks.filter((entry) => !entry.pass)
for (const entry of checks) console.log(`${entry.pass ? 'PASS ' : 'FAIL '} ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`)
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
process.exit(failed.length ? 1 : 0)
