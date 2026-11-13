import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { pendingUsage } from '../shared/usage'
import { t } from '../shared/i18n'

/**
 * "Share anonymous usage counts" (shared/usage.ts), off until ticked, and "What's sent?": exactly what
 * this device has counted and not yet sent.
 */
export function UsageToggle() {
  const on = useAppStore((s) => s.settings.usageStats === true)
  const setUsageStats = useAppStore((s) => s.setUsageStats)
  const [showing, setShowing] = useState(false)
  return (
    <div className="usage-toggle">
      <label title={t.usage.title}>
        <input type="checkbox" checked={on} onChange={(e) => setUsageStats(e.target.checked)} />
        {t.usage.label}
      </label>
      <button className="link-btn" onClick={() => setShowing(true)}>
        {t.usage.whatsSent}
      </button>
      {showing && <UsageDetails on={on} onClose={() => setShowing(false)} />}
    </div>
  )
}

function UsageDetails({ on, onClose }: { on: boolean; onClose: () => void }) {
  const days = Object.entries(pendingUsage()).sort(([a], [b]) => b.localeCompare(a))
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal usage-modal" role="dialog" aria-modal="true" aria-label={t.usage.detailsTitle} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.usage.detailsTitle}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <p>{t.usage.explain}</p>
        {!on ? (
          <p className="text-dim">{t.usage.off}</p>
        ) : days.length === 0 ? (
          <p className="text-dim">{t.usage.nothingYet}</p>
        ) : (
          days.map(([day, counts]) => (
            <section key={day}>
              <h3 className="usage-day">{day}</h3>
              <ul className="usage-counts">
                {Object.entries(counts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([feature, n]) => (
                    <li key={feature}>
                      <code>{feature}</code> × {n}
                    </li>
                  ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>,
    document.body,
  )
}
