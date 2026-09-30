import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// Separate from vite.config.ts (the Electron desktop build) on purpose - this one builds the PWA
// deployed to GitHub Pages at https://beeftcg-eng.github.io/deckbuilder/, same idea as Pawmodoro's
// own docs/ phone app. It shares almost all of the same source: the React UI and Zustand store
// don't know or care whether window.api is Electron's preload script or src/web/webApi.ts's
// browser-native implementation (installed by src/main.tsx when Electron's isn't already there).
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

export default defineConfig({
  base: '/deckbuilder/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __SCANNER__: 'true',
    __WEB__: 'true',
  },
  build: {
    outDir: 'dist-web',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/manifest.json is already hand-written and copied as-is
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        // The card catalog (cards:sync) and Supabase calls go through plain fetch() from app code,
        // not through the service worker's precache - only the app shell itself is precached here.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // The scanner's engine and models (.wasm, .onnx; ~20-40 MB, only one of the two engines is ever
        // fetched, see src/lib/scan/paddle.ts) stay out of the precache so installing the app stays small,
        // but once fetched they're kept, so scanning works offline and a new version doesn't download
        // them again unless they changed (their names carry a content hash).
        runtimeCaching: [
          {
            urlPattern: /\/assets\/[^/]+\.(?:wasm|onnx)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'scanner-engine', expiration: { maxEntries: 8 }, rangeRequests: true },
          },
        ],
        navigateFallbackDenylist: [/^\/deckbuilder\/manifest\.json$/],
      },
    }),
  ],
})
