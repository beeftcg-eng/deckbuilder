import { useState } from 'react'
import { useAppStore } from '../state/useAppStore'

/** Shown once a new version has finished downloading: restart to use it now, or carry on (it installs when you close the app). */
export function UpdateBanner() {
  const status = useAppStore((s) => s.updateStatus)
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)

  if (status?.state !== 'ready' || dismissedFor === status.newVersion) return null
  return (
    <div className="update-banner" role="status">
      <span>
        <b>Deckbuilder {status.newVersion}</b> is ready to install.
      </span>
      <button className="btn btn-primary" onClick={() => window.api.updater.install()}>
        Restart &amp; update
      </button>
      <button className="btn" onClick={() => setDismissedFor(status.newVersion)} title="It will install the next time you close Deckbuilder">
        Later
      </button>
    </div>
  )
}
