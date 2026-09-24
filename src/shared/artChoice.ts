import type { Card } from './types'
import { resolveDbImgUrl } from './dbImgUrl'
import { YGO_ART_MAP } from './games/yugiohArtMap'

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

/**
 * The artwork(s) this exact printing is known to have (yugiohArtMap.ts, built from Yugipedia's printing
 * photos), or null when unknown - then every artwork of the card is offered, as before.
 */
export function knownArtIds(card: Card): string[] | null {
  if (card.gameId !== 'yugioh') return null
  // Keyed by printed code + rarity (see the map's generator): the passcode can differ between YGOPRODeck's
  // endpoints, the printing can't. Only ids this card actually has are used (artworkIds filters).
  const ids = YGO_ART_MAP[`${card.setCode}-${card.number}|${card.rarity ?? ''}`]
  return ids?.length ? ids.map(String) : null
}

/** Every artwork id the card has: the default (first-listed) one, then the others in number order
 * (YGOPRODeck's artwork ids count up), so the order is the same whichever one is showing. */
function allArtworkIds(card: Card): string[] {
  const def = card.defaultArtId ?? artIdOf(card.imageUrl)
  const others = [artIdOf(card.imageUrl), ...(card.altImageUrlsSmall ?? []).map(artIdOf)]
    .filter((id): id is string => !!id && id !== def)
    .sort((a, b) => Number(a) - Number(b))
  return [...new Set([...(def ? [def] : []), ...others])]
}

/** The artworks this printing can show: only its own when they're known, otherwise all of the card's.
 * The first is what it shows by default. */
export function artworkIds(card: Card): string[] {
  const all = allArtworkIds(card)
  const known = knownArtIds(card)?.filter((id) => all.includes(id))
  return known?.length ? known : all
}

/** The printing showing its own artwork (the first known one) when that isn't what the card data shows,
 * e.g. Monster Reborn 26LP-EN001's World Championship art instead of the regular one. */
export function withKnownArtwork(card: Card): Card {
  const known = knownArtIds(card)
  if (!known) return card
  const all = allArtworkIds(card)
  const ids = known.filter((id) => all.includes(id))
  if (!ids.length) return card
  const others = all.filter((id) => !ids.includes(id))
  return {
    ...card,
    defaultArtId: ids[0],
    imageUrl: artUrl(card, ids[0], 'full'),
    imageUrlSmall: artUrl(card, ids[0], 'small'),
    // Only this printing's own artworks are alternates; the card's other artworks aren't on it.
    altImageUrlsSmall: [...ids.slice(1), ...others].map((id) => artUrl(card, id, 'small')),
  }
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

/** Gives every printing its own known artwork, then applies saved choices; returns the same array when
 * nothing changes. */
export function applyArtChoices(cards: Card[], choices: Record<string, string> | undefined): Card[] {
  let changed = false
  const out = cards.map((card) => {
    if (card.gameId !== 'yugioh') return card
    let next = withKnownArtwork(card)
    const choice = choices?.[printingKey(card)]
    if (choice) next = withArtwork(next, choice)
    if (next !== card) changed = true
    return next
  })
  return changed ? out : cards
}
