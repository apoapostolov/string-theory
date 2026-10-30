// The voices this tool can rewrite in.
//
// One vocabulary, read by the server prompt and by the menu, so a voice cannot
// exist in the UI without the prompt knowing what it means. Each instruction is
// a short synthesis of the writing skill it comes from, not a copy of it: the
// model gets the rule it needs to act on one UI string, not a whole manual.
//
// Every voice is voice-preserving. None of them may add a fact, an opinion, an
// experience or a feeling the source did not contain, and none may invent detail
// to sound human.

export const VOICES = [
  {
    id: 'humanizer',
    label: 'Humanizer',
    applies: 'both',
    blurb: 'Strip AI tells, filler and template language; keep the writer.',
    instruction:
      'Rewrite so it reads like a careful human wrote it: no template framing, no stock AI vocabulary, no summary that repeats what was just said, no triads padded for rhythm, no run-up that announces the point instead of making it. Keep the writer visible — a plain sentence stays plain; do not dress it up.'
  },
  {
    id: 'product',
    label: 'Product strings',
    applies: 'app',
    blurb: 'UI copy: grammar, cadence, one idea a control can hold.',
    instruction:
      'Fix grammar and English cadence the way product copy needs it: a button names its action, a label names what it holds, a hint explains one thing, an error says what happened and what to do next. One idea per string, no build words from outside the product (px, flags, chrome, file names, internal ids).'
  },
  {
    id: 'short',
    label: 'Short pass',
    applies: 'both',
    blurb: 'The compact tell list: contrast, hedges, triads, stock words.',
    instruction:
      'Apply the compact tell list only: kill emphasis by contrast, closing lines that summarise, stacked hedges, forced triads, hyphenated compounds after the noun, promotional adjectives, grander verbs where is or has would do, and sentences in a row that open the same way. Leave everything else alone.'
  },
  {
    id: 'simple',
    label: 'Simple English',
    applies: 'both',
    blurb: 'One idea per sentence, plain words, exact technical terms.',
    instruction:
      'Write for a reader who is not a native speaker of English: one idea per sentence, active voice unless the actor is unknown, plain Tier 1 words where a technical term is not the point, and no nesting. Keep every technical term, unit and range exactly as it is.'
  },
  {
    id: 'prose',
    label: 'Prose',
    applies: 'docs',
    blurb: 'Documents: coherence, argument, opening with the new fact.',
    instruction:
      'Treat it as reader-facing prose: put the fact the reader needs first, keep related reasoning connected in complete sentences, cut ceremony, and do not restate the heading in the first sentence or end on a moral. Keep the paragraph shape unless the thought asks for a different one.'
  }
]

const PROFILE_NOTE = [
  '',
  'The writer’s own profile follows. Follow it for cadence, stance and word choice. It never licenses a new fact, and where it describes long documents, headings or tables, take the part that applies to a single UI string and ignore the rest.'
]

/** Shared guardrails: every voice subtracts, none of them invents. */
export const VOICE_RULES = [
  '- Subtraction and sharpening only. Every word you add must be supported by the source.',
  '- Never invent experience, opinions, feelings, quotations, numbers, names or specifics to sound human.',
  '- Keep force-bearing words (never, must, all) and approximations (about 50%) exactly as strong as they are.',
  '- Keep placeholders, keyboard shortcuts, paths, product names and punctuation the source uses on purpose.',
  '- If the string already reads well, return it unchanged.'
]

export function voiceFor(id) {
  return VOICES.find((voice) => voice.id === id) ?? VOICES[0]
}

export function voiceList() {
  return VOICES.map((voice) => ({ id: voice.id, label: voice.label, blurb: voice.blurb, applies: voice.applies }))
}

/** The block appended to a humanize system prompt. */
export function voiceBlock({ voice, profile }) {
  const chosen = voiceFor(voice)
  const lines = ['', `Task for this pass: rewrite in the ${chosen.label} voice. ${chosen.instruction}`, '', 'Voice rules:', ...VOICE_RULES]
  if (profile && profile.trim()) lines.push(...PROFILE_NOTE, '', profile.trim())
  return lines.join('\n')
}
