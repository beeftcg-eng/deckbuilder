import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { PAIRINGS_APP_URL, deckStatsFor, deckVersionsOf, type OpponentLine, type StatLine } from '../shared/pairingsRecord'
import type { Deck, PairingsVersion } from '../shared/types'
import { getLanguage, t } from '../shared/i18n'
import { PairingsAccountModal } from './PairingsAccountModal'

/** Past ten opponents, the rest fold away (as in Pairings). */
const OPPONENTS_SHOWN = 10

function recordText(s: StatLine): string {
  return `${s.wins}-${s.losses}${s.draws ? `-${s.draws}` : ''}`
}

function rateText(s: StatLine): string {
  return s.winRate != null ? `${s.winRate}%` : '—'
}

function friendlyDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(getLanguage(), { year: 'numeric', month: 'short', day: 'numeric' })
}

/** "Version 2 · since Sep 10, 2026 · 51 cards · more removal", like Pairings' versionLabel. */
function versionLabel(v: PairingsVersion): string {
  const bits = [t.deckStatsModal.versionN(v.n), v.from ? t.deckStatsModal.since(friendlyDate(v.from)) : t.deckStatsModal.first]
  if (v.cardCount) bits.push(t.common.cards(v.cardCount))
  if (v.note) bits.push(v.note)
  return bits.join(' · ')
}

function StatRow({ name, stat, tone, onClick }: { name: string; stat: StatLine; tone?: 'good' | 'bad' | 'auto'; onClick?: () => void }) {
  const color = tone === 'auto' ? (stat.winRate == null ? undefined : stat.winRate >= 50 ? 'good' : 'bad') : tone
  const body = (
    <>
      <span className="ps-row-main">
        <span className="ps-row-name">{name}</span>
        <span className="text-dim">
          {recordText(stat)} · {t.deckStatsModal.games(stat.games)}
        </span>
      </span>
      <span className={`ps-row-rate ${color ? `ps-${color}` : ''}`}>{rateText(stat)}</span>
    </>
  )
  return onClick ? (
    <button className="ps-row ps-row-btn" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="ps-row">{body}</div>
  )
}

function opponentRows(list: OpponentLine[], tone: 'good' | 'bad' | 'auto') {
  return list.map((o) => <StatRow key={o.opponent} name={o.opponent} stat={o} tone={tone} />)
}

/**
 * This deck's tournament stats from Pairings, laid out like Pairings' own "Stats & versions" screen:
 * totals, turn order, each version, what it beats and loses to, every opponent, and the events.
 */
