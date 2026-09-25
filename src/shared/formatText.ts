import { getAdapter } from './games/registry'
import { t } from './i18n'
import type { Format, GameId } from './types'

/**
 * A format's name and description in the current language. Only the app's own default wording is
 * translated: a format whose text was changed (formats.json is editable) shows as it was written.
 */
function translated(gameId: GameId, format: Format): { label?: string; description?: string } {
  const original = getAdapter(gameId).defaultFormats.find((f) => f.id === format.id)
  const text = t.formats[`${gameId}:${format.id}`]
  if (!original || !text) return {}
  return {
    label: format.label === original.label ? text.label : undefined,
    description: format.description === original.description ? text.description : undefined,
  }
}

export function formatLabel(gameId: GameId, format: Format): string {
  return translated(gameId, format).label ?? format.label
}

export function formatDescription(gameId: GameId, format: Format): string | undefined {
  return translated(gameId, format).description ?? format.description
}
