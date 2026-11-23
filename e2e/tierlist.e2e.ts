import type { Page } from '@playwright/test'
import { CHARACTERS, LEADER, expect, test } from './fixtures.ts'

/** The tier list maker: make a list from a set, rank cards by tapping, and get the picture. */

async function openSidebar(page: Page) {
  const more = page.locator('.mobile-tabbar button[aria-expanded="false"]')
  if (await more.isVisible()) await more.click()
}

test('makes a tier list and saves it as a picture', async ({ app }) => {
  await openSidebar(app)
  await app.getByRole('button', { name: '🏆 Tier lists' }).click()
  const dialog = app.getByRole('dialog', { name: /Tier lists/ })
  await dialog.getByPlaceholder('Tier list name').fill('OP-09 ranking')
  await dialog.getByRole('button', { name: 'New tier list' }).click()

  // A whole set into the pool.
  await dialog.getByLabel('Add a whole set…').selectOption({ label: 'Emperors in the New World (14)' })
  await dialog.getByRole('button', { name: 'Add set' }).click()
  await expect(dialog.getByText('Added 14 cards.')).toBeVisible()
  await expect(dialog.getByText('Unranked (14)')).toBeVisible()

  // Tap a card, then a tier.
  await dialog.getByRole('button', { name: LEADER.name, exact: true }).click()
  await dialog.getByRole('toolbar').getByRole('button', { name: 'S', exact: true }).click()
  await expect(dialog.locator('.tier-row').first().getByRole('button', { name: LEADER.name })).toBeVisible()
  await expect(dialog.getByText('Unranked (13)')).toBeVisible()

  // Another card, to another tier.
  await dialog.getByRole('button', { name: CHARACTERS[0].name, exact: true }).click()
  await dialog.getByRole('toolbar').getByRole('button', { name: 'A', exact: true }).click()
  await expect(dialog.locator('.tier-row').nth(1).getByRole('button', { name: CHARACTERS[0].name })).toBeVisible()

  await dialog.getByRole('button', { name: '🖼 Save as picture' }).click()
  const picture = app.getByRole('dialog', { name: 'Tier list picture' })
  await expect(picture.getByRole('img', { name: 'Tier list picture' })).toBeVisible({ timeout: 15_000 })
  await expect(picture.getByRole('button', { name: /Save image/ })).toBeVisible()
  await app.screenshot({ path: 'test-results/tierlist-picture.png' })
  await picture.getByRole('button', { name: 'Close' }).click()
  await app.screenshot({ path: 'test-results/tierlist-editor.png' })

  // Still there after closing and reopening the window.
  await dialog.getByRole('button', { name: 'Close' }).first().click()
  await openSidebar(app)
  await app.getByRole('button', { name: '🏆 Tier lists' }).click()
  await expect(app.getByRole('dialog', { name: /Tier lists/ }).getByText('2 of 14 cards ranked')).toBeVisible()
})
