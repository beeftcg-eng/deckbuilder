import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import type { Card, Format, GameId } from '../shared/types'

const MAX_PICKER_RESULTS = 8
const NO_CARDS: Card[] = []

/** Search box that lists matching cards (one per official card number) and reports the picked card's ban-list key. */
function CardPicker({ cards, placeholder, onPick }: { cards: Card[]; placeholder: string; onPick: (card: Card) => void }) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const seen = new Set<string>()
    const found: Card[] = []
    for (const card of cards) {
      if (!card.name.toLowerCase().includes(q) && !card.sourceId.toLowerCase().includes(q)) continue
      if (seen.has(card.sourceId)) continue
      seen.add(card.sourceId)
      found.push(card)
      if (found.length >= MAX_PICKER_RESULTS) break
    }
    return found
  }, [cards, query])

  return (
    <div className="card-picker">
      <input placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <ul className="card-picker-results">
          {results.map((card) => (
            <li key={card.id}>
              <button
                className="card-picker-result"
                onClick={() => {
                  onPick(card)
                  setQuery('')
                }}
              >
                {card.name} <span className="text-dim">{card.sourceId}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface Props {
  gameId: GameId
  initialFormatId: string
  onClose: () => void
}

/**
 * Edits the local ban list / restricted list / banned pairs / legal sets for
 * a game whose rules aren't in its API (One Piece, Riftbound). Saving stamps
 * the formats as reviewed today, so "Save" with no edits doubles as "I checked
 * and nothing changed".
 */
export function BanListEditor({ gameId, initialFormatId, onClose }: Props) {
  const adapter = getAdapter(gameId)
  const formats = useAppStore((s) => s.formats[gameId]) ?? adapter.defaultFormats
  const catalog = useAppStore((s) => s.catalogs[gameId])
  const saveFormats = useAppStore((s) => s.saveFormats)

  const [draft, setDraft] = useState<Format[]>(() => structuredClone(formats))
  const [activeId, setActiveId] = useState(initialFormatId)
  const [pairA, setPairA] = useState<Card | null>(null)
  const [pairB, setPairB] = useState<Card | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = draft.find((f) => f.id === activeId) ?? draft[0]
  const cards = catalog?.cards ?? NO_CARDS

  // Ban lists are keyed "<game>:<official card number>"; this turns a key back into a readable name.
  const nameForKey = useMemo(() => {
    const names = new Map<string, string>()
    for (const card of cards) {
      const key = `${gameId}:${card.sourceId}`
      if (!names.has(key)) names.set(key, card.name)
    }
    return (key: string) => names.get(key) ?? key
  }, [cards, gameId])

  const sets = useMemo(() => {
    const byId = new Map<string, string>()
    for (const card of cards) byId.set(card.setId, card.setName)
    for (const id of active?.legalSetIds ?? []) if (!byId.has(id)) byId.set(id, id)
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [cards, active?.legalSetIds])

  if (!active) return null
  const keyOf = (card: Card) => `${gameId}:${card.sourceId}`

  function edit(change: (format: Format) => Format) {
    setDraft((formats) => formats.map((f) => (f.id === active.id ? change(f) : f)))
  }

  function addTo(list: 'bannedCardIds' | 'restrictedCardIds', card: Card) {
    edit((f) => (f[list].includes(keyOf(card)) ? f : { ...f, [list]: [...f[list], keyOf(card)] }))
  }

  function removeFrom(list: 'bannedCardIds' | 'restrictedCardIds', key: string) {
    edit((f) => ({ ...f, [list]: f[list].filter((k) => k !== key) }))
  }

  function addPair() {
    if (!pairA || !pairB || pairA.sourceId === pairB.sourceId) return
    const pair: [string, string] = [keyOf(pairA), keyOf(pairB)]
    edit((f) => ({ ...f, bannedPairs: [...f.bannedPairs, pair] }))
    setPairA(null)
    setPairB(null)
  }

  function toggleSet(setId: string) {
    edit((f) => {
      const current = f.legalSetIds ?? []
      return { ...f, legalSetIds: current.includes(setId) ? current.filter((s) => s !== setId) : [...current, setId] }
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await saveFormats(gameId, draft)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  function renderKeyList(list: 'bannedCardIds' | 'restrictedCardIds', title: string, placeholder: string) {
    return (
      <section className="banlist-section">
        <h3>
          {title} ({active[list].length})
        </h3>
        <ul className="banlist-items">
          {active[list].length === 0 && <li className="text-dim">None</li>}
          {active[list].map((key) => (
            <li key={key}>
              <span>
                {nameForKey(key)} <span className="text-dim">{key.slice(key.indexOf(':') + 1)}</span>
              </span>
              <button className="deck-row-delete" title="Remove" onClick={() => removeFrom(list, key)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <CardPicker cards={cards} placeholder={placeholder} onPick={(card) => addTo(list, card)} />
      </section>
    )
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal banlist-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{adapter.shortName} ban list &amp; rotation</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>

        {draft.length > 1 && (
          <select value={active.id} onChange={(e) => setActiveId(e.target.value)}>
            {draft.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        )}

        {cards.length === 0 && <div className="text-dim">Sync {adapter.shortName} card data to search cards by name; existing entries show as card numbers.</div>}

        <div className="banlist-body">
          {renderKeyList('bannedCardIds', 'Banned cards', 'Search a card to ban…')}
          {renderKeyList('restrictedCardIds', 'Restricted to 1 copy', 'Search a card to restrict…')}

          <section className="banlist-section">
            <h3>Banned pairs ({active.bannedPairs.length})</h3>
            <ul className="banlist-items">
              {active.bannedPairs.length === 0 && <li className="text-dim">None</li>}
              {active.bannedPairs.map(([a, b], i) => (
                <li key={`${a}-${b}-${i}`}>
                  <span>
                    {nameForKey(a)} + {nameForKey(b)}
                  </span>
                  <button
                    className="deck-row-delete"
                    title="Remove"
                    onClick={() => edit((f) => ({ ...f, bannedPairs: f.bannedPairs.filter((_, index) => index !== i) }))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="pair-picker">
              <div>{pairA ? <b>{pairA.name}</b> : <CardPicker cards={cards} placeholder="First card…" onPick={setPairA} />}</div>
              <div>{pairB ? <b>{pairB.name}</b> : <CardPicker cards={cards} placeholder="Second card…" onPick={setPairB} />}</div>
              <button className="btn" disabled={!pairA || !pairB || pairA.sourceId === pairB.sourceId} onClick={addPair}>
                Add pair
              </button>
            </div>
          </section>

          {active.legalSetIds && (
            <section className="banlist-section">
              <h3>
                Legal sets ({active.legalSetIds.length}) <span className="text-dim">— cards from unchecked sets are illegal</span>
              </h3>
              <div className="set-checklist">
                {sets.map(([id, name]) => (
                  <label key={id}>
                    <input type="checkbox" checked={active.legalSetIds!.includes(id)} onChange={() => toggleSet(id)} />
                    <span>
                      {name} <span className="text-dim">{id}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}
        </div>

        {error && <div className="sync-error">Couldn't save: {error}</div>}
        <div className="export-actions">
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save & mark reviewed'}
          </button>
          <span className="text-dim">Changes apply to your legality checks right away.</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
