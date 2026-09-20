import type { LegalityResult } from '../shared/types'

const STALE_AFTER_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

// Outside the component so the render stays a pure function of its props.
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
}

function describeAge(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

interface Props {
  result: LegalityResult
  /**
   * Set for games whose ban list/rotation is kept by hand: when it was last
   * reviewed (ISO), plus a way to open the editor. Omit for API-driven legality.
   */
  banList?: { reviewedAt: string | undefined; onEdit: () => void }
}

export function LegalityPanel({ result, banList }: Props) {
  const age = banList?.reviewedAt ? daysSince(banList.reviewedAt) : null
  const stale = age != null && age > STALE_AFTER_DAYS

  return (
    <div className={`legality-panel ${result.legal ? 'legal' : 'illegal'}`}>
      <div className="legality-summary">{result.legal ? '✓ Deck is legal' : `✗ ${result.issues.length} issue${result.issues.length === 1 ? '' : 's'}`}</div>
      {result.issues.length > 0 && (
        <ul className="legality-issues">
          {result.issues.map((issue, i) => (
            <li key={i} className={issue.severity}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {banList && (
        <div className="legality-banlist">
          <span className={stale ? 'ban-stale' : 'text-dim'}>
            Ban list &amp; rotation {age == null ? 'never reviewed' : `last reviewed ${describeAge(age)}`}
            {stale ? ' — may be out of date' : ''}
          </span>
          <button className="btn" onClick={banList.onEdit}>
            Edit ban list…
          </button>
        </div>
      )}
    </div>
  )
}
