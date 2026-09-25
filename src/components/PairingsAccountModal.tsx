import { useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { PAIRINGS_APP_URL } from '../shared/pairingsRecord'

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
          <span>🏆 Connect Pairings</span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pawmodoro-box">
          <div className="text-dim">
            Pairings is the tournament tracker. Link the two and each deck here shows the record you logged with it there: wins and losses, win rate,
            and the matchups it beats or loses to.
          </div>
          <ol className="pr-steps">
            <li className={pairingsConfig.connected ? 'done' : ''}>
              <b>Log in to Pairings here.</b>{' '}
              {pairingsConfig.connected ? (
                <span className="text-dim">✓ Connected as {pairingsConfig.email}</span>
              ) : (
                <span className="text-dim">
                  Use your Pairings email and password (a separate account from your Pawmodoro login). This only reads your results; it never changes
                  anything in Pairings. No account yet?{' '}
                  <a href={PAIRINGS_APP_URL} onClick={openPairings}>
                    Create one in Pairings
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
                  <input placeholder="Pairings email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <input
                    type="password"
                    placeholder="Pairings password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary" disabled={connecting || !email.trim() || !password}>
                    {connecting ? 'Connecting…' : 'Connect'}
                  </button>
                </form>
              )}
              {connectError && <div className="sync-error">Couldn't connect: {connectError}</div>}
            </li>
            <li>
              <b>In Pairings, import your decks from Brewhouse.</b>{' '}
              <span className="text-dim">
                Open <a href={PAIRINGS_APP_URL} onClick={openPairings}>Pairings</a>, go to <b>Stats → 🃏 Manage your decks</b>, and press{' '}
                <b>Connect Brewhouse</b>. Log in there with <i>this</i> app's account (your Pawmodoro login), then press <b>Import</b> next to each
                deck you play.
              </span>
            </li>
            <li>
              <b>Log your results with those decks in Pairings.</b>{' '}
              <span className="text-dim">
                Pick the deck when you log a result on an event, or use <b>Stats → 📝 Log a result</b> for an event or testing session that isn't on
                your calendar. Results show up here in each deck's view and in My Decks.
              </span>
            </li>
          </ol>
          {pairingsConfig.connected && (
            <>
              <div className="text-dim">
                {decksWithResults > 0
                  ? `${decksWithResults} of your deck${decksWithResults === 1 ? ' has' : 's have'} results in Pairings.`
                  : 'No results from Pairings yet. Finish steps 2 and 3 and they appear here.'}
              </div>
              <div className="wishlist-actions">
                <button className="btn" onClick={disconnectPairings}>
                  Disconnect
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
