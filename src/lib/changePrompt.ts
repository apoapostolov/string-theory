// Typed face of the change prompt. The generator lives in shared/ so it can be
// tested without a browser and read by any script that needs the same lines.
export { quoted, sectionOf, areaOf, roleOf, changeLine, buildChangePrompt } from '../../shared/change-prompt.mjs'
export type { ChangePromptOptions, ChangePromptResult, ChangePromptRow } from '../../shared/change-prompt.mjs'
