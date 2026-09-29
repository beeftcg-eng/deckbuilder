import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { MAX_MESSAGE, reportAsText, sendBugReport, type BugReport } from '../shared/bugReport'
import { recentErrors } from '../lib/errorLog'
import { displayCurrency } from '../shared/currency'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../shared/pawmodoroDefaults'
import { t } from '../shared/i18n'

/** What the app was doing, sent with a report unless they untick the box. */
function technicalDetails(): Record<string, unknown> {
  const s = useAppStore.getState()
  const screen = s.showWishlist
    ? 'wishlist'
    : s.showCollection
      ? 'collection'
      : s.showMyDecks
        ? 'my decks'
        : s.showTrade
          ? 'trade'
          : s.showBinders
            ? 'binders'
            : s.currentDeckId
              ? 'deck'
              : 'browser'
  return {
    version: s.updateStatus?.version ?? 'unknown',
    app: __WEB__ ? 'phone app' : 'desktop',
    userAgent: navigator.userAgent,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    language: s.language,
    currency: displayCurrency(),
    game: s.currentGameId,
    screen,
    cardsDownloaded: Object.fromEntries(Object.entries(s.syncMeta).map(([game, meta]) => [game, meta?.count ?? 0])),
    decks: s.decks.length,
    signedIn: s.pawmodoroConfig.connected,
    recentErrors: recentErrors(),
  }
}

/** "Report a bug": a note to the app's author, with the app's state attached (bugReport.ts). */
export function BugReportModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [includeDetails, setIncludeDetails] = useState(true)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [details] = useState(technicalDetails)

  const report: BugReport = { message: message.trim(), contact: contact.trim(), context: includeDetails ? details : {} }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!report.message) {
      setError(t.bugReport.empty)
      setState('failed')
      return
    }
    setState('sending')
    try {
      await sendBugReport(DEFAULT_PAWMODORO_URL, DEFAULT_PAWMODORO_ANON_KEY, report)
      setState('sent')
    } catch (err) {
      setError(t.bugReport.failed(err instanceof Error ? err.message : String(err)))
      setState('failed')
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(reportAsText(report)).catch(() => undefined)
    setCopied(true)
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal bug-report-modal" onClick={(e) => e.stopPropagation()} onSubmit={send}>
        <div className="modal-header">
          <span>{t.bugReport.title}</span>
          <button type="button" className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        {state === 'sent' ? (
          <p className="bug-report-sent">{t.bugReport.sent}</p>
        ) : (
          <>
            <p className="text-dim bug-report-intro">{t.bugReport.intro}</p>
            <textarea
              className="bug-report-message"
              rows={6}
              maxLength={MAX_MESSAGE}
              autoFocus
              placeholder={t.bugReport.placeholder}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <label className="bug-report-field">
              <span className="text-dim">{t.bugReport.contact}</span>
              <input type="text" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
            </label>
            <label className="bug-report-check">
              <input type="checkbox" checked={includeDetails} onChange={(e) => setIncludeDetails(e.target.checked)} />
              {t.bugReport.details}
            </label>
            {includeDetails && (
              <details className="bug-report-details">
                <summary className="text-dim">{t.bugReport.showDetails}</summary>
                <pre>{JSON.stringify(details, null, 2)}</pre>
              </details>
            )}
            {state === 'failed' && <div className="sync-error">{error}</div>}
            <div className="bug-report-actions">
              {state === 'failed' && report.message && (
                <button type="button" className="btn" onClick={copy}>
                  {copied ? t.common.copied : t.bugReport.copy}
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
                {state === 'sending' ? t.bugReport.sending : t.bugReport.send}
              </button>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body,
  )
}
