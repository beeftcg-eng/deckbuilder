import { create } from 'zustand'
import type { Card, GameId } from '../shared/types'

/**
 * The cards picked for printing as proxies without a deck (ProxyPrintModal, CardDetailModal's "Add to
 * proxies"). One list per game, kept on this device until it's printed or cleared.
 */
export interface ProxyListEntry {
  cardId: string
  quantity: number
}

interface ProxyListState {
  lists: Partial<Record<GameId, ProxyListEntry[]>>
  add: (card: Card, quantity?: number) => void
  setQuantity: (gameId: GameId, cardId: string, quantity: number) => void
  /** Puts another printing in a card's place, adding to that printing's copies if it's already listed. */
  swap: (gameId: GameId, fromId: string, toId: string) => void
  clear: (gameId: GameId) => void
}

const STORAGE_KEY = 'proxyList'

function load(): ProxyListState['lists'] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function save(lists: ProxyListState['lists']) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists))
  } catch {
    // Storage off or full: the list still works until the app closes.
  }
}

export const useProxyList = create<ProxyListState>((set, get) => {
  const update = (gameId: GameId, change: (list: ProxyListEntry[]) => ProxyListEntry[]) => {
    const lists = { ...get().lists, [gameId]: change(get().lists[gameId] ?? []).filter((e) => e.quantity > 0) }
    save(lists)
    set({ lists })
  }
  return {
    lists: load(),
    add: (card, quantity = 1) =>
      update(card.gameId, (list) =>
        list.some((e) => e.cardId === card.id) ? list.map((e) => (e.cardId === card.id ? { ...e, quantity: e.quantity + quantity } : e)) : [...list, { cardId: card.id, quantity }],
      ),
    setQuantity: (gameId, cardId, quantity) => update(gameId, (list) => list.map((e) => (e.cardId === cardId ? { ...e, quantity } : e))),
    swap: (gameId, fromId, toId) =>
      update(gameId, (list) => {
        const from = list.find((e) => e.cardId === fromId)
        if (!from || fromId === toId) return list
        const rest = list.filter((e) => e.cardId !== fromId)
        return rest.some((e) => e.cardId === toId)
          ? rest.map((e) => (e.cardId === toId ? { ...e, quantity: e.quantity + from.quantity } : e))
          : list.map((e) => (e.cardId === fromId ? { ...e, cardId: toId } : e))
      }),
    clear: (gameId) => update(gameId, () => []),
  }
})
