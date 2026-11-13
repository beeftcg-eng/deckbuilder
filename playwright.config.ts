import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests (e2e/*.e2e.ts): the phone app's build, served locally, driven in Chromium at
 * desktop and phone sizes. Card data and every outside file are fixtures (e2e/fixtures.ts), so the
 * tests never touch the network.
 *
 *   npm run e2e            (builds, serves and runs)
 *   npx playwright test --ui
 */
const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/deckbuilder/`,
    // The phone app's offline cache would serve an older build between runs.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx vite build --config vite.web.config.ts && npx vite preview --config vite.web.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/deckbuilder/`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