export function PairingsStatsModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const config = useAppStore((s) => s.pairingsConfig)
  const records = useAppStore((s) => s.pairingsRecords)
  const link = useAppStore((s) => s.pairingsLinks?.[deck.id])
  const loading = useAppStore((s) => s.pairingsLoading)
  const error = useAppStore((s) => s.pairingsError)
  const loadRecords = useAppStore((s) => s.loadPairingsRecords)
  const [version, setVersion] = useState<number | undefined>(undefined)
  const [showAccount, setShowAccount] = useState(false)

  // Fresh numbers when it opens, unless they were fetched in the last minute.
  useEffect(() => {
    void loadRecords({ ifOlderThanMs: 60_000 })
  }, [loadRecords])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const results = useMemo(() => records?.[deck.id] ?? [], [records, deck.id])
  const versions = useMemo(() => deckVersionsOf(link?.versions), [link])
  const stats = useMemo(() => deckStatsFor(results, versions, version), [results, versions, version])
  const byVersion = useMemo(
    () => (version == null && versions.length > 1 ? [...versions].reverse().map((v) => ({ v, stat: deckStatsFor(results, versions, v.n).record })) : []),
    [results, versions, version],
  )
  const current = versions.find((v) => v.n === version)
  const hasTurnOrder = stats.goingFirst.games + stats.goingSecond.games > 0

  function openPairings(e: MouseEvent) {
    e.preventDefault()
    void window.api.system.openExternal(PAIRINGS_APP_URL)
  }

  let body
  if (!config.connected) {
    body = (
      <div className="ps-empty">
        <p>{t.deckStatsModal.notConnected}</p>
        <button className="btn btn-primary" onClick={() => setShowAccount(true)}>
          {t.sidebar.connectPairings}
        </button>
      </div>
    )
  } else if (loading && records === null) {
    body = <div className="text-dim">{t.pairingsStrip.loading}</div>
  } else if (error && records === null) {
    body = <div className="sync-error">{t.pairingsStrip.loadFailed(error)}</div>
  } else {
    body = (
      <>
        {versions.length > 1 && (
          <div className="color-filter-row" role="group" aria-label={t.deckStatsModal.version}>
            <button className={`color-chip ${version == null ? 'active' : ''}`} aria-pressed={version == null} onClick={() => setVersion(undefined)}>
              {t.deckStatsModal.allVersions}
            </button>
            {versions.map((v) => (
              <button key={v.n} className={`color-chip ${version === v.n ? 'active' : ''}`} aria-pressed={version === v.n} onClick={() => setVersion(v.n)}>
                {t.deckStatsModal.versionN(v.n)}
              </button>
            ))}
          </div>
        )}
        {current && <div className="text-dim">{versionLabel(current)}</div>}

        {stats.results.length === 0 ? (
          <div className="ps-empty text-dim">{version == null ? t.deckStatsModal.noResults : t.deckStatsModal.noResultsVersion}</div>
        ) : (
          <>
            <div className="ps-grid">
              <div className="ps-card">
                <b>{stats.results.length}</b>
                <span>{t.deckStatsModal.resultsLogged}</span>
              </div>
              <div className="ps-card">
                <b>{rateText(stats.record)}</b>
                <span>{t.deckStatsModal.winRate}</span>
              </div>
              <div className="ps-card">
                <b>{recordText(stats.record)}</b>
                <span>{t.deckStatsModal.record}</span>
              </div>
              <div className="ps-card">
                <b>{versions[versions.length - 1].n}</b>
                <span>{t.deckStatsModal.versions}</span>
              </div>
            </div>

            {hasTurnOrder && (
              <section>
                <h3 className="ps-label">{t.deckStatsModal.turnOrder}</h3>
                <div className="ps-grid ps-grid-2">
                  <div className="ps-card">
                    <b>{rateText(stats.goingFirst)}</b>
                    <span>
                      {t.deckStatsModal.goingFirst}
                      {stats.goingFirst.games ? ` · ${recordText(stats.goingFirst)}` : ''}
                    </span>
                  </div>
                  <div className="ps-card">
                    <b>{rateText(stats.goingSecond)}</b>
                    <span>
                      {t.deckStatsModal.goingSecond}
                      {stats.goingSecond.games ? ` · ${recordText(stats.goingSecond)}` : ''}
                    </span>
                  </div>
                </div>
                <div className="text-dim ps-hint">{t.deckStatsModal.turnOrderHint}</div>
              </section>
            )}
          </>
        )}

        {byVersion.length > 0 && (
          <section>
            <h3 className="ps-label">{t.deckStatsModal.byVersion}</h3>
            {byVersion.map(({ v, stat }) => (
              <StatRow key={v.n} name={versionLabel(v)} stat={stat} onClick={() => setVersion(v.n)} />
            ))}
          </section>
        )}

        {stats.best.length > 0 && (
          <section>
            <h3 className="ps-label">{t.deckStatsModal.whatYouBeat}</h3>
            {opponentRows(stats.best, 'good')}
          </section>
        )}
        {stats.toughest.length > 0 && (
          <section>
            <h3 className="ps-label">{t.deckStatsModal.whatYouLoseTo}</h3>
            {opponentRows(stats.toughest, 'bad')}
          </section>
        )}
        {stats.opponents.length > 0 && (
          <section>
            <h3 className="ps-label">{t.deckStatsModal.againstEach}</h3>
            {opponentRows(stats.opponents.slice(0, OPPONENTS_SHOWN), 'auto')}
            {stats.opponents.length > OPPONENTS_SHOWN && (
              <details className="ps-more">
                <summary>{t.deckStatsModal.showAll(stats.opponents.length)}</summary>
                {opponentRows(stats.opponents.slice(OPPONENTS_SHOWN), 'auto')}
              </details>
            )}
          </section>
        )}

        {stats.results.length > 0 && (
          <section>
            <h3 className="ps-label">{t.deckStatsModal.events}</h3>
            <ul className="pr-list">
              {stats.results.map((r, i) => (
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
          </section>
        )}
      </>
    )
  }

  // The account window is a sibling, not a child: React events bubble through portals, and a click on
  // its backdrop would otherwise close this window too.
  return (
    <>
      {createPortal(
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal ps-modal" role="dialog" aria-label={t.deckStatsModal.title(deck.name)} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span>{t.deckStatsModal.title(deck.name)}</span>
              <span className="ps-header-tools">
                {config.connected && (
                  <button className="btn" onClick={() => void loadRecords()} disabled={loading} title={t.pairingsStrip.refreshTitle}>
                    {loading ? '…' : '↻'}
                  </button>
                )}
                <button className="btn" onClick={onClose}>
                  {t.common.close}
                </button>
              </span>
            </div>
            <div className="text-dim">
              {t.deckStatsModal.from}{' '}
              <a href={PAIRINGS_APP_URL} onClick={openPairings}>
                {t.deckStatsModal.openPairings}
              </a>
            </div>
            <div className="ps-body">{body}</div>
          </div>
        </div>,
        document.body,
      )}
      {showAccount && <PairingsAccountModal onClose={() => setShowAccount(false)} />}
    </>
  )
}
