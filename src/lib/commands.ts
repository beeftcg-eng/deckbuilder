import { useEffect, useRef } from 'react'

/**
 * Commands the palette (CommandPalette.tsx) sends to the component that owns a window: the import
 * window lives in the sidebar, a deck's Export in the deck view, and so on. Each listens with
 * useCommand. A command nobody is listening for yet (the deck view still loading after the palette
 * opened it) waits a moment for its listener to mount.
 */
export type CommandId =
  | 'import'
  | 'community'
  | 'printProxies'
  | 'patchNotes'
  | 'bugReport'
  | 'shareApp'
  | 'account'
  | 'pairings'
  | 'deck:export'
  | 'deck:practice'
  | 'deck:compare'
  | 'deck:history'
  | 'deck:proxies'
  | 'deck:buyList'
  | 'deck:share'
  | 'deck:stats'
  | 'card'

interface Detail {
  id: CommandId
  arg?: string
  handled: boolean
}

const EVENT = 'brewhouse:command'
/** How long a command waits for a listener that isn't there yet. */
const PENDING_MS = 3000
let pending: { id: CommandId; arg?: string; at: number } | null = null

export function runCommand(id: CommandId, arg?: string): void {
  const detail: Detail = { id, arg, handled: false }
  window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail }))
  pending = detail.handled ? null : { id, arg, at: Date.now() }
}

/** Runs `handler` when `id` is sent (and for one sent just before this mounted). `enabled: false` ignores it. */
export function useCommand(id: CommandId, handler: (arg?: string) => void, enabled = true): void {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    if (!enabled) return
    if (pending?.id === id && Date.now() - pending.at < PENDING_MS) {
      const { arg } = pending
      pending = null
      ref.current(arg)
    }
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<Detail>).detail
      if (detail.id !== id || detail.handled) return
      detail.handled = true
      ref.current(detail.arg)
    }
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
  }, [id, enabled])
}
