import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { DeckFullView } from './DeckFullView'
import { t } from '../shared/i18n'

/**
 * A deck opened from a share link (?share=<token>), over the whole app until it's closed or copied
 * into your own decks. Shows the cards once that game's card data is on this device, and offers the
 * download otherwise (a friend opening the link on a fresh phone won't have it yet).
 */
export function SharedDeckView() {
  const state = useAppStore((s) => s.sharedDeckState)
  const shared = useAppStore((s) => s.sharedDeck)
  const error = useAppStore((s) => s.sharedDeckError)
  const close = useAppStore((s) => s.closeSharedDeck)
  const copy = useAppStore((s) => s.copySharedDeck)
  const gameId = shared?.deck.gameId
  const catalog = useAppStore((s) => (gameId ? s.catalogs[gameId] : undefined))
  const cachedCount = useAppStore((s) => (gameId ? (s.syncMeta[gameId]?.count ?? 0) : 0))
  const progress = useAppStore((s) => (gameId ? s.syncProgress[gameId] : undefined))
  const formats = useAppStore((s) => (gameId ? s.formats[gameId] : undefined))
  const syncing = progress != null && !progress.done

  const metaLoaded = useAppStore((s) => (gameId ? s.syncMeta[gameId] !== undefined : false))

  // The deck's cards can only be shown from that game's card data. Already on this device: load it
  // (the link can arrive before startup has read what's downloaded, so this can't be left to
  // openSharedLink). Not on this device yet: fetch it right away, since seeing this deck is why the
  // link was opened - a friend on a fresh phone used to get "0 cards" and a button they missed.
  useEffect(() => {
    if (state !== 'ready' || !gameId || catalog || !metaLoaded) return
    const { loadCatalog, syncCatalog, syncProgress } = useAppStore.getState()
    if (cachedCount > 0) void loadCatalog(gameId)
    else if (!syncProgress[gameId]) void syncCatalog(gameId).catch(() => undefined) // the failure shows through syncProgress
  }, [state, gameId, catalog, metaLoaded, cachedCount])

  if (!state) return null

  let body
  if (state === 'ready' && shared && catalog) {
    const adapter = getAdapter(shared.deck.gameId)
    const gameFormats = formats ?? adapter.defaultFormats
    const format = gameFormats.find((f) => f.id === shared.deck.formatId) ?? gameFormats[0]
    body = (
      <DeckFullView
        deck={shared.deck}
        format={format}
        cardsById={catalog.byId}
        shared={{ ownerName: shared.ownerName, example: shared.example, onCopy: () => void copy(), onClose: close }}
      />
    )
  } else if (state === 'ready' && shared) {
    // Without the card data the deck would render as "0 cards", so show what's happening instead.
    const adapter = getAdapter(shared.deck.gameId)
    const failed = progress?.done && progress.error
    body = (
      <div className="shared-status">
        <h2>{shared.deck.name}</h2>
        {shared.ownerName && <p className="fv-shared-by">{t.share.sharedBy(shared.ownerName)}</p>}
        <p>{cachedCount > 0 ? t.browser.loading(adapter.shortName) : t.share.needCards(adapter.shortName)}</p>
        {failed && <p>{t.share.loadFailed(progress.error ?? '')}</p>}
        <div className="shared-status-actions">
          {cachedCount === 0 && (
            <button className="btn btn-primary" disabled={syncing} onClick={() => void useAppStore.getState().syncCatalog(shared.deck.gameId).catch(() => undefined)}>
              {syncing ? t.sidebar.syncing(progress?.loaded ?? 0, progress?.total ?? '?') : t.sidebar.syncCardData}
            </button>
          )}
          <button className="btn" onClick={close}>
            {t.share.close}
          </button>
        </div>
      </div>
    )
  } else {
    body = (
      <div className="shared-status">
        <p>{state === 'loading' ? t.share.loading : state === 'dead' ? t.share.dead : t.share.loadFailed(error ?? '')}</p>
        {state !== 'loading' && (
          <button className="btn" onClick={close}>
            {t.share.close}
          </button>
        )}
      </div>
    )
  }

  return createPortal(<div className="shared-deck-layer">{body}</div>, document.body)
}
