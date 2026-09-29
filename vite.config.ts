import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  // The card scanner is phone-app only (vite.web.config.ts); this keeps it and its OCR models out of the desktop build.
  define: {
    __SCANNER__: 'false',
  },
  // The phone app's service worker registration (src/web/pwaUpdate.ts) doesn't exist on the desktop.
  resolve: {
    alias: {
      'virtual:pwa-register': fileURLToPath(new URL('./src/web/pwaRegisterStub.ts', import.meta.url)),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      renderer: {},
    }),
  ],
})
