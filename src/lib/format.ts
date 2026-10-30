// Typed face of the shared loader. The implementation lives in shared/ so the
// server can use the same parser when it lists the inbox; this module only
// attaches the client's types to it.
import type { ParsedFile } from '../types'
import { parseExport as parse } from '../../shared/parse-export.mjs'

export { FORMAT_ID, DEFAULT_FONT, num, str } from '../../shared/parse-export.mjs'

export function parseExport(raw: unknown, name: string): ParsedFile {
  return parse(raw, name)
}
