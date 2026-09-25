import { useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { t } from '../shared/i18n'
import { Rich } from './Rich'

/** Shown once a new version has finished downloading: restart to use it now, or carry on (it installs when you close the app). */
export function UpdateBanner() {
  const status = useAppStore((s) => s.updateStatus)
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)

  if (status?.state !== 'ready' || dismissedFor === status.newVersion) return null
  return (
    <div className="update-banner" role="status">
      <span>
        <Rich text={t.updates.readyBanner(status.newVersion)} />
      </span>
      <button className="btn btn-primary" onClick={() => window.api.updater.install()}>
        {t.updates.restart}
      </button>
      <button className="btn" onClick={() => setDismissedFor(status.newVersion)} title={t.updates.laterTitle}>
        {t.updates.later}
      </button>
    </div>
  )
}
