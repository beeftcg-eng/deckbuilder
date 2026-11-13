import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { GAME_LIST, getAdapter } from '../shared/games/registry'
import { isCommunityGame } from '../shared/communityGames'
import { THEMES } from '../shared/themes'
import { runCommand, type CommandId } from '../lib/commands'
import { t } from '../shared/i18n'
import type { Card } from '../shared/types'

type Group = 'deck' | 'decks' | 'go' | 'create' | 'cards' | 'app'
const GROUP_ORDER: Group[] = ['deck', 'decks', 'go', 'create', 'cards', 'app']

interface Item {
  id: string
  group: Group
  label: string
  /** Shown dimmed after the label (a deck's game, a card's set). */
  detail?: string
  /** Extra words it's found by. */
  keywords?: string
  run: () => void
}

/** Lower case without accents, so "pokemon" finds "Pokémon". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Leading emoji and symbols aren't typed: "🗂 My Decks" is found as "my decks". */
const plain = (label: string) => label.replace(/^[^\p{L}\p{N}]+/u, '')

/** How well `item` matches the query words: every word must appear; a label starting with the query ranks first. */
function score(item: Item, words: string[], query: string): number {
  const label = fold(plain(item.label))
  const haystack = `${label} ${fold(item.detail ?? '')} ${fold(item.keywords ?? '')}`
  if (!words.every((w) => haystack.includes(w))) return -1
  if (label.startsWith(query)) return 3
  if (label.split(/\s+/).some((w) => w.startsWith(words[0]))) return 2
  return 1
}

const MAX_CARDS = 8
const MAX_SHOWN = 60

