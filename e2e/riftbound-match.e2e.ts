import { test, expect } from '@playwright/test'
import { seedRiftbound } from './riftbound.ts'

test('a best-of-3 match: your battlefield, [Deploy] gear, gear back to hand, and sideboarding between games', async ({ page, isMobile }, info) => {
  test.setTimeout(120_000)
  await page.route((u) => u.hostname !== 'localhost', (r) => r.fulfill({ status: 404, body: '' }))
  await seedRiftbound(page, 'd3')
  await page.getByRole('button', { name: /Practice/ }).first().click()
  await page.getByRole('button', { name: /Play a game/ }).click()
  await page.getByLabel('Opponent').selectOption('deck:d1')
  await page.getByRole('group', { name: 'Your battlefield' }).getByRole('button', { name: 'Field 2' }).click()
  await page.locator('label.rb-setup-row', { hasText: /^Match/ }).locator('select').selectOption('3')
  await page.getByLabel('Who goes first').selectOption('me')
  await page.screenshot({ path: info.outputPath('setup.png') })
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Keep', exact: true }).click()
  // Yours is the first battlefield (the bot may have picked its own Field 2 too).
  const field = page.locator('.rb-bf').first()
  await expect(field).toHaveAttribute('aria-label', 'Field 2')
  await expect(page.getByText('Game 1 · match 0–0')).toBeVisible()
  await page.getByRole('button', { name: 'Start of turn' }).click()

  // A Banner goes only to a battlefield: there's no plain Play for it.
  await page.getByLabel('Your hand').getByRole('button').first().click()
  await expect(page.getByRole('button', { name: /^Play \(/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Deploy to Field 2 (0)' }).first().click()
  await expect(field.locator('.rb-bf-gear .rb-gear')).toHaveCount(1, { timeout: 10_000 })
  await page.screenshot({ path: info.outputPath('deployed.png') })
  // And back to hand.
  const hand = await page.locator('.rb-hand-card').count()
  await field.getByLabel('Move Banner of Conquest').selectOption('hand')
  await expect(field.locator('.rb-gear')).toHaveCount(0)
  await expect(page.locator('.rb-hand-card')).toHaveCount(hand + 1)

  // Win game 1 by points, then the next game.
  for (let i = 0; i < 8; i++) await page.getByRole('button', { name: 'Add a point' }).first().click()
  await expect(page.getByText('You win!').first()).toBeVisible()
  await page.getByRole('button', { name: 'Next game' }).click()

  const between = page.getByRole('dialog', { name: 'Before game 2' })
  await expect(between.getByText('The match is 1–0.')).toBeVisible()
  // Field 2 was played: it isn't offered again.
  const picks = between.getByRole('group', { name: 'Your battlefield' })
  await expect(picks.getByRole('button', { name: 'Field 2' })).toHaveCount(0)
  await expect(picks.getByRole('button')).toHaveCount(2)
  // One out, one in.
  await between.getByRole('button', { name: 'Out: Banner of Conquest' }).click()
  await expect(between.getByRole('button', { name: 'Start game 2' })).toBeDisabled()
  await between.getByRole('button', { name: 'In: Fighter 0' }).click()
  await expect(between.getByText('Main deck (40)')).toBeVisible()
  await page.screenshot({ path: info.outputPath('between.png'), fullPage: isMobile })
  await between.getByRole('button', { name: 'Start game 2' }).click()
  await page.getByRole('button', { name: 'Keep', exact: true }).click()
  await expect(page.getByText('Game 2 · match 1–0')).toBeVisible()
  // Your battlefield is the first one (the bot's own may be any of its three).
  await expect(page.locator('.rb-bf').first()).not.toHaveAttribute('aria-label', 'Field 2')
})
