import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { PAIRINGS_APP_URL } from '../shared/pairingsRecord'

interface Props {
  onClose: () => void
}

/** Log in to Pairings (the tournament tracker) so deck views can show each deck's results. Read-only;
 * a different account from Pawmodoro's, so it has its own form rather than sharing that one. */
export function PairingsAccountModal({ onClose }: Props) {
  const pairingsConfig = useAppStore((s) => s.pairingsConfig)
  const connectPairings = useAppStore((s) => s.connectPairings)
  const disconnectPairings = useAppStore((s) => s.disconnectPairings)

  const [email, setEmail] = useState(pairingsConfig.email)
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

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
          <span>Pairings account</span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="pawmodoro-box">
          {pairingsConfig.connected ? (
            <>
              <div className="text-dim">Connected as {pairingsConfig.email}</div>
              <div className="text-dim">
                Each deck shows the results you logged with it in Pairings. In Pairings, open Decks and use Import from Brewhouse to link a deck.
              </div>
              <div className="wishlist-actions">
                <button className="btn" onClick={disconnectPairings}>
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-dim">
                Log in with your Pairings email and password to see each deck's tournament record here. This only reads your results; it never changes
                anything in Pairings. It's a separate account from your Pawmodoro login.
              </div>
              <form
                className="pawmodoro-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleConnect()
                }}
              >
                <input placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="submit" className="btn btn-primary" disabled={connecting || !email.trim() || !password}>
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>
              </form>
              <div className="text-dim">
                No Pairings account?{' '}
                <a
                  href={PAIRINGS_APP_URL}
                  onClick={(e) => {
                    e.preventDefault()
                    void window.api.system.openExternal(PAIRINGS_APP_URL)
                  }}
                >
                  Create one in Pairings
                </a>
                .
              </div>
              {connectError && <div className="sync-error">Couldn't connect: {connectError}</div>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
