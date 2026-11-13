import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { listedCards, type BanStatus } from '../shared/banLists'
import { getAdapter } from '../shared/games/registry'
import { t } from '../shared/i18n'
import { formatLabel } from '../shared/formatText'
import type { Card, Format, GameId } from '../shared/types'
import { CardDetailModal } from './CardDetailModal'

const ORDER: BanStatus[] = ['banned', 'restricted', 'semi-restricted']

/**
 * A format's ban list, read-only, for games whose legality comes with the card data (Yu-Gi-Oh!'s
 * Forbidden / Limited / Semi-Limited, Magic's banned and restricted, Pokémon's banned).
 */
export function BanListViewModal({ gameId, format, cards, onClose }: { gameId: GameId; format: Format; cards: readonly Card[]; onClose: () => void }) {
  const [filter, setFilter] = useState('')
  const [detail, setDetail] = useState<Card | null>(null)
  const listed = useMemo(() => listedCards(cards, format.id), [cards, format.id])
  const needle = filter.trim().toLowerCase()
  const shown = needle ? listed.filter((l) => l.card.name.toLowerCase().includes(needle)) : listed
  const title = t.banLists.viewTitle(getAdapter(gameId).shortName, formatLabel(gameId, format))

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal banlist-view-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{title}</span>
          <button className="btn" onClick={onClose} aria-label={t.common.close}>
            ×
          </button>
        </div>
        {gameId === 'yugioh' && <p className="text-dim">{t.banLists.autoUpdates}</p>}
        {listed.length === 0 ? (
          <p className="text-dim">{t.banLists.empty}</p>
        ) : (
          <>
            <input className="search-input" type="search" value={filter} placeholder={t.banLists.filter} aria-label={t.banLists.filter} onChange={(e) => setFilter(e.target.value)} />
            {ORDER.map((status) => {
              const group = shown.filter((l) => l.status === status)
              if (!group.length) return null
              return (
                <section key={status} className="banlist-group">
                  <h3>
                    {t.banLists.status(gameId, status)} ({group.length})
                  </h3>
                  <ul className="banlist-names">
                    {group.map(({ card }) => (
                      <li key={card.id}>
                        <button className="link-button" onClick={() => setDetail(card)}>
                          {card.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </>
        )}
      </div>
      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
    </div>,
    document.body,
  )
}
