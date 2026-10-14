import { useMemo, useState, type CSSProperties } from 'react'
import { useAppStore, useCardsById } from '../state/useAppStore'
import { useCommunityLists } from '../state/communityLists'
import { coreDeck, listsForLegend, type ListCards } from '../shared/communityMeta'
import { codeIndex } from '../shared/riftboundDeckCode'
import { DOMAIN_COLORS } from '../lib/domainColors'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'

/**
 * A Riftbound deck with its Legend picked and nothing else yet: offers to fill it from RiftAtlas's
 * recent lists with that Legend (the newest one, or the cards most of them agree on). Undo puts the
 * empty deck back.
 */
export function CommunityStartHint({ deck }: { deck: Deck }) {
  const cardsById = useCardsById('riftbound')
  const legendCard = cardsById.get(deck.zones.legend?.[0]?.cardId ?? '')
  const empty = !deck.locked && !(deck.zones.main ?? []).length && !(deck.zones.battlefields ?? []).length
  const [dismissed, setDismissed] = useState(false)
  const show = deck.gameId === 'riftbound' && !!legendCard && empty && !dismissed
  const { lists } = useCommunityLists(show)

  const decks = useMemo(() => {
    if (!show || !lists || !legendCard) return []
    return listsForLegend(lists, legendCard, codeIndex(cardsById.values()))
  }, [show, lists, legendCard, cardsById])

  if (!show || !decks.length) return null

  // The deck keeps its own Legend printing; everything else comes from the lists.
  const fill = (from: ListCards) =>
    void useAppStore.getState().updateDeck((d) => ({ ...d, zones: { ...from.zones, legend: d.zones.legend }, freeTextZones: from.freeTextZones }), t.communityLists.hintTitle(legendCard!.name))
  const accent = DOMAIN_COLORS[legendCard!.colors[0]] ?? 'var(--accent)'

  return (
    <div className="community-hint" style={{ '--domain-a': accent } as CSSProperties}>
      <div>
        <b>{t.communityLists.hintTitle(legendCard!.name)}</b>
        <div className="text-dim">{t.communityLists.hintBody(decks.length)}</div>
      </div>
      <div className="community-actions">
        <button className="btn btn-primary" onClick={() => fill(decks[0])}>
          {t.communityLists.hintNewest}
        </button>
        <button className="btn" title={t.communityLists.coreTitle} onClick={() => fill(coreDeck(decks, cardsById))}>
          {t.communityLists.hintCore}
        </button>
        <button className="btn" onClick={() => setDismissed(true)}>
          {t.communityLists.hintDismiss}
        </button>
      </div>
    </div>
  )
}
