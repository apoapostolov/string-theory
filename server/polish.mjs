// Prompt building for the grammar and style polisher.
// The model never measures pixels; it gets a character budget derived from the
// measured pixel budget, and the client re-measures the answer.
//
// The humanize pass shares every budget and placeholder rule with the others and
// adds a voice: which editorial method to apply, and optionally the operator's
// own writing profile.
import { voiceBlock } from '../shared/voices.mjs'

const MODES = {
  grammar: {
    label: 'Grammar',
    temperature: 0.2,
    instruction:
      'Correct grammar, spelling, punctuation and capitalisation only. Keep the wording, tone and any product terms as they are. Do not restyle.'
  },
  style: {
    label: 'Style',
    temperature: 0.5,
    instruction:
      'Rewrite the string so it reads better in the product: clearer, tighter, natural. Keep the same meaning, the same voice, and the same UI register.'
  },
  fit: {
    label: 'Fit',
    temperature: 0.35,
    instruction:
      'Rewrite the string shorter so it fits the width budget without losing meaning. Cut filler and redundancy first. Keep every fact and every product term.'
  },
  // The humanize instruction is not fixed: it comes from the chosen voice, which
  // is why it is appended rather than written here.
  humanize: {
    label: 'Humanize',
    temperature: 0.55,
    instruction: 'Rewrite the string in the chosen voice.'
  }
}

export function modeList() {
  return Object.entries(MODES).map(([id, mode]) => ({ id, label: mode.label, instruction: mode.instruction }))
}

export function getMode(id) {
  return MODES[id] ?? MODES.style
}

export function estimateChars(font, maxPx) {
  const size = Number(font?.size) || 14
  const weight = Number(font?.weight) || 400
  const perChar = size * 0.52 * (weight >= 600 ? 1.06 : 1)
  const hard = Math.max(4, Math.floor(maxPx / perChar))
  return { perChar, hard, comfortable: Math.max(3, Math.floor(hard * 0.94)) }
}

