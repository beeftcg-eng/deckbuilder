import type { Record as PracticeRecordRow } from '../../shared/practice/results'
import { t } from '../../shared/i18n'

/** Your record with this deck against each opponent you've practised against. */
export function PracticeRecord({ records }: { records: PracticeRecordRow[] }) {
  return (
    <details className="rb-records">
      <summary>{t.practiceGame.recordTitle(records.reduce((n, r) => n + r.wins, 0), records.reduce((n, r) => n + r.losses, 0))}</summary>
      <ul>
        {records.map((r) => (
          <li key={r.opponentId}>
            {r.opponentName}: {t.practiceGame.winLoss(r.wins, r.losses)}
          </li>
        ))}
      </ul>
    </details>
  )
}
