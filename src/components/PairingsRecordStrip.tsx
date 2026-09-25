import { useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { summarizeRecord, type Matchup } from '../shared/pairingsRecord'
import type { Deck } from '../shared/types'
import { PairingsAccountModal } from './PairingsAccountModal'
import { t } from '../shared/i18n'

/** This deck's tournament record from Pairings, under the deck view's header (see shared/pairingsRecord.ts). */
export function PairingsRecordStrip({ deck }: { deck: Deck }) {
  const config = useAppStore((s) => s.pairingsConfig)
  const records = useAppStore((s) => s.pairingsRecords)
  const loading = useAppStore((s) => s.pairingsLoading)
  const error = useAppStore((s) => s.pairingsError)
  const loadRecords = useAppStore((s) => s.loadPairingsRecords)
  const [showAccount, setShowAccount] = useState(false)
  const [open, setOpen] = useState(false)

  // The store fetches results at startup, on connect, on ↻ and when you come back to the window:
  // one call covers every linked deck, so nothing is fetched per deck here.
  const results = records?.[deck.id]
  const summary = useMemo(() => (results?.length ? summarizeRecord(results) : null), [results])

  const account = showAccount && <PairingsAccountModal onClose={() => setShowAccount(false)} />

  if (!config.connected) {
    return (
      <div className="pr-strip">
        <button className="btn pr-connect" onClick={() => setShowAccount(true)} title={t.pairingsStrip.connectTitle}>
          {t.pairingsStrip.connect}
        </button>
        {account}
      </div>
    )
  }

  let body
  if (loading && records === null) body = <span className="text-dim">{t.pairingsStrip.loading}</span>
  else if (error) body = <span className="sync-error">{t.pairingsStrip.loadFailed(error)}</span>
  else if (!summary)
    body = (
      <span className="text-dim">{t.pairingsStrip.noResults}</span>
    )
  else
    body = (
      <button className="pr-total" onClick={() => setOpen(!open)} aria-expanded={open}>
        🏆 <b>{summary.wins}-{summary.losses}{summary.draws ? `-${summary.draws}` : ''}</b>
        {summary.winRate != null && <span> · {t.pairingsStrip.winRate(summary.winRate)}</span>}
        <span className="text-dim">
          {' '}
          · {t.pairingsStrip.events(summary.events)} {open ? '▴' : '▾'}
        </span>
      </button>
    )

  return (
    <div className="pr-strip">
      <div className="pr-row">
        {body}
        <span className="pr-tools">
          <button className="btn" onClick={() => void loadRecords()} disabled={loading} title={t.pairingsStrip.refreshTitle}>
            {loading ? '…' : '↻'}
          </button>
          <button className="btn" onClick={() => setShowAccount(true)} title={t.pairingsStrip.accountTitle(config.email)}>
            ⚙
          </button>
        </span>
      </div>
      {open && summary && (summary.bestAgainst.length > 0 || summary.toughestAgainst.length > 0) && (
        <div className="pr-matchups">
          {summary.bestAgainst.length > 0 && (
            <span>
              <span className="text-dim">{t.pairingsStrip.bestAgainst}</span>
              {summary.bestAgainst.map(matchupLabel).join(', ')}
            </span>
          )}
          {summary.toughestAgainst.length > 0 && (
            <span>
              <span className="text-dim">{t.pairingsStrip.toughest}</span>
              {summary.toughestAgainst.map(matchupLabel).join(', ')}
            </span>
          )}
        </div>
      )}
      {open && summary && (
        <ul className="pr-list">
          {summary.results.map((r, i) => (
            <li key={`${r.date}-${r.event}-${i}`}>
              <span className="text-dim">{r.date}</span>
              <span className="pr-event">{r.event || t.pairingsStrip.event}</span>
              <span className="text-dim">{[r.format, r.store].filter(Boolean).join(' · ')}</span>
              <span>{r.placement}</span>
              <b>{r.record}</b>
              {r.inProgress && <span className="text-dim">{t.pairingsStrip.inProgress}</span>}
            </li>
          ))}
        </ul>
      )}
      {account}
    </div>
  )
}

function matchupLabel(m: Matchup): string {
  return `${m.opponent} ${m.wins}-${m.losses}${m.draws ? `-${m.draws}` : ''}`
}
