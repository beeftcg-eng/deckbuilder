import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ownedIndexOf, useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { defaultPaper, pageLayout, proxyCopies, type Paper } from '../shared/proxies'
import { renderProxyPdf } from '../lib/proxyPdf'
import type { Card, Deck } from '../shared/types'
import { t, zoneLabel } from '../shared/i18n'
import { Rich } from './Rich'

/** Saves a deck's cards as a printable PDF of real-size proxies (shared/proxies.ts, lib/proxyPdf.ts). */
export function ProxyPrintModal({ deck, cardsById, onClose }: { deck: Deck; cardsById: Map<string, Card>; onClose: () => void }) {
  const adapter = getAdapter(deck.gameId)
  const collection = useAppStore((s) => s.collection)
  const catalogs = useAppStore((s) => s.catalogs)
  const zones = useMemo(() => rulesForFormat(adapter, deck.formatId).zones.filter((z) => (deck.zones[z.id] ?? []).length > 0), [adapter, deck])

  const [paper, setPaper] = useState<Paper>(() => defaultPaper(navigator.language))
  const [zoneIds, setZoneIds] = useState<Set<string>>(() => new Set(zones.map((z) => z.id)))
  const [missingOnly, setMissingOnly] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const owned = useMemo(() => (missingOnly ? ownedIndexOf(collection, catalogs) : undefined), [missingOnly, collection, catalogs])
  const copies = useMemo(() => proxyCopies(deck, cardsById, { zoneIds, owned, zoneOrder: zones.map((z) => z.id) }), [deck, cardsById, zoneIds, owned, zones])
  const total = copies.reduce((sum, c) => sum + c.copies, 0)
  const perPage = pageLayout(paper, deck.gameId).slots.length
  const pages = Math.ceil(total / perPage)

  function toggleZone(id: string) {
    setZoneIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleMake() {
    setMessage(null)
    setProgress({ done: 0, total: copies.length })
    try {
      const pdf = await renderProxyPdf(copies, deck.gameId, paper, (done, of) => setProgress({ done, total: of }))
      const saved = await window.api.exportSavePdf(pdf.bytes, t.proxies.fileName(deck.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'deck'))
      const parts = saved ? [t.proxies.saved(pdf.pages)] : []
      if (pdf.missingImages > 0) parts.push(t.proxies.missingImages(pdf.missingImages))
      setMessage(parts.length ? { text: parts.join(' ') } : null)
    } catch (err) {
      setMessage({ text: t.proxies.failed(err instanceof Error ? err.message : String(err)), error: true })
    } finally {
      setProgress(null)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal proxy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.proxies.title(deck.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <div className="text-dim">
          <Rich text={t.proxies.intro} />
        </div>

        <label className="proxy-option">
          <span>{t.proxies.paper}</span>
          <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
            <option value="letter">{t.proxies.letter}</option>
            <option value="a4">{t.proxies.a4}</option>
          </select>
        </label>

        {zones.length > 1 && (
          <div className="proxy-option">
            <span>{t.proxies.zones}</span>
            <div className="proxy-zones">
              {zones.map((z) => (
                <label key={z.id}>
                  <input type="checkbox" checked={zoneIds.has(z.id)} onChange={() => toggleZone(z.id)} /> {zoneLabel(z.label)}
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="proxy-option">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} /> {t.proxies.missingOnly}
        </label>

        <div className="import-summary">{total > 0 ? t.proxies.summary(total, pages) : t.proxies.nothing}</div>

        <div className="import-fields">
          <button className="btn btn-primary" disabled={total === 0 || progress !== null} onClick={handleMake}>
            {progress ? t.proxies.making(progress.done, progress.total) : t.proxies.make}
          </button>
        </div>
        {message && <div className={message.error ? 'sync-error' : 'text-dim'}>{message.text}</div>}
        <div className="text-dim proxy-note">{t.proxies.note}</div>
      </div>
    </div>,
    document.body,
  )
}
