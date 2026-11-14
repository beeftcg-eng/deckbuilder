import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * Playing a friend online, end to end: a host and a guest in two separate browsers, each with their
 * own Riftbound deck, against a stand-in for the Supabase functions (the same four, in memory, as
 * scripts/pawmodoro-migration-2026-11-14-practice-online.sql defines them).
 */

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
const UNITS = Array.from({ length: 10 }, (_, i) => unit(i))
const CARDS = [legend, ...UNITS, bf(1), bf(2), bf(3)]
const DECK = {
  id: 'd1',
  gameId: 'riftbound',
  name: 'Fury Fighters',
  formatId: 'constructed',
  zones: { legend: [{ cardId: legend.id, quantity: 1 }], main: UNITS.map((u) => ({ cardId: u.id, quantity: 4 })), battlefields: [1, 2, 3].map((i) => ({ cardId: `riftbound:bf${i}`, quantity: 1 })) },
  freeTextZones: { runes: [{ label: 'Fury', quantity: 12 }] },
  createdAt: '',
  updatedAt: '',
}

type Game = { host_secret: string; guest_secret: string | null; host_name: string; guest_name: string | null; host_deck: unknown; guest_deck: unknown; seq: number; state: string | null }
const games = new Map<string, Game>()

async function open(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.route(
    (u) => u.hostname !== 'localhost',
    (route) => {
      const url = route.request().url()
      const fn = url.split('/rpc/')[1]
      if (!fn) return route.fulfill({ status: 404, body: '' })
      const b = JSON.parse(route.request().postData() ?? '{}')
      const g = games.get(b.p_code)
      const allowed = g && (g.host_secret === b.p_secret || g.guest_secret === b.p_secret)
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      if (fn === 'deckbuilder_practice_create') {
        games.set(b.p_code, { host_secret: b.p_secret, guest_secret: null, host_name: b.p_name, guest_name: null, host_deck: b.p_deck, guest_deck: null, seq: 0, state: null })
        return json(null)
      }
      if (fn === 'deckbuilder_practice_join' && g) {
        Object.assign(g, { guest_secret: b.p_secret, guest_name: b.p_name, guest_deck: b.p_deck })
        return json({ host_name: g.host_name, host_deck: g.host_deck })
      }
      if (fn === 'deckbuilder_practice_get' && allowed) return json({ seq: g!.seq, state: g!.seq > b.p_since ? g!.state : null, host_name: g!.host_name, guest_name: g!.guest_name, guest_deck: g!.guest_deck })
      if (fn === 'deckbuilder_practice_push' && allowed) {
        if (g!.seq !== b.p_seq) return json(-1)
        g!.seq += 1
        g!.state = b.p_state
        return json(g!.seq)
      }
      return route.fulfill({ status: 404, body: '' })
    },
  )
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
  await page.getByRole('button', { name: /Practice/ }).first().click()
  await page.getByRole('button', { name: /Play a game/ }).click()
  await page.getByRole('dialog', { name: 'Practice game' }).locator('select').first().selectOption('online')
  return page
}

test('two friends play a Riftbound game online', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'One size is enough for the protocol.')
  test.setTimeout(90_000)
  const host = await open(browser)
  await host.getByLabel('Your name').fill('Ann')
  await host.getByRole('button', { name: 'Start a game' }).click()
  const codeText = await host.getByText(/Give your friend this code/).textContent()
  const code = /code: ([A-Z0-9]{6})/.exec(codeText ?? '')![1]

  const guest = await open(browser)
  await guest.getByLabel('Your name').fill('Bo')
  await guest.getByLabel('Their code').fill(code)
  await guest.getByRole('button', { name: 'Join' }).click()

  // Both keep their hands at the same moment (the moves cross and are put together).
  await Promise.all([host.getByRole('button', { name: 'Keep', exact: true }).click(), guest.getByRole('button', { name: 'Keep', exact: true }).click()])
  // Who goes first is random: whoever sees "Your turn 1" takes it.
  await expect(host.locator('.rb-topbar strong')).toHaveText(/turn 1/, { timeout: 10_000 })
  const hostFirst = /Your turn/.test((await host.locator('.rb-topbar strong').textContent()) ?? '')
  const [first, second] = hostFirst ? [host, guest] : [guest, host]
  const [firstName, secondName] = hostFirst ? ['Ann', 'Bo'] : ['Bo', 'Ann']
  await expect(second.getByText(`${firstName}’s turn 1`).first()).toBeVisible({ timeout: 10_000 })
  await first.getByRole('button', { name: 'Start of turn' }).click()
  await first.getByLabel('Your hand').getByRole('button').first().click()
  await first.getByRole('button', { name: /^Play \(/ }).first().click()
  // The other player sees that unit in the first player's base, on the other side of the board.
  await expect(second.getByLabel(`${firstName}’s base`).locator('.rb-unit')).toHaveCount(1, { timeout: 10_000 })
  await first.getByRole('button', { name: 'End turn' }).click()
  await expect(second.getByText(/Your turn 1/).first()).toBeVisible({ timeout: 10_000 })
  await expect(first.getByText(`${secondName}’s turn 1`).first()).toBeVisible({ timeout: 10_000 })
})
