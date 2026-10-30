export type StandardTag = {
  id: string
  label: string
  group: string
  groupLabel: string
}

export type TagGroup = {
  id: string
  label: string
  tags: Array<[string, string]>
}

export declare const TAG_GROUPS: TagGroup[]
export declare const STANDARD_TAGS: StandardTag[]
export declare const TAG_ALIASES: Record<string, string>
export declare function normalizeTag(value: unknown): string
export declare function readTags(value: unknown): string[]
export declare function isStandardTag(id: string): boolean
export declare function tagLabel(id: string): string
export declare function tagGroup(id: string): string
export declare function canonicalTag(id: string): string
export declare function customTagsIn(rows: Array<{ tags?: string[] }> | undefined): string[]
