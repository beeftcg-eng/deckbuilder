import { useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { displayCurrency, displayRate, formatMoney } from '../shared/currency'
import { targetToUsd } from '../shared/priceAlerts'
import { askToNotify } from '../lib/notify'
import { t } from '../shared/i18n'

/** The 🔔 on a wishlist row: shows the card's price alert, or none; clicking it opens the editor. */
export function PriceAlertButton({ cardId, onClick }: { cardId: string; onClick: () => void }) {
  const alert = useAppStore((s) => s.settings.priceAlerts?.[cardId])
  if (!alert) {
    return (
      <button className="btn price-alert-btn" title={t.priceAlerts.buttonTitle} onClick={onClick}>
        🔔
      </button>
    )
  }
  const price = formatMoney(alert.target)
  return (
    <button className={`btn price-alert-btn set ${alert.hit ? 'hit' : ''}`} title={t.priceAlerts.targetTitle(price)} onClick={onClick}>
      {alert.hit ? t.priceAlerts.hit : `🔔 ${t.priceAlerts.target(price)}`}
    </button>
  )
}

/** Sets, changes or removes a wishlisted card's price alert, typed in the currency prices are shown in. */
export function PriceAlertEditor({ cardId, onDone }: { cardId: string; onDone: () => void }) {
  const alert = useAppStore((s) => s.settings.priceAlerts?.[cardId])
  const setPriceAlert = useAppStore((s) => s.setPriceAlert)
  const rate = displayRate()
  const whole = displayCurrency() === 'JPY'
  const [text, setText] = useState(() => (alert ? (alert.target * rate).toFixed(whole ? 0 : 2) : ''))
  const [invalid, setInvalid] = useState(false)

  function save(e: React.FormEvent) {
    e.preventDefault()
    const usd = targetToUsd(text, rate)
    if (usd == null) {
      setInvalid(true)
      return
    }
    askToNotify()
    setPriceAlert(cardId, usd)
    onDone()
  }

  return (
    <form className="price-alert-editor" onSubmit={save}>
      <label>
        <span className="text-dim">{t.priceAlerts.label(displayCurrency())}</span>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setInvalid(false)
          }}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
        />
      </label>
      <button type="submit" className="btn btn-primary">
        {t.priceAlerts.set}
      </button>
      {alert && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPriceAlert(cardId, null)
            onDone()
          }}
        >
          {t.priceAlerts.remove}
        </button>
      )}
      <button type="button" className="btn" onClick={onDone}>
        {t.common.cancel}
      </button>
      <div className={invalid ? 'sync-error' : 'text-dim price-alert-help'}>{invalid ? t.priceAlerts.invalid : t.priceAlerts.howItWorks}</div>
    </form>
  )
}
