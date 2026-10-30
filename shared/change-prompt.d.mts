export type ChangePromptRow = {
  id: string
  source: string
  text: string
  where?: string
  tags?: string[]
  state?: 'normal' | 'wip' | 'done'
}

export type ChangePromptOptions = {
  app?: string
  group?: boolean
  includeIds?: boolean
  linesOnly?: boolean
}

export type ChangePromptResult = {
  text: string
  lines: string[]
  stats: {
    changed: number
    /** Lines that delete a string: emptied and marked complete. */
    removals: number
    /** Emptied rows still being drafted, left out of the prompt. */
    pending: number
    sections: number
    ambiguous: number
    untagged: number
  }
}

export declare function quoted(text: unknown): string
export declare function sectionOf(row: ChangePromptRow): string
export declare function isRemoval(row: ChangePromptRow & { state?: string }): boolean
export declare function isPendingEmpty(row: ChangePromptRow & { state?: string }): boolean
export declare function areaOf(row: ChangePromptRow): string
export declare function roleOf(row: ChangePromptRow): string
export declare function changeLine(row: ChangePromptRow, options?: { includeIds?: boolean; section?: string }): string
export declare function buildChangePrompt(rows: ChangePromptRow[], options?: ChangePromptOptions): ChangePromptResult
