// The user's writing profile, read from disk at request time.
//
// This tool carries its own copy of the humanizer family, separate from Hermes,
// so the parts can be named for what they are here: the profile is the user's,
// the file is theirs, and nothing about it is committed. It stays outside this
// repository — the server reads the file it is pointed at and never ships a copy.
// A missing file is a supported state: the switch reports it and the pass runs
// without a profile, which is not an error.
import { existsSync, readFileSync, statSync } from 'node:fs'

/** Where to look when the operator has not chosen a path. */
export const DEFAULT_PROFILE_PATH = 'C:/git/self-profile/profile/operational.md'

/** A short UI string needs the habits, not the whole study with its links. */
const MAX_CHARS = 4000

let cache = { path: '', mtime: 0, text: '', chars: 0, present: false }

function trimToParagraph(text) {
  if (text.length <= MAX_CHARS) return text
  const cut = text.slice(0, MAX_CHARS)
  const boundary = cut.lastIndexOf('\n\n')
  return (boundary > MAX_CHARS * 0.5 ? cut.slice(0, boundary) : cut).trim()
}

/** Drop the version history and the link ledger; keep the habits and the rules. */
function keepTheRules(text) {
  const start = text.search(/##\s+Apply in every voice/i)
  const body = start > 0 ? text.slice(start) : text
  return body
    .split('\n')
    .filter((line) => !/^\s*\[.*\]\(.*\)/.test(line) || line.includes('|'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Returns the profile for the prompt plus what the UI needs to report it.
 * Cached against mtime so an edited profile is picked up without a restart.
 */
export function userProfile(path = '') {
  const file = String(path || DEFAULT_PROFILE_PATH).trim()
  if (!file || !existsSync(file)) {
    cache = { path: file, mtime: 0, text: '', chars: 0, present: false }
    return { ...cache, path: file }
  }
  const mtime = statSync(file).mtimeMs
  if (cache.path === file && cache.mtime === mtime) return cache
  const raw = readFileSync(file, 'utf8')
  const text = trimToParagraph(keepTheRules(raw))
  cache = { path: file, mtime, text, chars: text.length, present: Boolean(text) }
  return cache
}

/** The shape sent to the browser: never the profile body. */
export function userProfileSummary(path = '') {
  const profile = userProfile(path)
  return { path: profile.path, present: profile.present, chars: profile.chars }
}
