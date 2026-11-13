import type { CSSProperties } from 'react'
import type { CommunityList } from '../../shared/communityLists'
import type { Card } from '../../shared/types'
import { DOMAIN_COLORS } from '../../lib/domainColors'
import { t } from '../../shared/i18n'

/** Helpers the Community lists window's views share (CommunityListsModal.tsx); its shared components are in communityUi.tsx. */

export const medal = (rank: number | null) => (rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank != null && rank <= 4 ? 'bronze' : '')

/** A Legend's colors, for a row's accent (CSS variables) and its pips. */
export function legendLook(card: Card | undefined): { domains: string[]; style: CSSProperties } {
  const domains = card?.colors.filter((d) => DOMAIN_COLORS[d]) ?? []
  const a = DOMAIN_COLORS[domains[0]] ?? 'var(--accent)'
  return { domains, style: { '--domain-a': a, '--domain-b': DOMAIN_COLORS[domains[1]] ?? a } as CSSProperties }
}

/** A name for the deck a list becomes: "Kennen, Heart of the Tempest – flolcsc #1". */
export const listName = (list: CommunityList) =>
  [list.legendName, [list.player, list.rank != null ? t.communityLists.place(list.rank) : null].filter(Boolean).join(' ')].filter(Boolean).join(' – ')
