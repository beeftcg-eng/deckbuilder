import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * Playing a friend online, end to end: a host and a guest in two separate browsers, each with their
 * own Riftbound deck, against a stand-in for the Supabase functions (in memory, as
 * scripts/pawmodoro-migration-2026-11-14-practice-online.sql and the 2026-11-15 one define them).
 */

import { seedRiftbound } from './riftbound.ts'

type Game = { host_secret: string; guest_secret: string | null; host_name: string; guest_name: string | null; host_deck: unknown; guest_deck: unknown; seq: number; state: string | null; host_private: string | null; guest_private: string | null; host_gifts: string[]; guest_gifts: string[] }
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
      const host = g?.host_secret === b.p_secret
      if (fn === 'deckbuilder_practice_create') {
        games.set(b.p_code, { host_secret: b.p_secret, guest_secret: null, host_name: b.p_name, guest_name: null, host_deck: b.p_deck, guest_deck: null, seq: 0, state: null, host_private: null, guest_private: null, host_gifts: [], guest_gifts: [] })
        return json(null)
      }
      if (fn === 'deckbuilder_practice_join' && g) {
        Object.assign(g, { guest_secret: b.p_secret, guest_name: b.p_name, guest_deck: b.p_deck })
        return json({ host_name: g.host_name, host_deck: g.host_deck })
      }
      if (fn === 'deckbuilder_practice_get2' && allowed) {
        const gifts = host ? g!.host_gifts : g!.guest_gifts
        if (host) g!.host_gifts = []
        else g!.guest_gifts = []
        return json({ seq: g!.seq, state: g!.seq > b.p_since ? g!.state : null, private: host ? g!.host_private : g!.guest_private, gifts, host_name: g!.host_name, guest_name: g!.guest_name, guest_deck: g!.guest_deck })
      }
      if (fn === 'deckbuilder_practice_push2' && allowed) {
        if (g!.seq !== b.p_seq) return json(-1)
        g!.seq += 1
        g!.state = b.p_state
        if (host) {
          g!.host_private = b.p_private
          g!.guest_gifts.push(...b.p_gifts)
        } else {
          g!.guest_private = b.p_private
          g!.host_gifts.push(...b.p_gifts)
        }
        return json(g!.seq)
      }
      if (fn === 'deckbuilder_practice_set_private' && allowed) {
        if (host) g!.host_private = b.p_private
        else g!.guest_private = b.p_private
        return json(null)
      }
      return route.fulfill({ status: 404, body: '' })
    },
  )
  await seedRiftbound(page)
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
  // Each player's hand is their own: the other side only ever shows a count.
  expect(await first.locator('.rb-hand-card').count()).toBeGreaterThan(0)
  expect(await first.getByText('Face-down card').count()).toBe(0)
  // A point, taken back with Undo: both screens go back to 0.
  await first.getByRole('button', { name: 'Add a point' }).click()
  await expect(second.getByLabel('1 points')).toBeVisible({ timeout: 10_000 })
  await expect(first.getByRole('button', { name: /Undo/ })).toBeEnabled({ timeout: 10_000 })
  await first.getByRole('button', { name: /Undo/ }).click()
  await expect(second.getByLabel('0 points')).toHaveCount(2, { timeout: 10_000 })
  await expect(first.getByLabel('0 points')).toHaveCount(2)
  // The unit played before it can be taken back too.
  await expect(first.getByRole('button', { name: /Undo/ })).toBeEnabled({ timeout: 10_000 })
  await first.getByRole('button', { name: 'End turn' }).click()
  await expect(second.getByText(/Your turn 1/).first()).toBeVisible({ timeout: 10_000 })
  // Ending the turn can be taken back until the other player does something; then it can't.
  await expect(first.getByRole('button', { name: /Undo/ })).toBeEnabled({ timeout: 10_000 })
  await second.getByRole('button', { name: 'Start of turn' }).click()
  await expect(first.getByRole('button', { name: /Undo/ })).toBeDisabled({ timeout: 10_000 })
  await expect(first.getByText(`${secondName}’s turn 1`).first()).toBeVisible({ timeout: 10_000 })
})
