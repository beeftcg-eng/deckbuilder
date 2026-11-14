import { test, expect } from '@playwright/test'
import { seedRiftbound } from './riftbound.ts'

test('against the bot, its cards wait on the chain for your answer, and Gust returns a unit', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'One size is enough for the rules.')
  test.setTimeout(120_000)
  await page.route((u) => u.hostname !== 'localhost', (r) => r.fulfill({ status: 404, body: '' }))
  // You play a deck of Gusts; the bot plays the fighters.
  await seedRiftbound(page, 'd2')
  await page.getByRole('button', { name: /Practice/ }).first().click()
  await page.getByRole('button', { name: /Play a game/ }).click()
  await page.getByLabel('Opponent').selectOption('deck:d1')
  await page.getByLabel('Who goes first').selectOption('me')
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Keep', exact: true }).click()
  // Played by hand (the setup's default): your turn starts with one button.
  const endTurn = page.getByRole('button', { name: 'End turn' })
  const startOfTurn = page.getByRole('button', { name: 'Start of turn' })
  await startOfTurn.click()
  // Runes show as cards.
  await expect(page.locator('.rb-player.mine .rb-rune img').first()).toBeVisible()
  await endTurn.click()

  const chain = page.getByRole('region', { name: 'On the chain' })
  const pass = chain.getByRole('button', { name: 'Pass (let it resolve)' })
  const theirBase = page.getByLabel('Bot’s base')
  // The bot plays fighters: each waits for you (you hold an affordable Reaction) until you pass.
  await expect(chain).toBeVisible({ timeout: 15_000 })
  await expect(chain.getByText('Answer with a Reaction, or pass to let the top card resolve.')).toBeVisible()
  await expect(theirBase.locator('.rb-unit')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('chain.png') })
  await pass.click()
  await expect(theirBase.locator('.rb-unit')).toHaveCount(1, { timeout: 10_000 })

  // Pass whatever else it plays, until it's your turn again; then end turns until a fighter of theirs stands at a battlefield.
  const theirUnitsAtBattlefields = page.locator('.rb-bf .rb-units.theirs .rb-unit')
  for (let i = 0; i < 80; i++) {
    if ((await pass.count()) && (await pass.isEnabled())) await pass.click().catch(() => {})
    else if (await endTurn.isEnabled()) {
      await startOfTurn.click()
      if ((await theirUnitsAtBattlefields.count()) > 0) break
      await endTurn.click()
    }
    await page.waitForTimeout(400)
  }
  const before = await theirUnitsAtBattlefields.count()
  expect(before).toBeGreaterThan(0)

  // Your Gust, at the fighter you click: it waits for the bot, which lets it resolve.
  await page.getByLabel('Your hand').getByRole('button').first().click()
  await page.getByRole('button', { name: /^Play \(/ }).first().click()
  await expect(page.getByText(/pick a unit/)).toBeVisible()
  await theirUnitsAtBattlefields.first().locator('.rb-unit-main').click()
  await expect(theirUnitsAtBattlefields).toHaveCount(before - 1, { timeout: 10_000 })
  await expect(page.locator('.rb-log').getByText(/Gust resolved/).last()).toBeVisible()
})
