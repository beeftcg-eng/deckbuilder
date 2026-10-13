import type { VsRecord } from '../../shared/communityMeta'
import type { Card } from '../../shared/types'
import { DOMAIN_COLORS } from '../../lib/domainColors'
import { t } from '../../shared/i18n'

/** Pieces the Community lists window's views share (CommunityListsModal.tsx). */

export function LegendArt({ card, name }: { card: Card | undefined; name: string }) {
  return <span className="community-legend-art">{card?.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" /> : <span>{name.slice(0, 1)}</span>}</span>
}

/** The Legend's art faded in behind a row. */
export function LegendWash({ card }: { card: Card | undefined }) {
  return card?.imageUrl ? <img className="community-wash" src={card.imageUrl} alt="" loading="lazy" aria-hidden /> : null
}

export function DomainPips({ domains }: { domains: string[] }) {
  if (!domains.length) return null
  return (
    <span className="community-domains" role="img" aria-label={t.communityLists.domainsLabel(domains.join(', '))}>
      {domains.map((d) => (
        <span key={d} className="community-domain" style={{ background: DOMAIN_COLORS[d] }} title={d} aria-hidden />
      ))}
    </span>
  )
}

/** Your record against a Legend from Pairings ("You 2–5"), colored by whether you're ahead. */
export function VsChip({ record }: { record: VsRecord | undefined }) {
  if (!record || record.wins + record.losses + record.draws === 0) return null
  const tone = record.wins > record.losses ? 'ahead' : record.wins < record.losses ? 'behind' : ''
  return (
    <span className={`community-vs ${tone}`} title={t.communityLists.youVsTitle}>
      {t.communityLists.youVs(record.wins, record.losses, record.draws)}
    </span>
  )
}
