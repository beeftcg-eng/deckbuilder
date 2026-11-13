import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Page } from '@playwright/test'
import { CHARACTERS, DECK_TEXT, LEADER, LEGAL_MAIN, banListsFile, expect, savedDeck, test } from './fixtures.ts'

/**
 * The flows people use most, end to end in the phone app's build (desktop and phone sizes): build a
 * deck from the card browser, import a pasted list, find things with Ctrl+K, practise a hand, a ban
 * list update reaching a deck, and an accessibility pass over the real pages.
 */

/** On a phone the sidebar is the "More" menu; open it when it's closed. */
async function openSidebar(page: Page) {
  const more = page.locator('.mobile-tabbar button[aria-expanded="false"]')
  if (await more.isVisible()) await more.click()
}

/** The deck's legality, wherever the screen shows it. */
const legal = (page: Page) => page.getByText(/✓ (Deck is legal|Legal)/).first()

test('imports a pasted list into a legal deck', async ({ app }) => {
  await openSidebar(app)
  await app.getByRole('button', { name: 'Import', exact: true }).click()
  const dialog = app.getByRole('dialog', { name: /Import/ })
  await dialog.locator('textarea').fill(DECK_TEXT)
  await dialog.getByPlaceholder('Deck name').fill('Purple Crew')
  await dialog.getByRole('button', { name: 'Import deck' }).click()
  await expect(dialog).toBeHidden()
  await expect(app.getByText('Purple Crew').filter({ visible: true }).first()).toBeVisible()
  await expect(legal(app)).toBeVisible()
})

test('builds a deck from the card browser', async ({ app, isMobile }) => {
  test.skip(isMobile, 'Adding from the browser is the same code on phones; the phone layout is covered by the other tests.')
  await app.getByRole('button', { name: '+ New' }).click()
  // The Leader first, then a Character, from the browser.
  await app.locator('.search-input').first().fill(LEADER.name)
  await app.locator('.card-tile').filter({ hasText: LEADER.name }).getByRole('button', { name: /Add|\+/ }).first().click()
  await app.locator('.search-input').first().fill(CHARACTERS[0].name)
  const tile = app.locator('.card-tile').filter({ hasText: CHARACTERS[0].name })
  for (let i = 0; i < 4; i++) await tile.getByRole('button', { name: /Add|\+/ }).first().click()
  const panel = app.locator('.deck-panel')
  await expect(panel.getByText(LEADER.name)).toBeVisible()
  await expect(panel.getByText(CHARACTERS[0].name)).toBeVisible()
  // Four cards is far from 50: the legality panel says what's wrong.
  await expect(panel.locator('.legality-panel.illegal')).toBeVisible()
})

test.describe('with a deck open', () => {
  test.use({ startDecks: [savedDeck('d1', 'Purple Crew', LEGAL_MAIN)], openFirst: true })

  test('Ctrl+K finds the deck and opens its export', async ({ app, isMobile }) => {
    if (isMobile) {
      await openSidebar(app)
      await app.getByRole('button', { name: /Go to…/ }).click()
    } else {
      await app.keyboard.press('Control+k')
    }
    const palette = app.getByRole('dialog', { name: 'Go to' })
    await palette.getByRole('combobox').fill('purple')
    await palette.getByRole('combobox').press('Enter')
    await expect(palette).toBeHidden()
    await expect(app.getByText('Purple Crew').filter({ visible: true }).first()).toBeVisible()
    if (isMobile) return
    await app.keyboard.press('Control+k')
    await palette.getByRole('combobox').fill('export')
    await palette.getByRole('combobox').press('Enter')
    await expect(app.getByRole('dialog', { name: /Export/ })).toBeVisible()
  })

  test('Practice deals a hand and plays a card from the turn’s DON!!', async ({ app }) => {
    await app.getByRole('button', { name: /Practice/ }).first().click()
    const practice = app.getByRole('dialog', { name: /Sample hand/ })
    await expect(practice.locator('.sample-hand-card')).toHaveCount(5)
    await practice.getByRole('button', { name: 'Next turn' }).click()
    await expect(practice.getByRole('status')).toHaveText(/DON!!: \d+ of 1 left this turn/)
    await expect(practice.locator('.sample-hand-card')).toHaveCount(5) // going first: no draw on turn 1
  })
})

