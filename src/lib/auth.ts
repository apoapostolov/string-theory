import type { ConfigPayload } from '../types'

export type AuthMode = 'key' | 'oauth'

/**
 * The credential path a provider is set to use right now.
 *
 * Returns null when the provider has no sign-in, because then there is no
 * choice to present and the key options are the only ones that exist. An
 * explicit choice wins; otherwise a saved session means sign-in and its absence
 * means key.
 */
export function authModeFor(providerId: string | undefined, payload: ConfigPayload | null): AuthMode | null {
  if (!providerId) return null
  const provider = payload?.oauth.providers.find((entry) => entry.id === providerId)
  if (!provider) return null

  const explicit = payload?.config.authModes?.[providerId]
  if (explicit === 'key' || explicit === 'oauth') return explicit

  return payload?.oauth.sessions?.[providerId]?.present ? 'oauth' : 'key'
}
