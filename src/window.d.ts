import type { DeckbuilderApi } from '../electron/preload'

declare global {
  interface Window {
    api: DeckbuilderApi
  }
  /** True in the phone app's build (vite.web.config.ts), false in the desktop one: the card scanner is phone-only. */
  const __SCANNER__: boolean
}

export {}
