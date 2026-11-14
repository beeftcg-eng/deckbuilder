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
export const CARDS = [legend, ...UNITS, bf(1), bf(2), bf(3)]
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
export async function seedRiftbound(page: Page) {
  await page.goto('./')
  await page.evaluate(
    async ({ cards, deck }) => {
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
      await put('settings', 'app', { tourSeen: true, lastGameId: 'riftbound', lastDeckId: 'd1' })
      await put('decks', 'd1', deck)
    },
    { cards: CARDS, deck: DECK },
  )
  await page.reload()
}