test.describe('a ban list update', () => {
  test.use({
    startDecks: [savedDeck('d1', 'Purple Crew', LEGAL_MAIN)],
    openFirst: true,
    outside: { 'banlists.json': banListsFile([`onepiece:${CHARACTERS[0].sourceId}`]) },
  })

  test('says what changed and which deck it makes illegal', async ({ app }) => {
    const notice = app.getByRole('dialog', { name: 'Ban list update' })
    await expect(notice).toBeVisible()
    await expect(notice.getByText(new RegExp(`${CHARACTERS[0].name}: .* → Banned`))).toBeVisible()
    await expect(notice.getByText('Purple Crew')).toBeVisible()
    await notice.getByRole('button', { name: 'Got it' }).click()
    await expect(notice).toBeHidden()
    // And the deck is now illegal for it.
    await expect(app.getByText(/is banned/i).or(app.getByText(/✗/)).first()).toBeVisible()
  })
})

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

/** axe over the whole page (colour contrast and landmarks included, which the unit tests can't check). */
async function axeViolations(page: Page) {
  await page.addScriptTag({ content: axeSource })
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }> } }
    const result = await w.axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
    return result.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
  })
}

test.describe('accessibility', () => {
  test.use({ startDecks: [savedDeck('d1', 'Purple Crew', LEGAL_MAIN)] })

  test('the card browser and sidebar meet WCAG 2.1 AA', async ({ app }) => {
    await expect(app.locator('.card-tile').first()).toBeVisible()
    expect(await axeViolations(app)).toEqual([])
  })

  test('a deck view meets WCAG 2.1 AA', async ({ app }) => {
    await openSidebar(app)
    await app.locator('.deck-row', { hasText: 'Purple Crew' }).first().click()
    await expect(app.getByRole('dialog', { name: /Purple Crew/ })).toBeVisible()
    expect(await axeViolations(app)).toEqual([])
  })

  test('My Decks meets WCAG 2.1 AA', async ({ app, isMobile }) => {
    if (isMobile) await app.locator('.mobile-tabbar').getByRole('button', { name: /My Decks/ }).click()
    else await app.getByRole('button', { name: /My Decks/ }).first().click()
    await expect(app.locator('.md-card').first()).toBeVisible()
    expect(await axeViolations(app)).toEqual([])
  })
})

/** Every visible control inside the viewport's width: nothing a phone user has to scroll sideways to reach. */
async function offScreen(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a')]
      .filter((el) => el.offsetParent !== null && !el.closest('.card-grid, .sample-hand-grid, .practice-discard-row, .community-list'))
      .filter((el) => {
        const r = el.getBoundingClientRect()
        // Inside a box that scrolls sideways on purpose (a row of tabs or chips) is fine.
        let p = el.parentElement
        while (p) {
          if (getComputedStyle(p).overflowX === 'auto' || getComputedStyle(p).overflowX === 'scroll') return false
          p = p.parentElement
        }
        return r.width > 0 && r.right > window.innerWidth + 1
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`),
  )
}

test.describe('phone layout', () => {
  test.use({ startDecks: [savedDeck('d1', 'Purple Crew', LEGAL_MAIN)] })

  test('the menu and the import window fit the screen', async ({ app, isMobile }) => {
    test.skip(!isMobile, 'A phone-width check.')
    await openSidebar(app)
    expect(await offScreen(app), 'the menu').toEqual([])
    await app.getByRole('button', { name: 'Import', exact: true }).click()
    await app.getByRole('dialog', { name: /Import/ }).locator('textarea').fill(DECK_TEXT)
    expect(await offScreen(app), 'the import window').toEqual([])
  })
})
