import { useState, type CSSProperties } from 'react'
import { useAppStore } from '../state/useAppStore'
import { coreDeck, type ListCards } from '../shared/communityMeta'
import { DOMAIN_COLORS } from '../lib/domainColors'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'
import { useDeckLists } from './community/useDeckLists'

/**
 * A Riftbound deck with its Legend picked (or a One Piece deck with its Leader) and nothing else yet:
 * offers to fill it from the recent Community lists with that card (the newest one, or the cards most
 * of them agree on). Undo puts the empty deck back.
 */
export function CommunityStartHint({ deck }: { deck: Deck }) {
  const [dismissed, setDismissed] = useState(false)
  const identityZone = deck.gameId === 'riftbound' ? 'legend' : deck.gameId === 'onepiece' ? 'leader' : null
  const empty = !deck.locked && Object.entries(deck.zones).every(([zoneId, entries]) => zoneId === identityZone || !entries.length)
  const picked = !!identityZone && !!deck.zones[identityZone]?.length
  const show = picked && empty && !dismissed
  const { decks, cardsById, identityCard, gameId } = useDeckLists(deck, show)

  if (!show || !identityCard || !decks.length) return null

  // The deck keeps its own Legend or Leader printing; everything else comes from the lists.
  const fill = (from: ListCards) =>
    void useAppStore
      .getState()
      .updateDeck((d) => ({ ...d, zones: { ...from.zones, [identityZone!]: d.zones[identityZone!] }, freeTextZones: from.freeTextZones }), t.communityLists.hintTitle(identityCard.name))
  const accent = DOMAIN_COLORS[identityCard.colors[0]] ?? 'var(--accent)'

  return (
    <div className="community-hint" style={{ '--domain-a': accent } as CSSProperties}>
      <div>
        <b>{t.communityLists.hintTitle(identityCard.name)}</b>
        <div className="text-dim">{t.communityLists.hintBody(gameId, decks.length)}</div>
      </div>
      <div className="community-actions">
        <button className="btn btn-primary" onClick={() => fill(decks[0])}>
          {t.communityLists.hintNewest}
        </button>
        <button className="btn" title={t.communityLists.coreTitle(gameId)} onClick={() => fill(coreDeck(decks, cardsById))}>
          {t.communityLists.hintCore}
        </button>
        <button className="btn" onClick={() => setDismissed(true)}>
          {t.communityLists.hintDismiss}
        </button>
      </div>
    </div>
  )
}
