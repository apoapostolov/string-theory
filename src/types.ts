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
  /** Width one line may occupy before it wraps. */
  maxPxPerLine: number | null
  /** How many lines the layout gives the string. */
  maxLines: number
  /** maxPxPerLine × maxLines, or the declared total when there is no line budget. */
  maxPxTotal: number | null
  maxChars: number | null
  /** What the string does: one or several tags from the shared vocabulary. */
  tags: string[]
  /** A free note from the export, shown with the row's details. */
  note: string
  /** Measurement override for a string that does not use the file font. */
  font: FontMetrics | null
}

export type ImportIssue = {
  level: 'warn' | 'error'
  code:
    | 'no-strings'
    | 'unknown-format'
    | 'entry-skipped'
    | 'missing-id'
    | 'missing-text'
    | 'duplicate-id'
    | 'bad-default-max-px'
    | 'bad-max-px'
    | 'bad-max-lines'
    | 'inconsistent-max-px'
    | 'bad-max-chars'
    | 'no-max-px'
    | 'partial-max-px'
    | 'no-font'
    | 'bad-font-size'
    | 'bad-tags'
    | 'no-tags'
    | 'long-text'
  message: string
}

export type ParsedFile = {
  name: string
  app: string
  context: string
  font: FontMetrics
  /** Format id the file claims, or the one this build assumes. */
  version: string
  rows: ParsedRow[]
  /** Everything the import had to repair, in the order a reader wants it. */
  issues: ImportIssue[]
}

export type RowState = 'normal' | 'wip' | 'done'

export type Row = ParsedRow & {
  text: string
  ai: boolean
  busy: boolean
  error: string | null
  /** Workflow state: untouched, being rewritten, or finished. */
  state: RowState
}

export type FileMeta = {
  name: string
  app: string
  context: string
  font: FontMetrics
  /** Format id the file claims, or the one this build assumes. */
  version: string
  /** Everything the import had to repair. */
  issues: ImportIssue[]
}

/** One export found in the inbox folder, described without opening it. */
export type InboxEntry = {
  id: string
  name: string
  group: string
  bytes: number
  mtime: number
  app: string
  version: string
  count: number
  errors: number
  warnings: number
  broken: string
}

export type InboxListing = {
  dir: string
  exists: boolean
  files: InboxEntry[]
}

export type DocumentProgress = {
  done: number
  wip: number
  total: number
  percent: number
}

/** One source/rewrite pair the style analyst learns from. */
export type StylePair = {
  id: string
  where: string
  original: string
  rewrite: string
}

export type StyleProfile = {
  markdown: string
  path: string
  name: string
  pairs: number
  provider: string
  model: string
  usage: { inputTokens: number; outputTokens: number; costUsd: number | null; ms: number }
}

export type ProfileEntry = {
  name: string
  app: string
  pairs: number
  model: string
  created: string
  bytes: number
}

/** A working set kept in the browser for one file. */
export type DocumentRecord = {
  id: string
  label: string
  fileName: string
  origin: 'inbox' | 'file'
  path: string
  meta: FileMeta
  rows: Row[]
  savedAt: string
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
  inboxDir: string
  styleDir: string
  authModes: Record<string, 'key' | 'oauth'>
}

export type OAuthProvider = {
  id: string
  label: string
  kind: 'device' | 'codex' | 'authorize' | 'token'
  note: string
  allowsTokenImport: boolean
}

/** A browser sign-in: the provider shows a code, the operator pastes it back. */
export type AuthorizeStart = {
  flowId: string
  url: string
  expiresAt: string
}

export type OAuthSession = {
  present: boolean
  expiresAt: string
  account: string
  mode: string
}

export type DeviceStart = {
  flowId: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  interval: number
  expiresAt: string
}

export type DevicePoll = {
  status: 'pending' | 'connected' | 'expired' | 'denied' | 'error'
  message?: string
  interval?: number
  account?: string
  expiresAt?: string
}

export type ConfigPayload = {
  config: Config
  providers: ProviderInfo[]
  keys: Record<string, { present: boolean; hint: string }>
  usage: UsageSummary
  modes: Array<{ id: ModeId; label: string; instruction: string }>
  inbox: { dir: string }
  profiles: { dir: string }
  oauth: { providers: OAuthProvider[]; sessions: Record<string, OAuthSession> }
}

export type Fit = 'ok' | 'near' | 'over' | 'none'

export type Workspace = {
  file: Omit<ParsedFile, 'rows'> & { rows?: never }
  rows: Row[]
  savedAt: string
}
