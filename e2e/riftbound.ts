import type { Page } from '@playwright/test'

/** A small Riftbound card pool and deck for the practice-game tests, written into the phone app's database. */
const unit = (i: number) => ({
  id: `riftbound:u${i}`,
  gameId: 'riftbound',
  sourceId: `ogn-${100 + i}`,
  name: `Fighter ${i}`,
  imageUrl: null,
  imageUrlSmall: null,
  orientation: 'portrait',
  setId: 'OGN',
  setName: 'Origins',
  setCode: 'OGN',
  number: String(i),
  rarity: 'Common',
  category: 'Unit',
  subtypes: [],
  colors: ['Fury'],
  cost: '1',
  might: 2,
  text: null,
  legality: null,
})
const legend = { ...unit(90), id: 'riftbound:legend', sourceId: 'ogn-900', name: 'Jinx - Loose Cannon', category: 'Legend', cost: null }
const bf = (i: number) => ({ ...unit(80 + i), id: `riftbound:bf${i}`, sourceId: `ogn-8${i}0`, name: `Field ${i}`, category: 'Battlefield', cost: null })
export const UNITS = Array.from({ length: 10 }, (_, i) => unit(i))
const RUNE_ART = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42"><rect width="30" height="42" fill="#c33"/></svg>')}`
export const RUNE = { ...unit(70), id: 'riftbound:fury-rune', sourceId: 'ogn-700', name: 'Fury Rune', category: 'Rune', cost: null, might: null, imageUrlSmall: RUNE_ART }
export const GUST = {
  ...unit(60),
  id: 'riftbound:gust',
  sourceId: 'ogn-600',
  name: 'Gust',
  category: 'Spell',
  might: null,
  text: "[Reaction] (Play any time, even before spells and abilities resolve.)Return a unit at a battlefield with 3 :rb_might: or less to its owner's hand.",
}
export const CARDS = [legend, ...UNITS, bf(1), bf(2), bf(3), RUNE, GUST]
/** A deck of nothing but Gusts, to answer the bot with (the fighters deck is the bot's). */
export const GUSTS = { id: 'd2', gameId: 'riftbound', name: 'All Gusts', formatId: 'constructed', zones: { legend: [{ cardId: legend.id, quantity: 1 }], main: [{ cardId: GUST.id, quantity: 40 }], battlefields: [1, 2, 3].map((i) => ({ cardId: `riftbound:bf${i}`, quantity: 1 })) }, freeTextZones: { runes: [{ label: 'Fury', quantity: 12 }] }, createdAt: '', updatedAt: '' }
export const DECK = {
  id: 'd1',
  gameId: 'riftbound',
  name: 'Fury Fighters',
  formatId: 'constructed',
  zones: { legend: [{ cardId: legend.id, quantity: 1 }], main: UNITS.map((u) => ({ cardId: u.id, quantity: 4 })), battlefields: [1, 2, 3].map((i) => ({ cardId: `riftbound:bf${i}`, quantity: 1 })) },
  freeTextZones: { runes: [{ label: 'Fury', quantity: 12 }] },
  createdAt: '',
  updatedAt: '',
}


/** Opens the app with the Riftbound pool downloaded and the deck open, tour seen. */
export async function seedRiftbound(page: Page, open: 'd1' | 'd2' = 'd1') {
  await page.goto('./')
  await page.evaluate(
    async ({ cards, deck, gusts, open }) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open('deckbuilder', 2)
        q.onsuccess = () => res(q.result)
        q.onerror = () => rej(q.error)
      })
      const put = (s: string, k: string, v: unknown) =>
        new Promise<void>((res) => {
          const tx = db.transaction(s, 'readwrite')
          tx.objectStore(s).put(v, k)
          tx.oncomplete = () => res()
        })
      await put('cards', 'riftbound', { cards, lastSynced: new Date().toISOString() })
      await put('settings', 'app', { tourSeen: true, lastGameId: 'riftbound', lastDeckId: open })
      await put('decks', 'd1', deck)
      await put('decks', 'd2', gusts)
    },
    { cards: CARDS, deck: DECK, gusts: GUSTS, open },
  )
  await page.reload()
}
