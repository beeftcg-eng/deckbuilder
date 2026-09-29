import type { DeckbuilderApi } from '../electron/preload'

declare global {
  interface Window {
    api: DeckbuilderApi
  }
  /** Whether the build has the card scanner: the phone app's does, the desktop one leaves it out. */
  const __SCANNER__: boolean
  /** True in the phone app's build (vite.web.config.ts), false in the desktop one. */
  const __WEB__: boolean
}

export {}
