// Typed face of the shared tag vocabulary. The vocabulary itself lives in
// shared/ so the parser, the app and the validator agree on every spelling.
export {
  TAG_GROUPS,
  STANDARD_TAGS,
  TAG_ALIASES,
  normalizeTag,
  readTags,
  isStandardTag,
  tagLabel,
  tagGroup,
  canonicalTag,
  customTagsIn
} from '../../shared/tags.mjs'
export type { StandardTag, TagGroup } from '../../shared/tags.mjs'
