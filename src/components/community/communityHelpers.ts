import type { CSSProperties } from 'react'
import type { CommunityList } from '../../shared/communityLists'
import type { Card } from '../../shared/types'
import { DOMAIN_COLORS } from '../../lib/domainColors'
import { t, zoneLabel } from '../../shared/i18n'

/** Helpers the Community lists window's views share (CommunityListsModal.tsx); its shared components are in communityUi.tsx. */

/** The decklist text's headings, as the deck's zone names. */
const SECTION_ZONES: Record<string, string> = { Legend: 'Legend', MainDeck: 'Main Deck', Battlefields: 'Battlefields', Runes: 'Rune Deck', Sideboard: 'Sideboard' }

/** "3 ogn-066-298 Ahri, Alluring" as "3 Ahri, Alluring", for the preview. */
const withoutSourceId = (line: string) => line.replace(/^(\d+) [a-z]+-[^\s]+ /, '$1 ')

/** Decklist text (deckCodeToText) as headed sections of [count, name]. */
export function textSections(text: string): { heading: string; cards: [string, string][] }[] {
  return text.split('\n\n').map((block) => {
    const [heading, ...lines] = block.split('\n')
    const bare = heading.replace(/:$/, '')
    return {
      heading: zoneLabel(SECTION_ZONES[bare] ?? bare),
      cards: lines.map((line) => {
        const m = /^(\d+) (.*)$/.exec(withoutSourceId(line))
        return m ? [m[1], m[2]] : ['', line]
      }),
    }
  })
}

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
