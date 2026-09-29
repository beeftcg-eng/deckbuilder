import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  // The desktop app scans with a webcam; its OCR models are served by electron/ipc/assetProtocol.ts.
  define: {
    __SCANNER__: 'true',
    __WEB__: 'false',
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
