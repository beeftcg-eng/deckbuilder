import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { CONDITIONS, FINISHES, normalizeDetails, type Condition, type CopyDetail, type Finish } from '../shared/copyDetails'
import { formatPrice } from '../shared/collection'
import type { Card } from '../shared/types'
import { t } from '../shared/i18n'

interface Props {
  card: Card
  onClose: () => void
}

/** Which owned copies of a printing are foil, or not Near Mint (shared/copyDetails.ts). The rest are plain Near Mint. */
export function CopyDetailsModal({ card, onClose }: Props) {
  const owned = useAppStore((s) => s.collection[card.id] ?? 0)
  const saved = useAppStore((s) => s.settings.collectionDetails?.[card.id])
  const [rows, setRows] = useState<CopyDetail[]>(() => saved?.map((d) => ({ ...d })) ?? [])

  const listed = rows.reduce((n, r) => n + Math.max(0, Math.floor(r.quantity) || 0), 0)
  const plain = owned - listed
  const tooMany = plain < 0

  function change(index: number, patch: Partial<CopyDetail>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function add() {
    // A foil Near Mint copy is the usual first thing to mark, then foils in other conditions, then played regular copies.
    const used = new Set(rows.map((r) => `${r.finish}|${r.condition}`))
    const order: Finish[] = ['foil', 'normal', 'etched']
    const kind =
      order
        .flatMap((finish) => CONDITIONS.map((condition) => ({ finish, condition })))
        .filter((k) => !(k.finish === 'normal' && k.condition === 'NM'))
        .find((k) => !used.has(`${k.finish}|${k.condition}`)) ?? { finish: 'foil' as const, condition: 'NM' as const }
    setRows((prev) => [...prev, { ...kind, quantity: 1 }])
  }

  function save() {
    useAppStore.getState().setCopyDetails(card.id, normalizeDetails(rows))
    onClose()
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal copy-details-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.copyDetails.title(card.name)}>
        <div className="modal-header">
          <span>{t.copyDetails.title(card.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>
        <p className="text-dim">{t.copyDetails.intro(owned)}</p>
        {card.price != null && (
          <p className="text-dim">{card.foilPrice != null && card.foilPrice > 0 ? t.copyDetails.foilPrice(formatPrice(card.foilPrice)) : t.copyDetails.noFoilPrice}</p>
        )}
        <div className="copy-details-rows">
          {rows.map((row, i) => (
            <div key={i} className="copy-details-row">
              <select value={row.finish} onChange={(e) => change(i, { finish: e.target.value as Finish })}>
                {FINISHES.map((f) => (
                  <option key={f} value={f}>
                    {t.copyDetails.finishes[f]}
                  </option>
                ))}
              </select>
              <select value={row.condition} onChange={(e) => change(i, { condition: e.target.value as Condition })}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {t.copyDetails.conditions[c]}
                  </option>
                ))}
              </select>
              <div className="stepper">
                <button className="btn stepper-btn" onClick={() => change(i, { quantity: Math.max(0, row.quantity - 1) })}>
                  −
                </button>
                <span className="stepper-value">{row.quantity}</span>
                <button className="btn stepper-btn" onClick={() => change(i, { quantity: row.quantity + 1 })}>
                  +
                </button>
              </div>
              <button className="deck-row-delete" title={t.copyDetails.remove} aria-label={t.copyDetails.remove} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <div className="copy-details-row text-dim">{t.copyDetails.plainRow(Math.max(0, plain))}</div>
        </div>
        {tooMany && <div className="sync-error">{t.copyDetails.tooMany(owned)}</div>}
        <div className="copy-details-actions">
          <button className="btn" onClick={add} disabled={plain <= 0}>
            {t.copyDetails.add}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={tooMany}>
            {t.copyDetails.save}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
