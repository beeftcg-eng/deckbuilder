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

  // Any game can be picked; one without card data offers to download it.
  await dialog.getByRole('button', { name: 'Riftbound', exact: true }).click()
  await expect(dialog.getByText('Riftbound’s card data isn’t downloaded yet.', { exact: false })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Sync card data' })).toBeVisible()
  await dialog.getByRole('button', { name: 'One Piece', exact: true }).click()
  await dialog.getByPlaceholder('Tier list name').fill('OP-09 ranking')
  await dialog.getByRole('button', { name: 'New tier list' }).click()

  // A type across every set: just the Leader.
  await dialog.getByLabel('Type', { exact: true }).selectOption({ label: 'Leader (1)' })
  await expect(dialog.getByText('1 card', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click()

  // Search finds a card by name.
  await dialog.getByPlaceholder('Search cards…').fill('crew member b')
  await expect(dialog.locator('.tier-result', { hasText: CHARACTERS[1].name })).toBeVisible()
  await dialog.getByPlaceholder('Search cards…').fill('')

  // A whole set into the pool.
  await dialog.getByLabel('Set', { exact: true }).selectOption({ label: 'Emperors in the New World (14)' })
  await dialog.getByRole('button', { name: 'Add all 14' }).click()
  await expect(dialog.getByText('Added 14 cards.')).toBeVisible()
  await expect(dialog.getByText('Unranked (14)')).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Add all 0' })).toBeDisabled()
  await app.screenshot({ path: `test-results/tierlist-add-${test.info().project.name}.png` })
  await dialog.getByRole('button', { name: 'Clear', exact: true }).click()

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
