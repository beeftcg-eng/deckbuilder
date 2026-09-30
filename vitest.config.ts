import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests don't spin up the Electron/React plugins.
export default defineConfig({
  // The desktop build's values; component tests (*.test.tsx) render the desktop app's screens.
  define: {
    __SCANNER__: 'false',
    __WEB__: 'false',
    __APP_VERSION__: '"test"',
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'electron/**/*.test.ts'],
    // Component tests pick a simulated browser with a `// @vitest-environment happy-dom` first line; the rest run in plain Node.
    environment: 'node',
  },
})
