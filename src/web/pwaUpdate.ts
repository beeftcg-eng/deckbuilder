import { registerSW } from 'virtual:pwa-register'

const CHECK_EVERY_MS = 60 * 60 * 1000
const MIN_GAP_MS = 60 * 1000

/**
 * Keeps the installed phone app on the newest version. The service worker fetches a new version in
 * the background, but the page on screen kept running the old one until the app was fully closed,
 * and phones mostly just resume it - so a fix could take days to show up. Now the app checks for a
 * new version when you come back to it (and hourly while open), and reloads itself onto it as soon
 * as it's ready (registerType 'autoUpdate' in vite.web.config.ts). Everything is saved as you go,
 * so the reload loses nothing.
 */
export function keepPwaUpdated(): void {
  if (!('serviceWorker' in navigator)) return
  let lastCheck = Date.now()
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (Date.now() - lastCheck < MIN_GAP_MS) return
        lastCheck = Date.now()
        void registration.update().catch(() => undefined)
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, CHECK_EVERY_MS)
    },
  })
}
