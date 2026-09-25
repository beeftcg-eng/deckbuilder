import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../shared/pawmodoroDefaults'
import { t } from '../shared/i18n'

interface Props {
  onClose: () => void
}

/** The single login that gates both the Pawmodoro wishlist push (WishlistPanel) and this app's
 * own deck/collection/wishlist sync to the phone PWA (see electron/ipc/deckbuilderSync.ts) - one
 * form, reachable from the sidebar, instead of duplicating it wherever a connected account matters. */
export function PawmodoroAccountModal({ onClose }: Props) {
  const pawmodoroConfig = useAppStore((s) => s.pawmodoroConfig)
  const connectPawmodoro = useAppStore((s) => s.connectPawmodoro)
  const disconnectPawmodoro = useAppStore((s) => s.disconnectPawmodoro)

  const [url, setUrl] = useState(pawmodoroConfig.url)
  const [anonKey, setAnonKey] = useState(pawmodoroConfig.anonKey)
  const [email, setEmail] = useState(pawmodoroConfig.email)
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  // Only show the project fields expanded if this install already points somewhere other than the shared project.
  const customProject = pawmodoroConfig.url !== DEFAULT_PAWMODORO_URL || pawmodoroConfig.anonKey !== DEFAULT_PAWMODORO_ANON_KEY

  // When the saved account changes (connect/disconnect), reset the fields to it - adjusted during
  // render rather than in an effect, which would render once with the stale values first.
  const configKey = `${pawmodoroConfig.url}\n${pawmodoroConfig.anonKey}\n${pawmodoroConfig.email}`
  const [shownConfigKey, setShownConfigKey] = useState(configKey)
  if (shownConfigKey !== configKey) {
    setShownConfigKey(configKey)
    setUrl(pawmodoroConfig.url)
    setAnonKey(pawmodoroConfig.anonKey)
    setEmail(pawmodoroConfig.email)
  }

  async function handleConnect(signUp: boolean) {
    setConnecting(true)
    setConnectError(null)
    try {
      await connectPawmodoro(url.trim(), anonKey.trim(), email.trim(), password, signUp)
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
          <span>{t.pawmodoro.title}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <div className="pawmodoro-box">
          {pawmodoroConfig.connected ? (
            <>
              <div className="text-dim">{t.pawmodoro.connectedAs(pawmodoroConfig.email)}</div>
              <div className="text-dim">{t.pawmodoro.connectedInfo}</div>
              <div className="wishlist-actions">
                <button className="btn" onClick={disconnectPawmodoro}>
                  {t.common.disconnect}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-dim">{t.pawmodoro.intro}</div>
              <div className="pawmodoro-form">
                <input placeholder={t.common.email} value={email} onChange={(e) => setEmail(e.target.value)} />
                <input type="password" placeholder={t.common.password} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button className="btn btn-primary" onClick={() => handleConnect(false)} disabled={connecting || !email.trim() || !password}>
                  {connecting ? t.common.connecting : t.common.connect}
                </button>
                <button className="btn" onClick={() => handleConnect(true)} disabled={connecting || !email.trim() || !password}>
                  {t.pawmodoro.createAccount}
                </button>
              </div>
              <details className="pawmodoro-advanced" open={customProject}>
                <summary>{t.pawmodoro.differentProject}</summary>
                <div className="pawmodoro-form">
                  <input placeholder={t.pawmodoro.projectUrl} value={url} onChange={(e) => setUrl(e.target.value)} />
                  <input placeholder={t.pawmodoro.anonKey} value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
                </div>
              </details>
              {connectError && <div className="sync-error">{t.common.couldntConnect(connectError)}</div>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
