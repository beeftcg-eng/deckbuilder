import { countUse, sendUsage, setUsageEnabled, usageEnabled } from '../shared/usage'
import { useAppStore } from './useAppStore'

/**
 * Feeds the anonymous usage counts (shared/usage.ts) when the setting is on: every window that opens
 * (by its fixed class name, never its title, which can hold a deck's name), the panels and games
 * shown, and the deck view vs. the editor. Sends the finished days at launch and every few hours.
 */
const SEND_EVERY_MS = 6 * 60 * 60 * 1000
const PANELS = ['showMyDecks', 'showCollection', 'showWishlist', 'showTrade', 'showBinders', 'showScanner', 'showShortcuts', 'showTour'] as const

let started = false

export function startUsageTracking(): void {
  if (started || typeof window === 'undefined') return
  started = true
  const send = () => void sendUsage(__WEB__ ? 'web' : 'desktop', __APP_VERSION__)

  // Follow the setting, and count what the store shows.
  let prev = useAppStore.getState()
  setUsageEnabled(prev.settings.usageStats === true)
  useAppStore.subscribe((s) => {
    const on = s.settings.usageStats === true
    if (on !== usageEnabled()) {
      setUsageEnabled(on)
      if (on) send()
    }
    for (const panel of PANELS) if (s[panel] && !prev[panel]) countUse(`panel:${panel.slice(4)}`)
    if (s.currentGameId !== prev.currentGameId) countUse(`game:${s.currentGameId}`)
    if (s.currentDeckId && (s.deckViewing !== prev.deckViewing || s.currentDeckId !== prev.currentDeckId)) countUse(s.deckViewing ? 'panel:deck-view' : 'panel:deck-editor')
    prev = s
  })

  // Windows: each .modal's first class after "modal" names it ("export-modal", "palette").
  new MutationObserver((records) => {
    if (!usageEnabled()) return
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (!(node instanceof HTMLElement)) continue
        const modal = node.matches('.modal') ? node : node.querySelector('.modal')
        const name = modal ? [...modal.classList].find((c) => c !== 'modal') : undefined
        if (name) countUse(`window:${name}`)
      }
    }
  }).observe(document.body, { childList: true })

  send()
  setInterval(send, SEND_EVERY_MS)
}
