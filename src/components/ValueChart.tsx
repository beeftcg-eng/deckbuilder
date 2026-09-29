import { useState } from 'react'
import { formatMoney } from '../shared/currency'
import { localDay, valueChange, type ValuePoint } from '../shared/valueHistory'
import { getLanguage, t } from '../shared/i18n'

const RANGES = [30, 90, 365, 0] as const
const W = 300
const H = 64

function shortDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(getLanguage(), {
    month: 'short',
    day: 'numeric',
  })
}

/** The collection's value over time (valueHistory.ts): a small line graph and how much it moved. */
export function ValueChart({ points }: { points: ValuePoint[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(30)
  if (points.length === 0) return null
  if (points.length < 2) return <div className="text-dim value-chart-note">{t.valueHistory.firstDay}</div>

  const today = localDay()
  const change = valueChange(points, range || 100_000, today)
  const from = change?.from.d ?? points[0].d
  const shown = points.filter((p) => p.d >= from)
  const values = shown.map((p) => p.v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const first = new Date(`${shown[0].d}T12:00:00`).getTime()
  const last = new Date(`${shown[shown.length - 1].d}T12:00:00`).getTime()
  const x = (d: string) => (last === first ? W : ((new Date(`${d}T12:00:00`).getTime() - first) / (last - first)) * W)
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8)
  const line = shown.map((p) => `${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const area = `0,${H} ${line} ${W},${H}`

  const up = (change?.diff ?? 0) >= 0
  const diffText = change ? `${up ? '▲' : '▼'} ${formatMoney(Math.abs(change.diff))}` : ''
  const percentText = change?.percent != null ? `${up ? '+' : '−'}${Math.abs(change.percent).toFixed(1)}%` : ''

  return (
    <div className="value-chart">
      <div className="value-chart-head">
        <span className="value-chart-title">{t.valueHistory.title}</span>
        {change && (
          <span className={`value-chart-change ${up ? 'up' : 'down'}`}>
            {t.valueHistory.change(diffText, percentText)} <span className="text-dim">{t.valueHistory.since(shortDate(change.from.d))}</span>
          </span>
        )}
        <span className="value-chart-ranges" role="group">
          {RANGES.map((r) => (
            <button key={r} className={`btn value-chart-range ${range === r ? 'btn-primary' : ''}`} aria-pressed={range === r} onClick={() => setRange(r)}>
              {r ? t.valueHistory.days(r) : t.valueHistory.all}
            </button>
          ))}
        </span>
      </div>
      <svg
        className={`value-chart-svg ${up ? 'up' : 'down'}`}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t.valueHistory.title}
      >
        <polygon className="value-chart-area" points={area} />
        <polyline className="value-chart-line" points={line} vectorEffect="non-scaling-stroke" />
        {shown.map((p) => (
          <rect key={p.d} x={x(p.d) - W / shown.length / 2} y={0} width={Math.max(2, W / shown.length)} height={H} fill="transparent">
            <title>{t.valueHistory.graphTitle(shortDate(p.d), formatMoney(p.v))}</title>
          </rect>
        ))}
      </svg>
    </div>
  )
}
