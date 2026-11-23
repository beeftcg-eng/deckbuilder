import { Modal } from './Modal'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useAppStore } from '../state/useAppStore'
import { GAME_LIST, getAdapter } from '../shared/games/registry'
import {
  MAX_CARDS,
  MAX_TIERS,
  POOL,
  addCards,
  addTier,
  cardCount,
  duplicateTierList,
  isPicking,
  moveCard,
  newTierList,
  pickCards,
  rankedCount,
  removeCard,
  removeTier,
  resetRanks,
  setsOf,
  shiftTier,
  spotOf,
  tierListText,
  typeOptions,
  updateTier,
  type TierList,
  type TierSpot,
} from '../shared/tierLists'
import { renderTierListImage } from '../lib/tierListImage'
import { dataUrlBytes, imageExtension } from '../shared/exportImage'
import type { Card, GameId } from '../shared/types'
import { getLanguage, t } from '../shared/i18n'
import { CardImageViewer } from './CardImageViewer'

/** How many picked cards show at a time; Show more adds this many again. */
const RESULTS_PAGE = 60

/**
 * The tier list maker (shared/tierLists.ts): every game's saved lists (it opens on the game you're
 * on), and the editor for one, where cards from that game's card data are added, dragged (or tapped)
 * into tiers, and saved as a picture.
 */