export function buildPrompt({ item, mode, app, font, contextLine, extraPrompt, voice, profile }) {
  // The mode table is keyed by id and the entries carry no id of their own, so
  // resolve it here — `setting.id` used to be undefined, which silently turned a
  // grammar pass on a document into a general rewrite.
  const modeId = MODES[mode] ? mode : 'style'
  const setting = { ...MODES[modeId], id: modeId }
  const voiceTail = setting.id === 'humanize' ? voiceBlock({ voice, profile }) : ''
  const tags = Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string' && tag) : []
  // Prose has no box to fit: a README paragraph is judged by the sentence.
  if (item.surface === 'docs') {
    const system = [
      `You rewrite the documentation a software project ships to its readers${app ? `, for the project ${app}` : ''}.`,
      '',
      'Return exactly one replacement passage and nothing else: no quotes, no markdown fences, no label, no explanation.',
      '',
      'Rules:',
      '- Keep every fact, number, version and claim that the original makes. Add none.',
      '- Copy links, paths, commands, flags, env vars and product names byte for byte.',
      '- Keep the structure: one paragraph stays one paragraph, a bullet stays a bullet, a newline stays a newline.',
      '- Plain declarative sentences. No marketing voice, no exclamation marks, no "simply", "just", "seamlessly", "powerful".',
      '- Cut filler and hedging, merge sentences that repeat themselves, and keep the reader’s next action in view.',
      item.where ? `- The passage sits here: ${item.where}.` : null,
      tags.length
        ? `- Its role is ${tags[0]}${tags.length > 1 ? `, grouped as ${tags.slice(1).join(', ')}` : ''}. Write it the way that role expects: a lead opens, a paragraph explains, a bullet states one thing.`
        : null,
      item.note ? `- Context from the export: ${item.note}` : null,
      contextLine && item.appContext ? `- Project context: ${item.appContext}` : null,
      extraPrompt ? `- Extra instruction from the operator: ${extraPrompt}` : null,
      setting.id === 'humanize'
        ? '- This pass applies a method, so the answer must differ from the source unless the passage is a lone word or a product name. If it already reads well, tighten it rather than returning it.'
        : '- If the passage already reads well, return it unchanged.',
      '',
      voiceTail ||
        `Task for this pass: ${setting.id === 'grammar' ? 'Correct grammar, spelling, punctuation and capitalisation only. Keep the wording.' : 'Rewrite the passage so it reads better: clearer, tighter, honest. Same meaning, same facts, same structure.'}`
    ]
      .filter(Boolean)
      .join('\n')

    const user = [
      `id: ${item.id}`,
      tags.length ? `tags: ${tags.join(', ')}` : null,
      item.where ? `sits at: ${item.where}` : null,
      `current: ${item.text}`,
      `length: ${item.text.length} characters, ${item.text.trim().split(/\s+/).length} words`
    ]
      .filter(Boolean)
      .join('\n')

    return { system, user, temperature: setting.temperature, perChar: 0, hard: 0, comfortable: 0, prose: true }
  }
  const perLine = item.maxPxPerLine ?? item.maxPx ?? 200
  const maxLines = Math.max(1, Number(item.maxLines) || 1)
  // A character budget for the whole string: every line gets the same box.
  const { perChar, hard, comfortable } = estimateChars(font, perLine * maxLines)
  const perLineChars = estimateChars(font, perLine).comfortable
  const fontLine = font
    ? `${font.family} ${font.size}px${font.weight ? ` ${font.weight}` : ''}`
    : 'the app default UI font'

  const system = [
    `You rewrite user interface strings for a desktop application${app ? ` called "${app}"` : ''}.`,
    '',
    'Return exactly one replacement string and nothing else: no quotes, no markdown, no code fences, no label, no explanation.',
    '',
    'Rules:',
    '- Keep the meaning. Never drop information the user needs.',
    '- Copy placeholders, keyboard shortcuts, file paths and product names byte for byte: {0}, {name}, %s, %d, :count, {{value}}, <b>, Ctrl+S, .md.',
    '- Sentence case unless the original used a different casing. No trailing period on buttons, labels or headings.',
    '- Prefer concrete verbs and plain words. Cut filler, hedging and marketing adjectives.',
    '- Never invent features, numbers, prices or states that the original does not state.',
    `- Width budget: the string renders in ${fontLine} and wraps inside a ${perLine}px box, with at most ${maxLines} line${maxLines === 1 ? '' : 's'}.`,
    `- That is about ${perLineChars} characters per line, so no more than ${hard} characters in total. Aim for ${comfortable} or fewer.`,
    maxLines > 1
      ? '- If it wraps, the last line must fill at least 40% of the box and carry at least two words. A one-word last line is a defect, not a fit.'
      : '- Keep it on one line: a wrap is a defect.',
    `- The string is shown here: ${item.where || 'not specified'}.`,
    tags.length
      ? `- Its role is ${tags[0]}${tags.length > 1 ? `, grouped as ${tags.slice(1).join(', ')}` : ''}. Write it the way that role expects: a button is an action, a hint explains, an error says what happened and what to do next.`
      : null,
    item.note ? `- Context from the export: ${item.note}` : null,
    contextLine && item.appContext ? `- Screen context: ${item.appContext}` : null,
    extraPrompt ? `- Extra instruction from the operator: ${extraPrompt}` : null,
    setting.id === 'humanize'
      ? [
          '- This pass applies a method, not a defect report: for a sentence, the answer must differ from the source. Apply the method even where it already reads well — tightening, never restyling.',
          item.text.trim().split(/\s+/).length <= 2
            ? '- This one is a word or a short label, where a different word is a product decision: change it only where the method names a defect, otherwise return it unchanged.'
            : null
        ]
          .filter(Boolean)
          .join('\n')
      : '- If the original already reads well and fits the budget, return it unchanged.',
    '',
    voiceTail || `Task for this pass: ${setting.instruction}`
  ]
    .filter(Boolean)
    .join('\n')

  const measured = item.px ? `, widest line measured at ${Math.round(item.px)}px` : ''
  const chars = item.text.length
  const user = [
    `id: ${item.id}`,
    tags.length ? `tags: ${tags.join(', ')}` : null,
    item.where ? `shown at: ${item.where}` : null,
    `current: ${item.text}`,
    `length: ${chars} characters${measured}, budget ${perLine}px per line${maxLines > 1 ? ` across up to ${maxLines} lines` : ''} (~${hard} characters)`,
    item.maxChars ? `export character limit: ${item.maxChars}` : null
  ]
    .filter(Boolean)
    .join('\n')

  return {
    system,
    user,
    temperature: setting.temperature,
    perChar
  }
}

const FENCE = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/
const LEAD_LABEL = /^(?:new(?: string| value)?|output|result|rewritten(?: string)?)\s*:\s*/i

export function sanitiseOutput(raw, original) {
  let text = String(raw ?? '').trim()

  const fence = text.match(FENCE)
  if (fence) text = fence[1].trim()

  text = text.replace(LEAD_LABEL, '').trim()

  const quotes = ['"', "'", '“', '‘']
  if (text.length > 1) {
    const first = text[0]
    const last = text[text.length - 1]
    const pairs = { '"': '"', "'": "'", '“': '”', '‘': '’' }
    if (quotes.includes(first) && pairs[first] === last && !original?.startsWith(first)) {
      text = text.slice(1, -1).trim()
    }
  }

  text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
  return text
}
