import type { Card } from './types'
import { resolveDbImgUrl } from './dbImgUrl'

/**
 * Picking which artwork a Yu-Gi-Oh printing shows. YGOPRODeck lists every official artwork of a card
 * (Blue-Eyes White Dragon has eight) but not which printing uses which, so every printing shows the
 * first one and the rest were only thumbnails in the card details. Choosing one for a printing makes
 * it that printing's image everywhere (browser, decks, binders, deck pictures) - applied to the
 * catalog, so every view follows without knowing about it.
 *
 * Choices are keyed by the printing itself (passcode, printed code, rarity), not the card id: ids have
 * changed before (see cardIdRepair.ts) and a choice shouldn't be lost with them.
 */

// dbimg://ygo/full/<id>.jpg on desktop; the phone app resolves those to YGOPRODeck's own URLs.
const ART_URL = /^(?:dbimg:\/\/ygo\/(?:full|small)|https:\/\/images\.ygoprodeck\.com\/images\/cards(?:_small)?)\/(\d+)\.jpg$/

/** An artwork's image URL in the same style (dbimg:// or resolved) as the card already uses. */
export function artUrl(card: Card, artId: string, size: 'full' | 'small'): string {
  const url = `dbimg://ygo/${size}/${artId}.jpg`
  return card.imageUrl?.startsWith('dbimg:') ? url : resolveDbImgUrl(url)
}

export function printingKey(card: Card): string {
  return `${card.sourceId}|${card.setCode}-${card.number}|${card.rarity ?? ''}`
}

function artIdOf(url: string | null | undefined): string | null {
  return url ? (ART_URL.exec(url)?.[1] ?? null) : null
}

/** Every artwork id this printing can show: the default (first-listed) one, then the others in number
 * order (YGOPRODeck's artwork ids count up), so the order is the same whichever one is showing. */
export function artworkIds(card: Card): string[] {
  const def = card.defaultArtId ?? artIdOf(card.imageUrl)
  const others = [artIdOf(card.imageUrl), ...(card.altImageUrlsSmall ?? []).map(artIdOf)]
    .filter((id): id is string => !!id && id !== def)
    .sort((a, b) => Number(a) - Number(b))
  return [...new Set([...(def ? [def] : []), ...others])]
}

/** The printing showing `artId` (null = its default art), with the other artworks as its alternates. */
export function withArtwork(card: Card, artId: string | null): Card {
  const ids = artworkIds(card)
  if (ids.length < 2) return card
  const def = ids[0]
  const chosen = artId && ids.includes(artId) ? artId : def
  if (chosen === artIdOf(card.imageUrl) && card.defaultArtId === def) return card
  return {
    ...card,
    defaultArtId: def,
    imageUrl: artUrl(card, chosen, 'full'),
    imageUrlSmall: artUrl(card, chosen, 'small'),
    altImageUrlsSmall: ids.filter((id) => id !== chosen).map((id) => artUrl(card, id, 'small')),
  }
}

/** Applies saved choices to a catalog; returns the same array when there's nothing to apply. */
export function applyArtChoices(cards: Card[], choices: Record<string, string> | undefined): Card[] {
  if (!choices || Object.keys(choices).length === 0) return cards
  let changed = false
  const out = cards.map((card) => {
    if (card.gameId !== 'yugioh') return card
    const choice = choices[printingKey(card)]
    if (!choice) return card
    const next = withArtwork(card, choice)
    if (next !== card) changed = true
    return next
  })
  return changed ? out : cards
}
