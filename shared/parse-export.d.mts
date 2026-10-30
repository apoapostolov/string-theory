import type { FontMetrics, ImportIssue, ParsedFile } from '../src/types'

export declare const FORMAT_ID: string
export declare const DEFAULT_FONT: FontMetrics
export declare function num(value: unknown): number | null
export declare function str(value: unknown): string
export declare function parseExport(raw: unknown, name: string): ParsedFile

export type { ImportIssue }
