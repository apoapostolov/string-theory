// The tag vocabulary an export shares with the tool.
//
// Tags answer the question the layout cannot: what is this string doing? A
// heading and a hint are rewritten differently, reviewed differently, and
// counted separately, so the tag is the unit of focus rather than a decoration.
//
// Standard ids are lowercase and hyphenated. A project may add custom tags for
// its own grouping (settings, checkout, widget) beside them.

export const TAG_GROUPS = [
  {
    id: 'structure',
    label: 'Structure',
    tags: [
      ['page-title', 'Page title'],
      ['heading', 'Heading'],
      ['subheading', 'Subheading'],
      ['section-title', 'Section title'],
      ['overline', 'Overline'],
      ['caption', 'Caption'],
      ['dialog-title', 'Dialog title'],
      ['dialog-body', 'Dialog body']
    ]
  },
  {
    id: 'control',
    label: 'Controls',
    tags: [
      ['label', 'Label'],
      ['placeholder', 'Placeholder'],
      ['button', 'Button text'],
      ['action', 'Action link'],
      ['link', 'Link'],
      ['tab', 'Tab'],
      ['menu-item', 'Menu item'],
      ['dropdown', 'Dropdown text'],
      ['checkbox', 'Checkbox label'],
      ['radio', 'Radio label'],
      ['switch', 'Switch label'],
      ['slider', 'Slider label'],
      ['stepper', 'Stepper label'],
      ['search', 'Search field'],
      ['shortcut', 'Keyboard shortcut']
    ]
  },
  {
    id: 'help',
    label: 'Help and guidance',
    tags: [
      ['hint', 'Hint'],
      ['tooltip', 'Tooltip'],
      ['help-paragraph', 'Help paragraph'],
      ['empty-state', 'Empty state'],
      ['onboarding', 'Onboarding']
    ]
  },
  {
    id: 'feedback',
    label: 'Feedback',
    tags: [
      ['error', 'Error'],
      ['warning', 'Warning'],
      ['success', 'Success'],
      ['info', 'Information'],
      ['status', 'Status'],
      ['toast', 'Toast'],
      ['confirmation', 'Confirmation'],
      ['progress', 'Progress'],
      ['count', 'Count']
    ]
  },
  // Documents: the prose a project ships to its readers. Same vocabulary, other
  // surface: a README, a changelog or a release note has no box to fit, so these
  // strings are judged by the sentence.
  {
    id: 'docs',
    label: 'Documents',
    tags: [
      ['doc-lead', 'Document lead'],
      ['doc-paragraph', 'Document paragraph'],
      ['doc-heading', 'Document heading'],
      ['doc-list-item', 'Document list item'],
      ['doc-table-cell', 'Document table cell'],
      ['doc-link-text', 'Document link text'],
      ['doc-note', 'Document note'],
      ['doc-code-caption', 'Document code caption'],
      ['changelog-entry', 'Changelog entry'],
      ['release-title', 'Release title'],
      ['release-body', 'Release body'],
      ['migration-note', 'Migration note']
    ]
  },
  {
    id: 'navigation',
    label: 'Navigation',
    tags: [
      ['nav-item', 'Navigation item'],
      ['breadcrumb', 'Breadcrumb'],
      ['footer', 'Footer'],
      ['sidebar', 'Sidebar']
    ]
  },
  {
    id: 'data',
    label: 'Data display',
    tags: [
      ['table-header', 'Table header'],
      ['table-cell', 'Table cell'],
      ['column-label', 'Column label'],
      ['filter', 'Filter label'],
      ['sort', 'Sort label'],
      ['summary', 'Summary'],
      ['badge', 'Badge'],
      ['banner', 'Banner']
    ]
  },
  {
    id: 'content',
    label: 'Content',
    tags: [
      ['paragraph', 'Paragraph'],
      ['list-item', 'List item'],
      ['quote', 'Quote'],
      ['legal', 'Legal'],
      ['marketing', 'Marketing'],
      ['accessibility', 'Accessibility text']
    ]
  },
  {
    id: 'literal',
    label: 'Literals',
    tags: [
      ['number-unit', 'Number with unit'],
      ['unit', 'Unit only'],
      ['date-time', 'Date or time'],
      ['variable', 'Contains a variable'],
      ['brand', 'Brand name'],
      ['proper-noun', 'Proper noun'],
      ['code', 'Code or path'],
      ['url', 'URL'],
      ['email', 'Email address']
    ]
  }
]

export const STANDARD_TAGS = TAG_GROUPS.flatMap((group) =>
  group.tags.map(([id, label]) => ({ id, label, group: group.id, groupLabel: group.label }))
)

const BY_ID = new Map(STANDARD_TAGS.map((tag) => [tag.id, tag]))

/** Spellings an agent is likely to produce for a standard tag. */
export const TAG_ALIASES = {
  title: 'heading',
  'screen-title': 'page-title',
  'sub-heading': 'subheading',
  'sub_title': 'subheading',
  subtitle: 'subheading',
  'section-header': 'section-title',
  'section-heading': 'section-title',
  'button-text': 'button',
  buttontext: 'button',
  btn: 'button',
  cta: 'button',
  'menu-item-text': 'menu-item',
  option: 'dropdown',
  select: 'dropdown',
  'dropdown-text': 'dropdown',
  'switch-text': 'switch',
  'toggle-label': 'switch',
  checkbox_label: 'checkbox',
  helper: 'hint',
  'helper-text': 'hint',
  hint_text: 'hint',
  description: 'help-paragraph',
  body: 'paragraph',
  text: 'paragraph',
  message: 'status',
  label_text: 'label',
  'field-label': 'label',
  err: 'error',
  'error-message': 'error',
  'empty': 'empty-state',
  'placeholder-text': 'placeholder',
  'tool-tip': 'tooltip',
  'aria-label': 'accessibility',
  a11y: 'accessibility',
  'screen-reader': 'accessibility',
  tablename: 'table-header',
  'table-head': 'table-header'
}

/** Lowercase, hyphenated, no surrounding noise. */
export function normalizeTag(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

/** A tags field may be an array, a comma list, or a single tag. */
export function readTags(value) {
  if (value === undefined || value === null) return []
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const seen = new Set()
  const out = []
  for (const entry of list) {
    const tag = normalizeTag(entry)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
  }
  return out
}

export function isStandardTag(id) {
  return BY_ID.has(id)
}

/** The display name for a tag, or the tag itself when a project made it up. */
export function tagLabel(id) {
  return BY_ID.get(id)?.label ?? id
}

export function tagGroup(id) {
  return BY_ID.get(id)?.groupLabel ?? 'Custom'
}

/** The standard id an alias points at, when it is one. */
export function canonicalTag(id) {
  const tag = normalizeTag(id)
  if (BY_ID.has(tag)) return tag
  return TAG_ALIASES[tag] ? normalizeTag(TAG_ALIASES[tag]) : tag
}

/** Custom tags first seen in the file, so the picker can offer them. */
export function customTagsIn(rows) {
  const seen = new Set()
  for (const row of rows) {
    for (const tag of row?.tags ?? []) {
      if (!isStandardTag(tag)) seen.add(tag)
    }
  }
  return [...seen].sort()
}
