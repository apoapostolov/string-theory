// Prompt building for the grammar and style polisher.
// The model never measures pixels; it gets a character budget derived from the
// measured pixel budget, and the client re-measures the answer.

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

export function buildPrompt({ item, mode, app, font, contextLine, extraPrompt }) {
  const setting = getMode(mode)
  const tags = Array.isArray(item.tags) ? item.tags.filter((tag) => typeof tag === 'string' && tag) : []
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
    '- If the original already reads well and fits the budget, return it unchanged.',
    '',
    `Task for this pass: ${setting.instruction}`
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
