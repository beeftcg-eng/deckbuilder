import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore, useCardsById } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { detectFormatFromHeadings, parseDecklistText } from '../shared/importDeck'
import { isCardLegalInFormat } from '../shared/legality'
import type { PrintingPrefs } from '../shared/printings'
import type { GameId } from '../shared/types'
import { t } from '../shared/i18n'
import { formatLabel } from '../shared/formatText'
import { parseShareToken } from '../shared/deckShare'
import { applySiteExtras, deckFromSite, deckUrlTarget, type DeckFromSite } from '../shared/deckUrl'
import { Rich } from './Rich'

const MAX_UNMATCHED_SHOWN = 8

export function ImportDeckModal({ gameId, onClose }: { gameId: GameId; onClose: () => void }) {
  const adapter = getAdapter(gameId)
  const cardsById = useCardsById(gameId)
  const formats = useAppStore((s) => s.formats[gameId]) ?? adapter.defaultFormats
  const importDeck = useAppStore((s) => s.importDeck)
  const collection = useAppStore((s) => s.collection)

  const [text, setText] = useState('')
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [formatDraft, setFormatDraft] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A deck read from a link (Archidekt, Limitless): its exact printings and tags, applied on import.
  const [fromSite, setFromSite] = useState<DeckFromSite | null>(null)
  const [fetching, setFetching] = useState(false)

  const defaultFormatId = formats[0]?.id ?? ''
  // When a list gives only a card's name, use the printing you own, then one that's legal in the chosen format,
  // then a regular one over alternate art / a promo (see shared/printings.ts).
  const prefsFor = (id: string): PrintingPrefs => {
    const format = formats.find((f) => f.id === id)
    return { owned: (card) => collection[card.id] ?? 0, legal: format ? (card) => isCardLegalInFormat(card, format).legal : undefined }
  }
  // A game's deck shape can depend on its format, so the text is parsed for the format that ends up chosen:
  // once with the default (which is where this app's own export header names its format), then again if that differs.
  const firstPass = useMemo(() => parseDecklistText(text, adapter, cardsById, defaultFormatId, prefsFor(defaultFormatId)), [text, adapter, cardsById, defaultFormatId, collection, formats]) // eslint-disable-line react-hooks/exhaustive-deps
  const detectedFormat = formats.find((f) => f.label === firstPass.formatLabel)
  const hintedFormatId = useMemo(() => detectFormatFromHeadings(text, adapter), [text, adapter])
  const formatId = formatDraft ?? detectedFormat?.id ?? hintedFormatId ?? defaultFormatId
  const parsed = useMemo(
    () => (formatId === defaultFormatId ? firstPass : parseDecklistText(text, adapter, cardsById, formatId, prefsFor(formatId))),
    [formatId, defaultFormatId, firstPass, text, adapter, cardsById, collection, formats], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const catalogReady = cardsById.size > 0

  const name = nameDraft ?? parsed.name ?? t.importDeck.defaultName
  // A pasted Brewhouse share link opens that deck (from any game) instead of being parsed as a list.
  const shareToken = parseShareToken(text)

  // A pasted link to a deck site (deckUrl.ts) is fetched instead of parsed.
  const siteTarget = shareToken ? null : deckUrlTarget(text)

  async function fetchFromSite() {
    if (!siteTarget) return
    setFetching(true)
    setError(null)
    try {
      const site = deckFromSite(siteTarget.site, await window.api.fetchDeckPage(text.trim()))
      if (!site.text.trim()) throw new Error(t.importDeck.linkEmpty)
      setFromSite(site)
      setText(site.text)
      if (site.name && nameDraft == null) setNameDraft(site.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setFetching(false)
    }
  }

  function openShareLink() {
    if (!shareToken) return
    void useAppStore.getState().openSharedLink(shareToken)
    onClose()
  }

  async function handleImport() {
    setImporting(true)
    setError(null)
    try {
      const { parsed: exact, tags } = fromSite ? applySiteExtras(parsed, fromSite, cardsById) : { parsed, tags: {} }
      await importDeck(gameId, exact, name.trim() || t.importDeck.defaultName, formatId, tags)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setImporting(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.importDeck.title(adapter.shortName)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>

        {!catalogReady ? (
          <div className="text-dim">{t.importDeck.noData(adapter.shortName)}</div>
        ) : (
          <>
            <textarea
              className="export-textarea"
              autoFocus
              placeholder={`${t.importDeck.placeholder}\n${t.share.importHint}\n${t.importDeck.linkHint}`}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setFromSite(null)
              }}
            />

            {siteTarget ? (
              <div className="import-summary">
                {siteTarget.gameId === gameId ? (
                  <button className="btn btn-primary" disabled={fetching} onClick={() => void fetchFromSite()}>
                    {fetching ? t.importDeck.fetching : t.importDeck.fetchLink}
                  </button>
                ) : (
                  <span className="sync-error">{t.importDeck.linkOtherGame(getAdapter(siteTarget.gameId).shortName)}</span>
                )}
              </div>
            ) : shareToken ? (
              <div className="import-summary">
                <button className="btn btn-primary" onClick={openShareLink}>
                  {t.share.openLink}
                </button>
              </div>
            ) : text.trim() && (
              <div className="import-summary">
                <div>
                  <Rich text={t.importDeck.recognised(parsed.matchedCopies)} />
                  {parsed.unmatched.length > 0 && <span className="sync-error">{t.importDeck.unmatched(parsed.unmatched.length)}</span>}
                </div>
                {parsed.unmatched.length > 0 && (
                  <ul className="import-unmatched">
                    {parsed.unmatched.slice(0, MAX_UNMATCHED_SHOWN).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                    {parsed.unmatched.length > MAX_UNMATCHED_SHOWN && <li>{t.importDeck.andMore(parsed.unmatched.length - MAX_UNMATCHED_SHOWN)}</li>}
                  </ul>
                )}
              </div>
            )}

            <div className="import-fields">
              <input value={name} onChange={(e) => setNameDraft(e.target.value)} placeholder={t.importDeck.deckName} />
              <select value={formatId} onChange={(e) => setFormatDraft(e.target.value)}>
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {formatLabel(gameId, f)}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" disabled={parsed.matchedCopies === 0 || importing} onClick={handleImport}>
                {importing ? t.importDeck.importing : t.importDeck.import}
              </button>
            </div>
            {error && <div className="sync-error">{t.importDeck.failed(error)}</div>}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
