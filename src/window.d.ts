import type { DeckbuilderApi } from '../electron/preload'

declare global {
  interface Window {
    api: DeckbuilderApi
  }
}

export {}
