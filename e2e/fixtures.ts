import { test as base, expect, type Page } from '@playwright/test'
import { onepieceAdapter } from '../src/shared/games/onepiece.ts'
import { publishedFormatOf } from '../src/shared/banLists.ts'

/**
 * What the end-to-end tests start from: a small One Piece card pool written straight into the phone
 * app's IndexedDB (as if synced), and every request that would leave the machine answered here, so
 * nothing depends on the network or on today's card data.
 */

interface FixtureCard {
  id: string
  gameId: 'onepiece'
  sourceId: string
  name: string
  imageUrl: null
  imageUrlSmall: null
  orientation: 'portrait'
  setId: string
  setName: string
  setCode: string
  number: string
  rarity: string
  category: string
  subtypes: string[]
  colors: string[]
  cost: string | null
  text: string
  legality: null
  price: number
}

const card = (sourceId: string, name: string, category: string, cost: string | null, price = 0.5): FixtureCard => ({
  id: `onepiece:${sourceId}`,
  gameId: 'onepiece',
  sourceId,
  name,
  imageUrl: null,
  imageUrlSmall: null,
  orientation: 'portrait',
  setId: 'OP-09',
  setName: 'Emperors in the New World',
  setCode: 'OP-09',
  number: sourceId.split('-')[1],
  rarity: 'C',
  category,
  subtypes: [],
  colors: ['Purple'],
  cost,
  text: '',
  legality: null,
  price,
})

export const LEADER = card('OP09-061', 'Monkey.D.Luffy', 'Leader', null, 2)
/** Twelve purple Characters: four of each is 48, plus two of the last makes a legal 50. */
export const CHARACTERS = Array.from({ length: 13 }, (_, i) => card(`OP09-${String(70 + i).padStart(3, '0')}`, `Crew Member ${String.fromCharCode(65 + i)}`, 'Character', String((i % 5) + 1)))
export const CARDS = [LEADER, ...CHARACTERS]

/** A legal deck as the app's own export writes it, for pasting into Import. */
export const DECK_TEXT = [
  `Leader: ${LEADER.sourceId} ${LEADER.name}`,
  '',
  'Main Deck (50/50):',
  ...CHARACTERS.slice(0, 12).map((c) => `4x ${c.sourceId} ${c.name}`),
  `2x ${CHARACTERS[12].sourceId} ${CHARACTERS[12].name}`,
].join('\n')

/** The ban lists file the apps read at launch: One Piece Standard as this version ships it, plus `extraBanned`. */
export function banListsFile(extraBanned: string[] = []) {
  const standard = publishedFormatOf(onepieceAdapter.defaultFormats.find((f) => f.id === 'standard')!)
  return {
    updatedAt: new Date().toISOString(),
    formats: { onepiece: { standard: { ...standard, bannedCardIds: [...standard.bannedCardIds, ...extraBanned] } } },
  }
}

/** Answers for the outside files the app asks for; everything else off this machine gets a 404. */
export type OutsideFiles = Record<string, unknown>

/**
 * Routes every request off this machine to `state.files`. Before the database is seeded they're all
 * 404s: the page loads once to create its database, and a ban list it read then would already count
 * as seen by the time the test starts.
 */
async function routeOutside(page: Page, state: { files: OutsideFiles | null }) {
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) => {
      const url = route.request().url()
      const match = Object.entries(state.files ?? {}).find(([suffix]) => url.endsWith(suffix))
      return match ? route.fulfill({ json: match[1] }) : route.fulfill({ status: 404, body: '' })
    },
  )
}

/** Writes the card pool, settings and decks into the app's database, then reloads it to start from them. */
async function seed(page: Page, data: { settings: object; decks: object[] }, beforeReload: () => void) {
  await page.goto('./')
  await page.evaluate(
    async ({ cards, settings, decks }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('deckbuilder', 2)
        req.onupgradeneeded = () => {
          for (const store of ['decks', 'binders', 'collection', 'forTrade', 'wishlist', 'formats', 'settings', 'sync', 'cards']) {
            if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store)
          }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const put = (store: string, key: string, value: unknown) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(store, 'readwrite')
          tx.objectStore(store).put(value, key)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      await put('cards', 'onepiece', { cards, lastSynced: new Date().toISOString() })
      await put('settings', 'app', settings)
      for (const deck of decks as { id: string }[]) await put('decks', deck.id, deck)
      db.close()
    },
    { cards: CARDS, ...data },
  )
  beforeReload()
  await page.reload()
}

interface Fixtures {
  /** Answers to outside requests; set before `app` with test.use({ outside: … }). */
  outside: OutsideFiles
  /** Decks to start with. */
  startDecks: object[]
  /** Start with the first of them open (as the last deck used). */
  openFirst: boolean
  /** The app, open on One Piece with the card pool downloaded and the tour already seen. */
  app: Page
}

export const test = base.extend<Fixtures>({
  outside: [{ 'banlists.json': banListsFile() }, { option: true }],
  startDecks: [[], { option: true }],
  openFirst: [false, { option: true }],
  app: async ({ page, outside, startDecks, openFirst }, provide) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    if (process.env.E2E_CONSOLE) page.on('console', (m) => console.log(`[page ${m.type()}] ${m.text()}`))
    const routing: { files: OutsideFiles | null } = { files: null }
    await routeOutside(page, routing)
    // A deck to start with is the one open, as if it was the last one used.
    const lastDeckId = openFirst ? ((startDecks[0] as { id?: string } | undefined)?.id ?? null) : null
    await seed(page, { settings: { tourSeen: true, lastGameId: 'onepiece', lastDeckId }, decks: startDecks }, () => {
      routing.files = outside
    })
    await provide(page)
    expect(errors, 'errors thrown in the page').toEqual([])
  },
})

export { expect }

/** A saved deck for the database, with every copy in it. */
export function savedDeck(id: string, name: string, main: [FixtureCard, number][]) {
  const now = new Date().toISOString()
  return {
    id,
    gameId: 'onepiece',
    name,
    formatId: 'standard',
    zones: { leader: [{ cardId: LEADER.id, quantity: 1 }], main: main.map(([c, quantity]) => ({ cardId: c.id, quantity })) },
    freeTextZones: {},
    createdAt: now,
    updatedAt: now,
  }
}

/** The legal deck DECK_TEXT describes, ready to save. */
export const LEGAL_MAIN: [FixtureCard, number][] = [...CHARACTERS.slice(0, 12).map((c): [FixtureCard, number] => [c, 4]), [CHARACTERS[12], 2]]

/** On a phone, most panels are behind the menu; this opens it when it's there. */
export async function openMenu(page: Page) {
  const menu = page.locator('.mobile-nav-menu, [aria-label="Menu"]').first()
  if (await menu.isVisible().catch(() => false)) await menu.click()
}
