import type { LegalityResult } from '../shared/types'

export function LegalityPanel({ result }: { result: LegalityResult }) {
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
    </div>
  )
}
