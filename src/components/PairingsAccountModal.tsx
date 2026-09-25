import { useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { PAIRINGS_APP_URL } from '../shared/pairingsRecord'
import { t } from '../shared/i18n'
import { Rich } from './Rich'

interface Props {
  onClose: () => void
}

/** Log in to Pairings (the tournament tracker) so deck views can show each deck's results. Read-only;
 * a different account from Pawmodoro's, so it has its own form rather than sharing that one. It walks
 * through the whole link as numbered steps, since half of it happens in Pairings. */
export function PairingsAccountModal({ onClose }: Props) {
  const pairingsConfig = useAppStore((s) => s.pairingsConfig)
  const pairingsRecords = useAppStore((s) => s.pairingsRecords)
  const decksWithResults = Object.values(pairingsRecords ?? {}).filter((r) => r.length > 0).length
  const connectPairings = useAppStore((s) => s.connectPairings)
  const disconnectPairings = useAppStore((s) => s.disconnectPairings)

  const [email, setEmail] = useState(pairingsConfig.email)
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  function openPairings(e: MouseEvent) {
    e.preventDefault()
    void window.api.system.openExternal(PAIRINGS_APP_URL)
  }

  async function handleConnect() {
    setConnecting(true)
    setConnectError(null)
    try {
      await connectPairings(email.trim(), password)
      setPassword('')
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.pairingsAccount.title}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <div className="pawmodoro-box">
          <div className="text-dim">{t.pairingsAccount.intro}</div>
          <ol className="pr-steps">
            <li className={pairingsConfig.connected ? 'done' : ''}>
              <b>{t.pairingsAccount.step1}</b>{' '}
              {pairingsConfig.connected ? (
                <span className="text-dim">{t.pairingsAccount.connectedAs(pairingsConfig.email)}</span>
              ) : (
                <span className="text-dim">
                  {t.pairingsAccount.step1Help}{' '}
                  <a href={PAIRINGS_APP_URL} onClick={openPairings}>
                    {t.pairingsAccount.createOne}
                  </a>
                  .
                </span>
              )}
              {!pairingsConfig.connected && (
                <form
                  className="pawmodoro-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handleConnect()
                  }}
                >
                  <input placeholder={t.pairingsAccount.email} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <input
                    type="password"
                    placeholder={t.pairingsAccount.password}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary" disabled={connecting || !email.trim() || !password}>
                    {connecting ? t.common.connecting : t.common.connect}
                  </button>
                </form>
              )}
              {connectError && <div className="sync-error">{t.common.couldntConnect(connectError)}</div>}
            </li>
            <li>
              <b>{t.pairingsAccount.step2}</b>{' '}
              <span className="text-dim">
                {t.pairingsAccount.step2Open}{' '}
                <a href={PAIRINGS_APP_URL} onClick={openPairings}>
                  Pairings
                </a>
                <Rich text={t.pairingsAccount.step2Help} />
              </span>
            </li>
            <li>
              <b>{t.pairingsAccount.step3}</b>{' '}
              <span className="text-dim">
                <Rich text={t.pairingsAccount.step3Help} />
              </span>
            </li>
          </ol>
          {pairingsConfig.connected && (
            <>
              <div className="text-dim">
                {decksWithResults > 0 ? t.pairingsAccount.decksWithResults(decksWithResults) : t.pairingsAccount.noResults}
              </div>
              <div className="wishlist-actions">
                <button className="btn" onClick={disconnectPairings}>
                  {t.common.disconnect}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
