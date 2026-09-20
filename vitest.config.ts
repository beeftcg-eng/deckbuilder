import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests don't spin up the Electron/React plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'electron/**/*.test.ts'],
    environment: 'node',
  },
})
