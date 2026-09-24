import type { Binder, Card, Collection, Deck, WishlistEntry } from './types'

/**
 * Card ids can change when the card data is re-synced: v0.12.0 changed how Yu-Gi-Oh printings that share
 * a passcode get unique ids (see uniquifyCardIds - `<passcode>~<set>~<rarity>` instead of `<passcode>~<set>`
 * plus a `~2`/`~3` counter) and started dropping YGOPRODeck's duplicate printings, so decks, binders, the
 * collection and the wishlist saved against the old ids found nothing after "Update card data": the deck
 * view listed them as "Unknown card" and binders silently hid them. The data was never deleted - these
 * functions point each stale id at the current printing it meant, so it all comes back.
 *
 * Only Yu-Gi-Oh ids are repaired (the only game whose id scheme changed); other games' stale ids are left
 * exactly as they are, never dropped.
 */

const YGO_ID = /^yugioh:(\d+)(?:~([^~]+)(?:~(.+))?)?$/

/** The current id a stale Yu-Gi-Oh id most likely meant, or null when the card is gone entirely. */
function repairYugiohId(staleId: string, byPasscode: Map<string, Card[]>): string | null {
  const m = YGO_ID.exec(staleId)
  if (!m) return null
  const [, passcode, setId, rest] = m
  const printings = byPasscode.get(passcode)
  if (!printings?.length) return null
  const plainId = `yugioh:${passcode}`
  const regular = printings.find((c) => c.id === plainId) ?? printings[0]
  if (!setId) return regular.id
  const sameSet = printings.filter((c) => c.setId === setId)
  if (!sameSet.length) return regular.id

  if (rest == null || /^\d+$/.test(rest)) {
    // The old scheme: the regular printing kept the plain id; the others in that set got `~SET`, then
    // `~SET~2`, `~SET~3`... in the order the card data lists them - which is still the order here.
    const others = sameSet.filter((c) => c.id !== plainId)
    const index = rest == null ? 0 : Number(rest) - 1
    return (others[index] ?? others[0] ?? sameSet[0]).id
  }
  // The current scheme (`~SET~Rarity`, maybe with a counter) for a printing that has since changed id.
  const rarity = rest.replace(/~\d+$/, '').toLowerCase()
  return (sameSet.find((c) => (c.rarity ?? 'none').toLowerCase() === rarity) ?? sameSet[0]).id
}

/** stale id -> current id, for every id in `storedIds` that the catalog no longer has but can resolve. */
export function staleIdRepairs(storedIds: Iterable<string>, catalog: Card[]): Map<string, string> {
  const known = new Set(catalog.map((c) => c.id))
  const byPasscode = new Map<string, Card[]>()
  for (const card of catalog) {
    if (card.gameId !== 'yugioh') continue
    const list = byPasscode.get(card.sourceId)
    if (list) list.push(card)
    else byPasscode.set(card.sourceId, [card])
  }
  const repairs = new Map<string, string>()
  for (const id of new Set(storedIds)) {
    if (known.has(id) || !id.startsWith('yugioh:')) continue
    const current = repairYugiohId(id, byPasscode)
    if (current && current !== id) repairs.set(id, current)
  }
  return repairs
}

/** Every card id a person's saved data refers to. */
export function storedCardIds(data: Pick<RepairableData, 'decks' | 'binders' | 'collection' | 'wishlist'>): string[] {
  return [
    ...data.decks.flatMap((d) => Object.values(d.zones).flatMap((entries) => entries.map((e) => e.cardId))),
    ...data.binders.flatMap((b) => Object.keys(b.cards)),
    ...Object.keys(data.collection),
    ...data.wishlist.map((e) => e.cardId),
  ]
}

export interface RepairableData {
  decks: Deck[]
  binders: Binder[]
  collection: Collection
  forTrade: string[]
  wishlist: WishlistEntry[]
}

