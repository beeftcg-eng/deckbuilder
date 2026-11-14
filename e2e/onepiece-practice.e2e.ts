import { test, expect, type Page } from '@playwright/test'

/** A small One Piece pool and deck for the practice game, written into the phone app's database. */
const base = (id: string, name: string, category: string, cost: string | null, text: string) => ({
  id: `onepiece:${id}`,
  gameId: 'onepiece',
  sourceId: id,
  name,
  imageUrl: null,
  imageUrlSmall: null,
  orientation: 'portrait',
  setId: 'OP-01',
  setName: 'Romance Dawn',
  setCode: 'OP-01',
  number: id.slice(-3),
  rarity: 'C',
  category,
  subtypes: [],
  colors: ['Red'],
  cost,
  text,
  legality: null,
})
const LEADER = base('OP01-001', 'Roronoa Zoro (001)', 'Leader', null, 'Power: 5000\nLife: 4\nAttribute: Slash')
const CHARS = [1, 2, 3, 4, 5].map((c) =>
  base(`OP01-01${c}`, `Pirate ${c}`, 'Character', String(c), `Power: ${(c + 1) * 1000}\nCounter: 1000\n${c === 3 ? '[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)' : c === 4 ? '[Rush]' : ''}`),
)
const COUNTER = base('OP01-029', 'Radical Beam!!', 'Event', '1', '[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle.')
const CARDS = [LEADER, ...CHARS, COUNTER]
const DECK = {
  id: 'op1',
  gameId: 'onepiece',
  name: 'Red Pirates',
  formatId: 'standard',
  zones: { leader: [{ cardId: LEADER.id, quantity: 1 }], main: [...CHARS, COUNTER].map((c) => ({ cardId: c.id, quantity: c === COUNTER ? 5 : 9 })) },
  freeTextZones: {},
  createdAt: '',
  updatedAt: '',
}

async function seed(page: Page) {
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
      await put('cards', 'onepiece', { cards, lastSynced: new Date().toISOString() })
      await put('settings', 'app', { tourSeen: true, lastGameId: 'onepiece', lastDeckId: 'op1' })
      await put('decks', 'op1', deck)
    },
    { cards: CARDS, deck: DECK },
  )
  await page.reload()
}

test('a One Piece practice game against the bot plays through to the end', async ({ page }, info) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route((u) => u.hostname !== 'localhost', (r) => r.fulfill({ status: 404, body: '' }))
  await seed(page)
  await page.getByRole('button', { name: /Practice/ }).first().click()
  await page.getByRole('button', { name: /Play a game/ }).click()
  await page.getByLabel('Opponent').selectOption({ label: 'Red Pirates (mirror match)' })
  await page.getByLabel('Who goes first').selectOption('me')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Keep', exact: true }).click()
  await expect(page.getByText('♥ 4 – 4')).toBeVisible()

  // Play: each of your turns, play what you can, attack their Leader with everything, end the turn;
  // when the bot attacks, don't block and take it.
  let screenshot = false
  for (let step = 0; step < 400; step++) {
    if (await page.getByText(/You win!|wins$/).isVisible()) break
    const hand = page.getByLabel('Your hand')
    const play = page.getByRole('button', { name: /^Play \(\d+ DON!!\)$/ })
    if (await page.getByRole('button', { name: 'Don’t block' }).isVisible()) {
      await page.getByRole('button', { name: 'Don’t block' }).click()
      continue
    }
    if (await page.getByRole('button', { name: 'Done', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      continue
    }
    if (await page.getByRole('button', { name: 'Add to hand' }).isVisible()) {
      await page.getByRole('button', { name: 'Add to hand' }).click()
      continue
    }
    // A sixth Character: trash the first one for it.
    if (await page.getByText('pick one to trash').isVisible()) {
      await page.getByRole('region', { name: 'Your Characters' }).locator('.op-piece.targetable').first().click()
      continue
    }
    if (await page.getByRole('button', { name: 'Skip' }).isVisible()) {
      await page.getByRole('button', { name: 'Skip' }).click()
      continue
    }
    const end = page.getByRole('button', { name: 'End turn' })
    if (!(await end.isEnabled())) {
      await page.waitForTimeout(300)
      continue
    }
    // Something affordable in hand?
    let played = false
    for (const card of await hand.getByRole('button').all()) {
      if ((await card.getAttribute('class'))?.includes('unaffordable')) continue
      await card.click()
      if (await play.isVisible()) {
        await play.click()
        played = true
        break
      }
      await card.click()
    }
    if (played) continue
    if (!screenshot) {
      await page.screenshot({ path: info.outputPath('board.png') })
      screenshot = true
    }
    // An attacker?
    let attacked = false
    for (const piece of await page.getByRole('region', { name: 'You' }).or(page.getByRole('region', { name: 'Your Characters' })).locator('.op-piece:not(.rested)').all()) {
      await piece.click()
      const attack = page.getByRole('button', { name: 'Attack', exact: true })
      if (await attack.isVisible()) {
        await attack.click()
        await page.getByRole('region', { name: /: Characters$|Red Pirates/ }).locator('.op-piece.targetable').first().click()
        attacked = true
        break
      }
      await piece.click()
    }
    if (attacked) {
      // The bot answers the attack.
      await page.waitForTimeout(800)
      continue
    }
    await end.click()
  }
  await page.screenshot({ path: info.outputPath('end.png') })
  await expect(page.getByText(/You win!|wins$/)).toBeVisible()
  expect(errors).toEqual([])
})