/**
 * Ctrl+K: one search box over your decks, the current game's cards, and everything the app does
 * (open a panel, a deck's Export or Buy list, print proxies, switch game or theme). Windows that live
 * inside other components are opened through lib/commands.ts.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const decks = useAppStore((s) => s.decks)
  const currentGameId = useAppStore((s) => s.currentGameId)
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const deckViewing = useAppStore((s) => s.deckViewing)
  const hidden = useAppStore((s) => s.settings.hiddenGames)
  const catalog = useAppStore((s) => s.catalogs[s.currentGameId])
  const pawmodoroConnected = useAppStore((s) => s.pawmodoroConfig.connected)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const items = useMemo((): Item[] => {
    const store = useAppStore.getState()
    const game = getAdapter(currentGameId)
    const out: Item[] = []
    const command = (group: Group, id: CommandId, label: string, keywords?: string, beforeRun?: () => void): Item => ({
      id,
      group,
      label,
      keywords,
      run: () => {
        beforeRun?.()
        runCommand(id)
      },
    })

    const deck = decks.find((d) => d.id === currentDeckId)
    if (deck) {
      const adapter = getAdapter(deck.gameId)
      // The deck view has every one of these; the editor only some, so the rest open the view first.
      const inView = () => {
        if (!useAppStore.getState().deckViewing) useAppStore.getState().setDeckViewing(true)
      }
      const viewOnly = (id: CommandId, label: string, keywords?: string) => command('deck', id, label, keywords, inView)
      out.push(
        command('deck', 'deck:export', `${t.deckView.export}`, 'save text picture image link copy'),
        command('deck', 'deck:practice', t.sampleHand.button, 'sample hand mulligan draw odds playtest'),
        command('deck', 'deck:proxies', t.proxies.button, 'print pdf'),
        viewOnly('deck:compare', t.compare.button, 'diff'),
        viewOnly('deck:history', t.history.button, 'versions undo earlier'),
      )
      if (adapter.hasPrices) out.push(command('deck', 'deck:buyList', t.buyList.button, 'missing cost tcgplayer price'))
      out.push(viewOnly('deck:share', t.share.button, 'link'), viewOnly('deck:stats', t.deckStatsModal.button, 'pairings tournament record'))
      out.push(
        deckViewing
          ? { id: 'deck:edit', group: 'deck', label: t.palette.editDeck, run: () => store.setDeckViewing(false) }
          : { id: 'deck:view', group: 'deck', label: t.palette.viewDeck, run: () => store.setDeckViewing(true) },
      )
    }

    for (const d of decks) {
      out.push({ id: `deck:${d.id}`, group: 'decks', label: d.name, detail: t.palette.deckIn(getAdapter(d.gameId).shortName), keywords: d.folder ?? '', run: () => store.openDeck(d.id) })
    }

    out.push(
      { id: 'myDecks', group: 'go', label: t.sidebar.myDecks, run: () => store.setShowMyDecks(true) },
      { id: 'collection', group: 'go', label: t.sidebar.collection, keywords: 'owned binder spares import export value', run: () => store.setShowCollection(true) },
      { id: 'wishlist', group: 'go', label: t.sidebar.wishlist, keywords: 'price alerts', run: () => store.setShowWishlist(true) },
      { id: 'trade', group: 'go', label: t.sidebar.trade, run: () => store.setShowTrade(true) },
      { id: 'binders', group: 'go', label: t.sidebar.binders, run: () => store.setShowBinders(true) },
    )
    for (const adapter of GAME_LIST) {
      if (adapter.id === currentGameId || hidden?.includes(adapter.id)) continue
      out.push({ id: `game:${adapter.id}`, group: 'go', label: t.palette.openGame(adapter.shortName), keywords: adapter.name, run: () => store.setGame(adapter.id) })
    }

    out.push(
      { id: 'newDeck', group: 'create', label: t.palette.newDeck(game.shortName), keywords: 'create build', run: () => void store.createDeck(currentGameId) },
      command('create', 'import', t.palette.importDeck, 'paste decklist url'),
    )
    if (isCommunityGame(currentGameId)) out.push(command('create', 'community', t.palette.communityLists(game.shortName), 'meta community lists riftatlas limitless'))
    if (__SCANNER__) out.push({ id: 'scan', group: 'create', label: t.scanner.open, keywords: 'camera', run: () => store.setShowScanner(true) })
    out.push(command('create', 'printProxies', t.palette.printProxies, 'pdf'))

    out.push(
      { id: 'sync', group: 'app', label: t.palette.sync(game.shortName), keywords: 'download refresh', run: () => void store.syncCatalog(currentGameId) },
      command('app', 'account', pawmodoroConnected ? t.sidebar.manageAccount : t.sidebar.login, 'log in sign in sync phone pawmodoro'),
      command('app', 'pairings', t.sidebar.connectPairings, 'tournament results'),
      { id: 'shortcuts', group: 'app', label: t.palette.shortcuts, keywords: 'keys keyboard', run: () => store.setShowShortcuts(true) },
      { id: 'tour', group: 'app', label: t.palette.tour, keywords: 'help welcome', run: () => store.setShowTour(true) },
      command('app', 'patchNotes', t.palette.patchNotes, 'changelog whats new'),
      command('app', 'bugReport', t.palette.bugReport, 'feedback problem'),
    )
    if (__WEB__) out.push(command('app', 'shareApp', t.shareApp.button, 'qr'))
    for (const theme of THEMES) {
      out.push({ id: `theme:${theme.id}`, group: 'app', label: t.palette.theme(t.themes[theme.id] ?? theme.id), keywords: 'colour color dark light', run: () => store.setTheme(theme.id) })
    }
    return out
  }, [decks, currentGameId, currentDeckId, deckViewing, hidden, pawmodoroConnected])

  const results = useMemo((): Item[] => {
    const q = fold(query.trim())
    if (!q) return items.filter((i) => i.group !== 'decks' || i.id === `deck:${currentDeckId}`).slice(0, MAX_SHOWN)
    const words = q.split(/\s+/)
    const found = items
      .map((item) => ({ item, s: score(item, words, q) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s || GROUP_ORDER.indexOf(a.item.group) - GROUP_ORDER.indexOf(b.item.group))
      .map((r) => r.item)
    // The current game's cards, by name, once there's enough to search on.
    if (q.length >= 2 && catalog) {
      const seen = new Set<string>()
      const cards: Card[] = []
      for (const card of catalog.cards) {
        const name = fold(card.name)
        if (!words.every((w) => name.includes(w)) || seen.has(name)) continue
        seen.add(name)
        cards.push(card)
      }
      cards.sort((a, b) => Number(fold(b.name).startsWith(q)) - Number(fold(a.name).startsWith(q)) || a.name.length - b.name.length)
      for (const card of cards.slice(0, MAX_CARDS)) {
        found.push({ id: `card:${card.id}`, group: 'cards', label: card.name, detail: card.setName, run: () => runCommand('card', card.id) })
      }
    }
    return found.slice(0, MAX_SHOWN)
  }, [items, query, catalog, currentDeckId])

  const clamped = Math.min(active, Math.max(0, results.length - 1))

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${clamped}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [clamped])

  function choose(item: Item | undefined) {
    if (!item) return
    onClose()
    item.run()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((clamped + 1) % Math.max(1, results.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((clamped - 1 + results.length) % Math.max(1, results.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[clamped])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  // A group's heading above its first item.
  const headings = results.map((item, i) => (i === 0 || results[i - 1].group !== item.group ? t.palette.groups[item.group] : null))
  return createPortal(
    <div className="modal-overlay palette-overlay" onClick={onClose}>
      <div className="modal palette" role="dialog" aria-modal="true" aria-label={t.palette.label} onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={results[clamped] ? `palette-item-${clamped}` : undefined}
          aria-label={t.palette.placeholder}
          placeholder={t.palette.placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
        <ul id="palette-results" ref={listRef} className="palette-results" role="listbox" aria-label={t.palette.label}>
          {results.length === 0 && <li className="palette-empty text-dim">{t.palette.none}</li>}
          {results.map((item, i) => {
            const heading = headings[i]
            return (
              <li key={item.id} role="presentation">
                {heading && (
                  <div className="palette-group" aria-hidden>
                    {heading}
                  </div>
                )}
                <div
                  id={`palette-item-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === clamped}
                  className={`palette-item ${i === clamped ? 'active' : ''}`}
                  onMouseMove={() => i !== clamped && setActive(i)}
                  onClick={() => choose(item)}
                >
                  <span className="palette-label">{item.label}</span>
                  {item.detail && <span className="palette-detail text-dim">{item.detail}</span>}
                </div>
              </li>
            )
          })}
        </ul>
        <div className="palette-hint text-dim desktop-only">{t.palette.hint}</div>
      </div>
    </div>,
    document.body,
  )
}
