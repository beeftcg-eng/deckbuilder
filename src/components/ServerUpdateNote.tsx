import { useEffect, useState } from 'react'
import { missingUpdates, serverVersion } from '../shared/serverVersion'
import { t } from '../shared/i18n'

/**
 * "The server needs an update": shown where a feature depends on one of the Pawmodoro project's
 * Brewhouse updates (shared/serverVersion.ts) that hasn't been run, naming the files to run. Nothing
 * when the server is up to date, or can't be asked.
 */
export function ServerUpdateNote({ version }: { version: number }) {
  const [current, setCurrent] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    void serverVersion().then((v) => alive && setCurrent(v))
    return () => {
      alive = false
    }
  }, [])
  const missing = missingUpdates(current, version)
  if (!missing.length) return null
  return (
    <div className="sync-error server-update-note" role="status">
      <p>{t.serverUpdate.intro}</p>
      <ul>
        {missing.map((u) => (
          <li key={u.file}>
            <code>scripts/{u.file}</code> — {u.for}
          </li>
        ))}
      </ul>
      {current === 0 && <p className="text-dim">{t.serverUpdate.skipDone}</p>}
    </div>
  )
}