export function TierListModal({ gameId: startGameId, onClose }: { gameId: GameId; onClose: () => void }) {
  const [gameId, setGameId] = useState<GameId>(startGameId)
  const adapter = getAdapter(gameId)
  const catalog = useAppStore((s) => s.catalogs[gameId])
  const cachedCount = useAppStore((s) => s.syncMeta[gameId]?.count ?? 0)
  const progress = useAppStore((s) => s.syncProgress[gameId])
  const syncing = progress != null && !progress.done
  const all = useAppStore((s) => s.settings.tierLists)
  const lists = useMemo(() => (all ?? []).filter((l) => l.gameId === gameId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [all, gameId])
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = lists.find((l) => l.id === activeId) ?? null
  const [name, setName] = useState('')
  const [syncError, setSyncError] = useState<string | null>(null)

  // The picked game's cards, when they're downloaded but not loaded yet (only the game you're on loads at startup).
  useEffect(() => {
    if (!catalog && cachedCount > 0) void useAppStore.getState().loadCatalog(gameId).catch(() => undefined)
  }, [gameId, catalog, cachedCount])

  function pickGame(id: GameId) {
    setGameId(id)
    setActiveId(null)
    setSyncError(null)
  }

  function download() {
    setSyncError(null)
    useAppStore
      .getState()
      .syncCatalog(gameId)
      .catch((err) => setSyncError(err instanceof Error ? err.message : String(err)))
  }

  function create() {
    const list = newTierList(gameId, name.trim() || t.tierLists.defaultName(adapter.shortName))
    useAppStore.getState().saveTierList(list)
    setActiveId(list.id)
    setName('')
  }

  return (
    <Modal label={t.tierLists.title(adapter.shortName)} className="tier-modal" onClose={onClose}>
      <div className="modal-header">
        <span>{t.tierLists.title(adapter.shortName)}</span>
        <button className="btn" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
      {!active && (
        <div className="tier-games" role="group" aria-label={t.tierLists.pickGame}>
          {GAME_LIST.map((game) => {
            const count = (all ?? []).filter((l) => l.gameId === game.id).length
            return (
              <button key={game.id} className={`btn ${game.id === gameId ? 'btn-primary' : ''}`} aria-pressed={game.id === gameId} onClick={() => pickGame(game.id)}>
                {game.shortName}
                {count > 0 ? ` (${count})` : ''}
              </button>
            )
          })}
        </div>
      )}
      {!catalog?.cards.length ? (
        cachedCount > 0 ? (
          <div className="text-dim">{t.tierLists.loadingCards(adapter.shortName)}</div>
        ) : (
          <div className="tier-home">
            <div className="text-dim">{t.tierLists.noCards(adapter.shortName)}</div>
            <div>
              <button className="btn btn-primary" disabled={syncing} onClick={download}>
                {syncing ? t.sidebar.syncing(progress?.loaded ?? 0, progress?.total ?? '?') : t.sidebar.syncCardData}
              </button>
            </div>
            {(syncError ?? progress?.error) && <div className="sync-error">{syncError ?? progress?.error}</div>}
          </div>
        )
      ) : active ? (
        <TierEditor key={active.id} list={active} cards={catalog.cards} byId={catalog.byId} onBack={() => setActiveId(null)} onOpen={setActiveId} />
      ) : (
        <div className="tier-home">
          <div className="text-dim">{t.tierLists.intro}</div>
          <form className="tier-new" onSubmit={(e) => (e.preventDefault(), create())}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.tierLists.namePlaceholder} aria-label={t.tierLists.namePlaceholder} />
            <button className="btn btn-primary" type="submit">
              {t.tierLists.create}
            </button>
          </form>
          {lists.length === 0 ? (
            <div className="text-dim">{t.tierLists.none}</div>
          ) : (
            <div className="col-list">
              {lists.map((list) => {
                const cover = catalog.byId.get(list.tiers.find((tier) => tier.cardIds.length)?.cardIds[0] ?? list.pool[0] ?? '')
                return (
                  <button key={list.id} className="col-row tier-list-row" onClick={() => setActiveId(list.id)}>
                    {cover?.imageUrlSmall ? <img className="deck-entry-thumb" src={cover.imageUrlSmall} alt="" loading="lazy" /> : <span className="deck-entry-thumb" />}
                    <span className="col-name">{list.name || t.tierLists.untitled}</span>
                    <span className="text-dim">{t.tierLists.row(rankedCount(list), cardCount(list))}</span>
                    <span className="text-dim">{new Date(list.updatedAt).toLocaleDateString(getLanguage(), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function TierEditor(props: { list: TierList; cards: readonly Card[]; byId: Map<string, Card>; onBack: () => void; onOpen: (id: string) => void }) {
  const { list, cards, byId, onBack, onOpen } = props
  const { saveTierList, deleteTierList } = useAppStore.getState()
  const decks = useAppStore((s) => s.decks)
  const gameDecks = useMemo(() => decks.filter((d) => d.gameId === list.gameId).sort((a, b) => a.name.localeCompare(b.name)), [decks, list.gameId])
  const sets = useMemo(() => setsOf(cards), [cards])
  const lookup = (id: string) => byId.get(id)
  const save = (next: TierList) => next !== list && saveTierList(next)

  const types = useMemo(() => typeOptions(cards), [cards])
  const [query, setQuery] = useState('')
  const [setId, setSetId] = useState('')
  const [type, setType] = useState('')
  const [deckId, setDeckId] = useState('')
  const [onePrinting, setOnePrinting] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropRow, setDropRow] = useState<TierSpot | null>(null)
  const [viewing, setViewing] = useState<Card | null>(null)
  const [exporting, setExporting] = useState(false)

  const inList = useMemo(() => new Set([...list.pool, ...list.tiers.flatMap((tier) => tier.cardIds)]), [list])
  const pick = { query, setId, type, onePrinting }
  const picking = isPicking(pick)
  const picked = useMemo(() => pickCards(cards, { query, setId, type, onePrinting }), [cards, query, setId, type, onePrinting])
  const notInList = picked.filter((c) => !inList.has(c.id))
  // Show more, until the search or a filter changes.
  const pickKey = JSON.stringify(pick)
  const [shown, setShown] = useState({ key: pickKey, count: RESULTS_PAGE })
  const shownCount = shown.key === pickKey ? shown.count : RESULTS_PAGE
  const searchRef = useRef<HTMLInputElement>(null)
  // A card picked and then removed (or gone from the data) isn't picked any more.
  const selectedCard = selected && inList.has(selected) ? (byId.get(selected) ?? null) : null

  function add(ids: string[]) {
    const next = addCards(list, ids)
    const added = cardCount(next) - cardCount(list)
    save(next)
    const wanted = ids.filter((id) => !inList.has(id)).length
    setMessage(added < wanted ? t.tierLists.full(MAX_CARDS) : t.tierLists.added(added))
  }

  function sendSelected(to: TierSpot) {
    if (!selectedCard) return
    save(moveCard(list, selectedCard.id, to))
  }

  function removeSelected() {
    if (!selectedCard) return
    save(removeCard(list, selectedCard.id))
    setSelected(null)
  }

  // Keys for the picked card: 1–9 a tier, 0 Unranked, Delete/Backspace removes it.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedCard || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      if (/^[1-9]$/.test(e.key)) {
        const tier = list.tiers[Number(e.key) - 1]
        if (tier) {
          e.preventDefault()
          save(moveCard(list, selectedCard.id, tier.id))
        }
      } else if (e.key === '0') {
        e.preventDefault()
        save(moveCard(list, selectedCard.id, POOL))
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        removeSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function onRowDragOver(e: DragEvent, spot: TierSpot) {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropRow !== spot) setDropRow(spot)
  }

  function onDrop(e: DragEvent, spot: TierSpot, beforeId: string | null) {
    e.preventDefault()
    e.stopPropagation()
    const id = dragId ?? e.dataTransfer.getData('text/plain')
    setDragId(null)
    setDropRow(null)
    if (!id) return
    if (inList.has(id)) save(moveCard(list, id, spot, beforeId))
    // A card dragged in from the search results joins the list where it's dropped.
    else if (byId.has(id)) {
      if (cardCount(list) >= MAX_CARDS) setMessage(t.tierLists.full(MAX_CARDS))
      else save(moveCard(list, id, spot, beforeId))
    }
  }

  function cardTile(id: string, spot: TierSpot) {
    const card = byId.get(id)
    const name = card?.name ?? id
    return (
      <button
        key={id}
        type="button"
        className={`tier-card ${selected === id ? 'selected' : ''} ${dragId === id ? 'dragging' : ''} ${card?.orientation === 'landscape' ? 'landscape' : ''}`}
        title={name}
        aria-label={name}
        aria-pressed={selected === id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', id)
          e.dataTransfer.effectAllowed = 'move'
          setDragId(id)
        }}
        onDragEnd={() => {
          setDragId(null)
          setDropRow(null)
        }}
        onDragOver={(e) => onRowDragOver(e, spot)}
        onDrop={(e) => onDrop(e, spot, id)}
        onClick={(e) => {
          e.stopPropagation()
          setSelected(selected === id ? null : id)
        }}
        onDoubleClick={() => card && setViewing(card)}
      >
        {card?.imageUrlSmall || card?.imageUrl ? <img src={card.imageUrlSmall ?? card.imageUrl ?? ''} alt="" loading="lazy" draggable={false} /> : <span className="tier-card-name">{name}</span>}
      </button>
    )
  }

  function rowProps(spot: TierSpot) {
    return {
      className: `tier-cards ${dropRow === spot ? 'drop' : ''} ${selectedCard && spotOf(list, selectedCard.id) !== spot ? 'can-take' : ''}`,
      onDragOver: (e: DragEvent) => onRowDragOver(e, spot),
      onDragLeave: (e: DragEvent) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null) && dropRow === spot) setDropRow(null)
      },
      onDrop: (e: DragEvent) => onDrop(e, spot, null),
      onClick: () => sendSelected(spot),
    }
  }

  return (
    <div className="tier-editor">
      <div className="tier-toolbar">
        <button className="btn" onClick={onBack}>
          {t.tierLists.back}
        </button>
        <input className="tier-name" value={list.name} onChange={(e) => save({ ...list, name: e.target.value })} placeholder={t.tierLists.untitled} aria-label={t.tierLists.namePlaceholder} />
        <button className="btn btn-primary" disabled={rankedCount(list) + list.pool.length === 0} onClick={() => setExporting(true)}>
          {t.tierLists.export}
        </button>
        <button
          className="btn"
          onClick={() => {
            const copy = duplicateTierList(list, t.tierLists.copyName(list.name || t.tierLists.untitled))
            saveTierList(copy)
            onOpen(copy.id)
          }}
        >
          {t.tierLists.duplicate}
        </button>
        <button className="btn" disabled={rankedCount(list) === 0} onClick={() => confirm(t.tierLists.resetConfirm) && save(resetRanks(list))}>
          {t.tierLists.reset}
        </button>
        <button
          className="btn"
          onClick={() => {
            if (!confirm(t.tierLists.deleteConfirm(list.name || t.tierLists.untitled))) return
            deleteTierList(list.id)
            onBack()
          }}
        >
          {t.tierLists.delete}
        </button>
      </div>
      {exporting && <TierExportModal list={list} lookup={lookup} onClose={() => setExporting(false)} />}
      {viewing && <CardImageViewer card={viewing} onClose={() => setViewing(null)} />}

      <div className="tier-main">
      <div className="tier-board">
        {list.tiers.map((tier, i) => (
          <div key={tier.id} className="tier-row">
            <div className="tier-label" style={{ background: tier.color }}>
              <input className="tier-label-input" value={tier.label} maxLength={40} onChange={(e) => save(updateTier(list, tier.id, { label: e.target.value }))} aria-label={t.tierLists.tierLabel} />
              <div className="tier-label-tools">
                <input type="color" value={tier.color} onChange={(e) => save(updateTier(list, tier.id, { color: e.target.value }))} title={t.tierLists.tierColor} aria-label={t.tierLists.tierColor} />
                <button className="tier-icon-btn" disabled={i === 0} title={t.common.moveUp} aria-label={t.common.moveUp} onClick={() => save(shiftTier(list, tier.id, -1))}>
                  ▲
                </button>
                <button className="tier-icon-btn" disabled={i === list.tiers.length - 1} title={t.common.moveDown} aria-label={t.common.moveDown} onClick={() => save(shiftTier(list, tier.id, 1))}>
                  ▼
                </button>
                <button className="tier-icon-btn" title={t.tierLists.removeTier} aria-label={t.tierLists.removeTier} onClick={() => save(removeTier(list, tier.id))}>
                  ✕
                </button>
              </div>
            </div>
            <div {...rowProps(tier.id)}>{tier.cardIds.map((id) => cardTile(id, tier.id))}</div>
          </div>
        ))}
        <div className="tier-board-tools">
          <button className="btn" disabled={list.tiers.length >= MAX_TIERS} onClick={() => save(addTier(list))}>
            {t.tierLists.addTier}
          </button>
          <span className="text-dim desktop-only">{t.tierLists.dragHint}</span>
        </div>
      </div>

      {selectedCard && (
        <div className="tier-picked" role="toolbar" aria-label={t.tierLists.moveTo(selectedCard.name)}>
          <span className="tier-picked-name">{t.tierLists.moveTo(selectedCard.name)}</span>
          {list.tiers.map((tier, i) => (
            <button key={tier.id} className="btn tier-picked-btn" style={{ background: tier.color }} title={i < 9 ? `${i + 1}` : undefined} onClick={() => sendSelected(tier.id)}>
              {tier.label || '—'}
            </button>
          ))}
          <button className="btn" title="0" onClick={() => sendSelected(POOL)}>
            {t.tierLists.unranked}
          </button>
          <button className="btn" onClick={() => setViewing(selectedCard)}>
            {t.tierLists.viewCard}
          </button>
          <button className="btn" onClick={removeSelected}>
            {t.tierLists.removeCard}
          </button>
        </div>
      )}

      <div className="tier-pool">
        <div className="tier-pool-head">
          <b>
            {t.tierLists.unranked} ({list.pool.length})
          </b>
          {list.pool.length > 0 && (
            <button className="btn" onClick={() => confirm(t.tierLists.clearPoolConfirm(list.pool.length)) && save({ ...list, pool: [] })}>
              {t.tierLists.clearPool}
            </button>
          )}
        </div>
        <div {...rowProps(POOL)}>
          {list.pool.length === 0 && <span className="text-dim tier-pool-empty">{t.tierLists.poolEmpty}</span>}
          {list.pool.map((id) => cardTile(id, POOL))}
        </div>
      </div>

      </div>

      <div className="tier-add" aria-label={t.tierLists.addCards} role="search">
        <b>{t.tierLists.addCards}</b>
        <input ref={searchRef} className="search-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.tierLists.search} aria-label={t.tierLists.search} />
        <div className="tier-add-row">
          <select value={setId} onChange={(e) => setSetId(e.target.value)} aria-label={t.tierLists.setFilter}>
            <option value="">{t.tierLists.allSets}</option>
            {sets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name} ({set.cards.length})
              </option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t.tierLists.typeFilter}>
            <option value="">{t.tierLists.allTypes}</option>
            {types.types.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.count})
              </option>
            ))}
            {types.subtypes.length > 0 && (
              <optgroup label={t.tierLists.subtypes}>
                {types.subtypes.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.count})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <label className="packs-check">
          <input type="checkbox" checked={onePrinting} onChange={(e) => setOnePrinting(e.target.checked)} /> {t.tierLists.onePrinting}
        </label>
        {picking ? (
          <div className="tier-add-row">
            <span className="text-dim">{t.tierLists.matches(picked.length)}</span>
            <button className="btn btn-primary" disabled={notInList.length === 0} onClick={() => add(notInList.map((c) => c.id))}>
              {t.tierLists.addAll(notInList.length)}
            </button>
            {(query || setId || type) && (
              <button
                className="btn"
                onClick={() => {
                  setQuery('')
                  setSetId('')
                  setType('')
                  searchRef.current?.focus()
                }}
              >
                {t.tierLists.clearFilters}
              </button>
            )}
          </div>
        ) : (
          <div className="text-dim tier-add-hint">{t.tierLists.addHint}</div>
        )}
        {message && <div className="text-dim">{message}</div>}
        {picked.length > 0 && (
          <div className="tier-results">
            {picked.slice(0, shownCount).map((card) => {
              const there = inList.has(card.id)
              return (
                <button
                  key={card.id}
                  className={`tier-result ${card.orientation === 'landscape' ? 'landscape' : ''}`}
                  disabled={there}
                  title={there ? t.tierLists.inList : card.name}
                  draggable={!there}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', card.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDragId(card.id)
                  }}
                  onDragEnd={() => {
                    setDragId(null)
                    setDropRow(null)
                  }}
                  onClick={() => add([card.id])}
                >
                  {card.imageUrlSmall ? <img src={card.imageUrlSmall} alt="" loading="lazy" draggable={false} /> : <span className="tier-result-noimg" />}
                  <span className="tier-result-name">{card.name}</span>
                  <span className="text-dim tier-result-meta">
                    {card.setCode} · {card.number}
                    {there ? ` · ${t.tierLists.inList}` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {picked.length > shownCount && (
          <button className="btn" onClick={() => setShown({ key: pickKey, count: shownCount + RESULTS_PAGE })}>
            {t.tierLists.showMore(picked.length - shownCount)}
          </button>
        )}
        {gameDecks.length > 0 && (
          <div className="tier-add-row tier-add-deck">
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)} aria-label={t.tierLists.pickDeck}>
              <option value="">{t.tierLists.pickDeck}</option>
              {gameDecks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
            <button
              className="btn"
              disabled={!deckId}
              onClick={() => {
                const deck = gameDecks.find((d) => d.id === deckId)
                if (deck) add([...new Set(Object.values(deck.zones).flatMap((entries) => entries.map((e) => e.cardId)))].filter((id) => byId.has(id)))
              }}
            >
              {t.tierLists.addDeck}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function fileName(list: TierList, dataUrl: string): string {
  const base = (list.name || t.tierLists.untitled).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'tier list'
  return `${base}.${imageExtension(dataUrl)}`
}

/** The tier list as a picture (lib/tierListImage.ts) to save, copy or share, or as text. */
function TierExportModal({ list, lookup, onClose }: { list: TierList; lookup: (id: string) => Card | undefined; onClose: () => void }) {
  const [includePool, setIncludePool] = useState(false)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'image' | 'text' | null>(null)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    let cancelled = false
    setImageDataUrl(null)
    setFile(null)
    setError(null)
    renderTierListImage(list, lookup, { includePool }, (done, total) => !cancelled && setProgress({ done, total }))
      .then(async (dataUrl) => {
        if (cancelled) return
        setImageDataUrl(dataUrl)
        const blob = await (await fetch(dataUrl)).blob()
        const candidate = new File([blob], fileName(list, dataUrl), { type: blob.type })
        if (!cancelled && typeof navigator.canShare === 'function' && navigator.canShare({ files: [candidate] })) setFile(candidate)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a snapshot of the list as the dialog opened
  }, [includePool])

  function flash(what: 'image' | 'text') {
    setCopied(what)
    setTimeout(() => setCopied(null), 1500)
  }

  async function copyImage() {
    if (!imageDataUrl) return
    try {
      await window.api.clipboard.writeImage(imageDataUrl)
      flash('image')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function copyText() {
    await window.api.clipboard.writeText(tierListText(list, lookup))
    flash('text')
  }

  return (
    <Modal label={t.tierLists.exportHeading} className="export-modal tier-export-modal" onClose={onClose}>
      <div className="modal-header">
        <span>{t.tierLists.exportHeading}</span>
        <button className="btn" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
      {list.pool.length > 0 && (
        <label className="packs-check">
          <input type="checkbox" checked={includePool} onChange={(e) => setIncludePool(e.target.checked)} /> {t.tierLists.includePool}
        </label>
      )}
      <div className="export-actions">
        {file && (
          <button className="btn btn-primary" onClick={() => void navigator.share({ files: [file], title: list.name }).catch(() => {})}>
            {t.tierLists.shareNative}
          </button>
        )}
        {imageDataUrl && (
          <button className={file ? 'btn' : 'btn btn-primary'} onClick={() => void window.api.exportSaveImage(imageDataUrl, fileName(list, imageDataUrl))}>
            {t.tierLists.saveImage(imageExtension(imageDataUrl), (dataUrlBytes(imageDataUrl) / 1048576).toFixed(1))}
          </button>
        )}
        {imageDataUrl && (
          <button className="btn" onClick={() => void copyImage()}>
            {copied === 'image' ? t.common.copied : t.tierLists.copyImage}
          </button>
        )}
        <button className="btn" onClick={() => void copyText()}>
          {copied === 'text' ? t.common.copied : t.tierLists.copyText}
        </button>
      </div>
      {error && <div className="sync-error">{t.exportCommon.imageFailed(error)}</div>}
      {!imageDataUrl && !error && <div className="text-dim">{t.tierLists.rendering(progress?.done ?? 0, progress?.total ?? 0)}</div>}
      {imageDataUrl && (
        <div className="image-preview">
          <img src={imageDataUrl} alt={t.tierLists.imageAlt} />
        </div>
      )}
    </Modal>
  )
}
