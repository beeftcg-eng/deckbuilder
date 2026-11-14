import { test, expect, type Page } from '@playwright/test'
import { seedRiftbound } from './riftbound.ts'

/** Every visible control inside the viewport's width (boxes that scroll sideways on purpose aside). */
async function offScreen(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, input, select, textarea')]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        let p = el.parentElement
        while (p) {
          const o = getComputedStyle(p).overflowX
          if (o === 'auto' || o === 'scroll') return false
          p = p.parentElement
        }
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.right > window.innerWidth + 1
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}"`),
  )
}

test('a Riftbound practice game fits a phone screen', async ({ page, isMobile }, info) => {
  test.skip(!isMobile, 'A phone-width check.')
  await page.route((u) => u.hostname !== 'localhost', (r) => r.fulfill({ status: 404, body: '' }))
  await seedRiftbound(page)
  await page.getByRole('button', { name: /Practice/ }).first().click()
  await page.getByRole('button', { name: /Play a game/ }).click()
  expect(await offScreen(page), 'the setup').toEqual([])
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Keep', exact: true }).click()
  await page.getByRole('button', { name: 'Start of turn' }).click()
  await page.getByLabel('Your hand').getByRole('button').first().click()
  await page.getByRole('button', { name: /^Play \(/ }).first().click()
  await page.screenshot({ path: info.outputPath('board.png') })
  expect(await offScreen(page), 'the board').toEqual([])
  await page.getByRole('button', { name: 'Deck…' }).click()
  expect(await offScreen(page), 'the deck window').toEqual([])
})

test('your hand stays in view on a short desktop window', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'A desktop check.')
  await page.setViewportSize({ width: 1280, height: 640 })
  await page.route((u) => u.hostname !== 'localhost', (r) => r.fulfill({ status: 404, body: '' }))
  await seedRiftbound(page)
  await page.getByRole('button', { name: /Practice/ }).first().click()
  await page.getByRole('button', { name: /Play a game/ }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Keep', exact: true }).click()
  await page.getByRole('button', { name: 'Start of turn' }).click()
  await page.getByLabel('Your hand').getByRole('button').first().click()
  await page.getByRole('button', { name: /^Play \(/ }).first().click()
  await page.screenshot({ path: info.outputPath('board.png') })
  const hand = await page.getByLabel('Your hand').boundingBox()
  expect(hand).not.toBeNull()
  expect(hand!.y + 40, 'the hand starts on screen').toBeLessThan(640)
  expect(hand!.y + hand!.height, 'the hand ends on screen').toBeLessThanOrEqual(641)
})
