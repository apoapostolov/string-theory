export type FontMetrics = {
  family: string
  size: number
  weight: number
  letterSpacing: number
}

export type ParsedRow = {
  key: string
  id: string
  source: string
  where: string
  maxPx: number | null
  maxChars: number | null
}

export type ParsedFile = {
  name: string
  app: string
  context: string
  font: FontMetrics
  rows: ParsedRow[]
  warnings: string[]
}

export type Row = ParsedRow & {
  text: string
  ai: boolean
  busy: boolean
  error: string | null
}

export type ProviderInfo = {
  id: string
  label: string
  endpoint: string
  needsKey: boolean
  hint: string
  models: string[]
  kind: 'openai' | 'anthropic' | 'gemini'
}

export type UsageBucket = {
  requests: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  unpriced: number
}

export type UsageSummary = {
  day: UsageBucket
  month: UsageBucket
  byProvider: Record<string, UsageBucket>
  recent: Array<{
    id: string
    ts: string
    provider: string
    model: string
    mode: string
    stringId: string
    inputTokens: number
    outputTokens: number
    costUsd: number | null
    ms: number
  }>
}

export type ModeId = 'grammar' | 'style' | 'fit'

export type Config = {
  activeProvider: string | null
  model: string
  mode: ModeId
  warnRatio: number
  dailyUsd: number
  monthlyUsd: number
  endpoints: Record<string, string>
  polishPrompt: string
  contextLine: boolean
}

export type ConfigPayload = {
  config: Config
  providers: ProviderInfo[]
  keys: Record<string, { present: boolean; hint: string }>
  usage: UsageSummary
  modes: Array<{ id: ModeId; label: string; instruction: string }>
}

export type Fit = 'ok' | 'near' | 'over' | 'none'

export type Workspace = {
  file: Omit<ParsedFile, 'rows'> & { rows?: never }
  rows: Row[]
  savedAt: string
}