export interface RepairResult {
  data: RepairableData
  /** Decks/binders that changed (to save and sync). */
  changedDeckIds: string[]
  changedBinderIds: string[]
  /** Collection/wishlist quantities that changed, including stale ids going to 0 (for sync). */
  collectionChanges: { cardId: string; quantity: number }[]
  wishlistChanges: { cardId: string; quantity: number }[]
  forTradeChanges: { cardId: string; forTrade: boolean }[]
  /** How many stored references were pointed at a current card. */
  repaired: number
}

/**
 * Applies `repairs` everywhere. When a stale id lands on a card that is already there (two old printings
 * that now resolve to one, or one already re-added), the copies are added together rather than one set
 * being dropped - these are real copies someone recorded, and losing them silently is the bug being fixed.
 * Deck `updatedAt` is left alone: this isn't an edit.
 */
export function applyIdRepairs(input: RepairableData, repairs: Map<string, string>): RepairResult {
  const fix = (id: string) => repairs.get(id) ?? id
  let repaired = 0
  const changedDeckIds: string[] = []
  const changedBinderIds: string[] = []

  const decks = input.decks.map((deck) => {
    let changed = false
    const zones: Deck['zones'] = {}
    for (const [zoneId, entries] of Object.entries(deck.zones)) {
      const merged = new Map<string, number>()
      for (const { cardId, quantity } of entries) {
        const id = fix(cardId)
        if (id !== cardId) {
          changed = true
          repaired++
        }
        merged.set(id, (merged.get(id) ?? 0) + quantity)
      }
      zones[zoneId] = [...merged].map(([cardId, quantity]) => ({ cardId, quantity }))
    }
    if (!changed) return deck
    changedDeckIds.push(deck.id)
    const iconCardId = deck.iconCardId ? fix(deck.iconCardId) : deck.iconCardId
    return { ...deck, zones, ...(iconCardId ? { iconCardId } : {}) }
  })

  const binders = input.binders.map((binder) => {
    if (!Object.keys(binder.cards).some((id) => repairs.has(id))) return binder
    const cards: Binder['cards'] = {}
    for (const [cardId, quantity] of Object.entries(binder.cards)) {
      const id = fix(cardId)
      if (id !== cardId) repaired++
      cards[id] = (cards[id] ?? 0) + quantity
    }
    changedBinderIds.push(binder.id)
    return { ...binder, cards }
  })

  const collection: Collection = {}
  const collectionChanges: RepairResult['collectionChanges'] = []
  for (const [cardId, quantity] of Object.entries(input.collection)) {
    const id = fix(cardId)
    collection[id] = (collection[id] ?? 0) + quantity
    if (id !== cardId) {
      repaired++
      collectionChanges.push({ cardId, quantity: 0 })
    }
  }
  for (const id of new Set(collectionChanges.map((c) => fix(c.cardId)))) collectionChanges.push({ cardId: id, quantity: collection[id] })

  const forTradeChanges: RepairResult['forTradeChanges'] = []
  const forTrade = [...new Set(input.forTrade.map((cardId) => {
    const id = fix(cardId)
    if (id !== cardId) forTradeChanges.push({ cardId, forTrade: false }, { cardId: id, forTrade: true })
    return id
  }))]

  const wishlist: WishlistEntry[] = []
  const wishlistChanges: RepairResult['wishlistChanges'] = []
  for (const entry of input.wishlist) {
    const id = fix(entry.cardId)
    if (id !== entry.cardId) {
      repaired++
      wishlistChanges.push({ cardId: entry.cardId, quantity: 0 })
    }
    const existing = wishlist.find((e) => e.cardId === id)
    if (existing) existing.quantity += entry.quantity
    else wishlist.push(id === entry.cardId ? entry : { ...entry, cardId: id })
  }
  for (const id of new Set(wishlistChanges.map((c) => fix(c.cardId)))) {
    wishlistChanges.push({ cardId: id, quantity: wishlist.find((e) => e.cardId === id)?.quantity ?? 0 })
  }

  return {
    data: { decks, binders, collection, forTrade, wishlist },
    changedDeckIds,
    changedBinderIds,
    collectionChanges,
    wishlistChanges,
    forTradeChanges,
    repaired,
  }
}
