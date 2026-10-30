// The humanize pass: one prompt builder, five voices, an optional profile.
//
// What matters here is that a voice cannot exist in the menu without the prompt
// knowing what it means, that the profile only rides along when asked, and that a
// humanize rewrite keeps every budget rule the other passes obey.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { buildPrompt } from '../server/polish.mjs'
import { VOICES, voiceFor, voiceBlock, voiceList } from '../shared/voices.mjs'
import { userProfile, userProfileSummary, DEFAULT_PROFILE_PATH } from '../server/user-profile.mjs'

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const font = { family: 'Inter', size: 13 }
const item = {
  id: 'app.hint',
  text: 'Rewrites stay on this machine, so nothing leaves it.',
  where: 'Hint under the editor',
  tags: ['hint'],
  maxPxPerLine: 240,
  maxLines: 2,
  surface: 'app'
}
const docsItem = { ...item, id: 'readme.line', surface: 'docs', where: 'README.md', tags: ['doc-paragraph'] }

// ---------------------------------------------------------------- the vocabulary
check('five voices are offered', VOICES.length === 5, String(VOICES.length))
check('every voice is complete', VOICES.every((v) => v.id && v.label && v.blurb && v.instruction.length > 60))
check('voice ids are unique', new Set(VOICES.map((v) => v.id)).size === VOICES.length)
check('the menu never gets an instruction', voiceList().every((v) => !('instruction' in v)))
check('an unknown voice falls back to the first', voiceFor('nope').id === VOICES[0].id)
check('every voice says which surface it suits', VOICES.every((v) => ['app', 'docs', 'both'].includes(v.applies)))

// ---------------------------------------------------------------- the prompt
for (const voice of VOICES) {
  const prompt = buildPrompt({ item, mode: 'humanize', voice: voice.id, font })
  check(`the ${voice.id} prompt states its voice`, prompt.system.includes(`${voice.label} voice`), prompt.system.slice(-120))
  check(`the ${voice.id} prompt keeps the width budget`, prompt.system.includes('Width budget'))
  check(`the ${voice.id} prompt forbids invented detail`, prompt.system.includes('Never invent experience'))
}

const withProfile = buildPrompt({ item, mode: 'humanize', voice: 'humanizer', font, profile: 'AUTHOR PROFILE TEXT' })
check('the profile rides along when given', withProfile.system.includes('AUTHOR PROFILE TEXT'))
check('the profile block explains its limits', withProfile.system.includes('never licenses a new fact'))
const without = buildPrompt({ item, mode: 'humanize', voice: 'humanizer', font, profile: '' })
check('no profile means no profile block', !without.system.includes('The writer’s own profile'))
const styleRun = buildPrompt({ item, mode: 'style', font, profile: 'AUTHOR PROFILE TEXT' })
check('a non-humanize pass ignores the profile', !styleRun.system.includes('AUTHOR PROFILE TEXT'))
check('a non-humanize pass has no voice block', !styleRun.system.includes('voice rules'))
check('an unknown mode is still a style pass', buildPrompt({ item, mode: 'nonsense', font }).system.includes('Rewrite the string so it reads better'))

// ---------------------------------------------------------------- prose
const prose = buildPrompt({ item: docsItem, mode: 'humanize', voice: 'prose', font })
check('a prose voice reaches a document pass', prose.system.includes('Prose voice'))
check('a document pass carries no pixel rules', !prose.system.includes('Width budget'))
check('a document pass says it is prose', prose.prose === true)
const grammarDocs = buildPrompt({ item: docsItem, mode: 'grammar', font })
check('grammar on a document asks for grammar, not a rewrite', grammarDocs.system.includes('Correct grammar, spelling, punctuation and capitalisation only'))
const appGrammar = buildPrompt({ item, mode: 'grammar', font })
check('grammar on a string still asks for grammar', appGrammar.system.includes('Correct grammar, spelling, punctuation and capitalisation only'))

// ---------------------------------------------------------------- the profile file
check('the shipped default path is outside this repository', DEFAULT_PROFILE_PATH.includes('self-profile'), DEFAULT_PROFILE_PATH)

const dir = mkdtempSync(join(tmpdir(), 'st-voice-'))
try {
  const missing = userProfile(join(dir, 'nope.md'))
  check('a missing profile is a state, not a crash', missing.present === false && missing.text === '')
  check('a missing profile reports where it looked', missing.path.endsWith('nope.md'))

  const file = join(dir, 'profile.md')
  const head = '# A profile\n\n[version history](v1.md)\n\n## Apply in every voice\n\nKeep the writer visible.\n\n## Supported habits\n\n' + 'A habit sentence.\n\n'.repeat(400)
  writeFileSync(file, head)
  const read = userProfile(file)
  check('a present profile is read', read.present === true && read.text.includes('Keep the writer visible'))
  check('the version history is dropped', !read.text.includes('version history'))
  check('a long profile is trimmed at a paragraph', read.chars <= 4000 && read.text.endsWith('.'), String(read.chars))
  check('the summary never carries the body', JSON.stringify(userProfileSummary(file)).length < 200)

  writeFileSync(file, head.replace('Keep the writer visible.', 'Keep the writer visible, and plainly.'))
  check('an edited profile is picked up', userProfile(file).text.includes('and plainly'))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// ---------------------------------------------------------------- the block itself
const block = voiceBlock({ voice: 'simple', profile: 'X' })
check('the block names the voice once', (block.match(/Simple English voice/g) ?? []).length === 1)
check('the block ends with the profile', block.trim().endsWith('X'))

// A humanize pass is a method, not a repair. Told to keep what already reads
// well, the model echoed the source and the pass looked broken.
check('a voice no longer offers the unchanged escape', !/already reads well, return it unchanged/.test(block))
check('a voice asks for tightening instead', /already reads well/.test(block) && /tightening/.test(block))

const appItem = {
  id: 'a.b',
  text: 'Known sites get an icon automatically.',
  where: 'Quicklinks',
  tags: ['hint'],
  maxPxPerLine: 312,
  maxLines: 2,
  surface: 'app'
}
const uiFont = { family: 'Inter', size: 13, weight: 400, letterSpacing: 0 }
const humanizePrompt = buildPrompt({ item: appItem, mode: 'humanize', font: uiFont, voice: 'humanizer', profile: '' })
check('a humanize prompt forbids the no-op', /must differ from the source/.test(humanizePrompt.system))
check('a humanize prompt drops the unchanged allowance', !/return it unchanged/.test(humanizePrompt.system))
check('the humanize prompt still carries the budgets', /312px box/.test(humanizePrompt.system))
const docsPrompt = buildPrompt({ item: { ...appItem, surface: 'docs', maxLines: 0 }, mode: 'humanize', voice: 'prose', profile: '' })
check('a prose humanize forbids the no-op too', /must differ from the source/.test(docsPrompt.system))
for (const mode of ['grammar', 'style', 'fit']) {
  const other = buildPrompt({ item: appItem, mode, font: uiFont, voice: 'humanizer', profile: '' })
  check(`a ${mode} pass may still report no change`, /return it unchanged/.test(other.system))
}

console.log(`\n${pass}/${pass + fail} checks passed`)
process.exit(fail ? 1 : 0)
