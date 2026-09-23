import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { summarizeRecord } from '../shared/pairingsRecord'
import type { Deck } from '../shared/types'
import { PairingsAccountModal } from './PairingsAccountModal'

/** This deck's tournament record from Pairings, under the deck view's header (see shared/pairingsRecord.ts). */
export function PairingsRecordStrip({ deck }: { deck: Deck }) {
  const config = useAppStore((s) => s.pairingsConfig)
  const records = useAppStore((s) => s.pairingsRecords)
  const loading = useAppStore((s) => s.pairingsLoading)
  const error = useAppStore((s) => s.pairingsError)
  const loadConfig = useAppStore((s) => s.loadPairingsConfig)
  const loadRecords = useAppStore((s) => s.loadPairingsRecords)
  const [showAccount, setShowAccount] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  // Fetched once per session (and on ↻), not per deck: one call returns every linked deck.
  useEffect(() => {
    if (config.connected && records === null && !error) void loadRecords()
  }, [config.connected, records, error, loadRecords])

  const results = records?.[deck.id]
  const summary = useMemo(() => (results?.length ? summarizeRecord(results) : null), [results])

  const account = showAccount && <PairingsAccountModal onClose={() => setShowAccount(false)} />

  if (!config.connected) {
    return (
      <div className="pr-strip">
        <button className="btn pr-connect" onClick={() => setShowAccount(true)} title="Show the results you logged with this deck in Pairings">
          🏆 Tournament record: connect Pairings
        </button>
        {account}
      </div>
    )
  }

  let body
  if (loading && records === null) body = <span className="text-dim">Loading your Pairings results…</span>
  else if (error) body = <span className="sync-error">Couldn't load Pairings results: {error}</span>
  else if (!summary)
    body = (
      <span className="text-dim">
        No Pairings results for this deck yet. In Pairings, open Decks → Import from Brewhouse to link it, then log results with it.
      </span>
    )
  else
    body = (
      <button className="pr-total" onClick={() => setOpen(!open)} aria-expanded={open}>
        🏆 <b>{summary.wins}-{summary.losses}{summary.draws ? `-${summary.draws}` : ''}</b>
        {summary.winRate != null && <span> · {summary.winRate}% wins</span>}
        <span className="text-dim">
          {' '}
          · {summary.events} event{summary.events === 1 ? '' : 's'} in Pairings {open ? '▴' : '▾'}
        </span>
      </button>
    )

  return (
    <div className="pr-strip">
      <div className="pr-row">
        {body}
        <span className="pr-tools">
          <button className="btn" onClick={() => void loadRecords()} disabled={loading} title="Fetch your latest results from Pairings">
            {loading ? '…' : '↻'}
          </button>
          <button className="btn" onClick={() => setShowAccount(true)} title={`Pairings account (${config.email})`}>
            ⚙
          </button>
        </span>
      </div>
      {open && summary && (
        <ul className="pr-list">
          {summary.results.map((r, i) => (
            <li key={`${r.date}-${r.event}-${i}`}>
              <span className="text-dim">{r.date}</span>
              <span className="pr-event">{r.event || 'Event'}</span>
              <span className="text-dim">{[r.format, r.store].filter(Boolean).join(' · ')}</span>
              <span>{r.placement}</span>
              <b>{r.record}</b>
              {r.inProgress && <span className="text-dim">(in progress)</span>}
            </li>
          ))}
        </ul>
      )}
      {account}
    </div>
  )
}
