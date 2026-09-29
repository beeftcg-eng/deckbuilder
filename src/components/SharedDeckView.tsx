import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { DeckFullView } from './DeckFullView'
import { t } from '../shared/i18n'

const EMPTY = new Map()

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

  useEffect(() => {
    if (!gameId || !progress?.done || progress.error) return
    const { loadMeta, loadCatalog } = useAppStore.getState()
    void loadMeta(gameId).then(() => loadCatalog(gameId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, progress?.done])

  if (!state) return null

  let body
  if (state === 'ready' && shared) {
    const adapter = getAdapter(shared.deck.gameId)
    const gameFormats = formats ?? adapter.defaultFormats
    const format = gameFormats.find((f) => f.id === shared.deck.formatId) ?? gameFormats[0]
    body = (
      <>
        {!catalog && (
          <div className="shared-need-cards">
            <span>{cachedCount > 0 ? t.browser.loading(adapter.shortName) : t.share.needCards(adapter.shortName)}</span>
            {cachedCount === 0 && (
              <button className="btn btn-primary" disabled={syncing} onClick={() => useAppStore.getState().syncCatalog(shared.deck.gameId)}>
                {syncing ? t.sidebar.syncing(progress?.loaded ?? 0, progress?.total ?? '?') : t.sidebar.syncCardData}
              </button>
            )}
          </div>
        )}
        <DeckFullView
          deck={shared.deck}
          format={format}
          cardsById={catalog?.byId ?? EMPTY}
          shared={{ ownerName: shared.ownerName, onCopy: () => void copy(), onClose: close }}
        />
      </>
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
