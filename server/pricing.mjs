// Port of Lingarr Next's LlmPricingCatalog: USD per million tokens.
// Providers without a published rate return null and the UI shows tokens only.

const OPENAI = [
  [/gpt-5\.6-sol|^gpt-5\.6$/, 5, 30],
  [/gpt-5\.6-terra/, 2.5, 15],
  [/gpt-5\.6-luna/, 1, 6],
  [/gpt-5-nano/, 0.05, 0.4],
  [/gpt-5-mini/, 0.25, 2],
  [/^gpt-5/, 1.25, 10],
  [/gpt-4\.1-nano/, 0.1, 0.4],
  [/gpt-4\.1-mini/, 0.4, 1.6],
  [/^gpt-4\.1/, 2, 8],
  [/gpt-4o-mini/, 0.15, 0.6],
  [/^gpt-4o|^chatgpt-4o/, 2.5, 10],
  [/^gpt-3\.5-turbo/, 0.5, 1.5],
  [/^gpt-4$|^gpt-4-/, 30, 60]
]

const DEEPSEEK = [
  [/deepseek-v4-flash/, 0.14, 0.28],
  [/deepseek-v4-pro/, 0.435, 0.87]
]

const ANTHROPIC = [
  [/fable-5|mythos-5/, 10, 50],
  [/opus-5|opus-4-8|opus-4-7|opus-4-6|opus-4-5/, 5, 25],
  [/opus/, 15, 75],
  [/sonnet/, 3, 15],
  [/haiku-4-5/, 1, 5],
  [/haiku-3-5/, 0.8, 4],
  [/haiku-3/, 0.25, 1.25]
]

const TABLES = { openai: OPENAI, deepseek: DEEPSEEK, anthropic: ANTHROPIC }

export function estimateCost(provider, model, inputTokens, outputTokens) {
  if (!model) return null
  if (provider === 'openrouter' && model === 'openrouter/free') return 0
  const table = TABLES[String(provider).toLowerCase()]
  if (!table) return null
  const slug = String(model).trim().toLowerCase()
  const hit = table.find(([pattern]) => pattern.test(slug))
  if (!hit) return null
  return (inputTokens * hit[1]) / 1_000_000 + (outputTokens * hit[2]) / 1_000_000
}
