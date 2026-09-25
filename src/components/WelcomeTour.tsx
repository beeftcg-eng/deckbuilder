import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { LANGUAGES, t, type Language } from '../shared/i18n'
import { Rich } from './Rich'

/** Each step points at the elements marked data-tour="<target>" (several are outlined as one); none = centred. */
interface Step {
  target?: string
  title: string
  body: string
}

function steps(): Step[] {
  const s = t.tour
  return [
    { title: s.welcomeTitle, body: s.welcomeBody },
    { target: 'games', title: s.gamesTitle, body: s.gamesBody },
    { target: 'sync', title: s.syncTitle, body: s.syncBody },
    { target: 'decks', title: s.decksTitle, body: s.decksBody },
    { target: 'browser', title: s.browserTitle, body: s.browserBody },
    { target: 'nav', title: s.navTitle, body: s.navBody },
    { target: 'account', title: s.accountTitle, body: s.accountBody },
    { target: 'pairings', title: s.pairingsTitle, body: s.pairingsBody },
    { target: 'settings', title: s.settingsTitle, body: s.settingsBody },
    { target: 'replay', title: s.doneTitle, body: s.doneBody },
  ]
}

const CARD_WIDTH = 340
const GAP = 14
const MARGIN = 12

/** The box around every visible element of a target, or null when none is on screen (e.g. the phone's closed menu). */
function targetRect(target: string | undefined): DOMRect | null {
  if (!target) return null
  const rects = [...document.querySelectorAll(`[data-tour="${target}"]`)]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight)
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((r) => r.left))
  const top = Math.min(...rects.map((r) => r.top))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

/** Beside the target if there's room (right, then left), else below or above it, kept on screen. */
function cardPosition(rect: DOMRect | null, cardHeight: number): CSSProperties {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(CARD_WIDTH, vw - MARGIN * 2)
  if (!rect) return { width, left: (vw - width) / 2, top: Math.max(MARGIN, (vh - cardHeight) / 2) }
  const clampTop = (top: number) => Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - cardHeight - MARGIN))
  const clampLeft = (left: number) => Math.min(Math.max(MARGIN, left), vw - width - MARGIN)
  if (rect.right + GAP + width + MARGIN <= vw) return { width, left: rect.right + GAP, top: clampTop(rect.top) }
  if (rect.left - GAP - width >= MARGIN) return { width, left: rect.left - GAP - width, top: clampTop(rect.top) }
  if (rect.bottom + GAP + cardHeight + MARGIN <= vh) return { width, left: clampLeft(rect.left), top: rect.bottom + GAP }
  if (rect.top - GAP - cardHeight >= MARGIN) return { width, left: clampLeft(rect.left), top: rect.top - GAP - cardHeight }
  return { width, left: (vw - width) / 2, top: Math.max(MARGIN, vh - cardHeight - MARGIN) }
}

/**
 * A short first-launch walk through the app: a card next to each part of the screen, with that part
 * outlined and the rest dimmed. Skip or finish, and it only comes back from the sidebar's "Welcome tour".
 */
export function WelcomeTour() {
  const setShowTour = useAppStore((s) => s.setShowTour)
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [cardHeight, setCardHeight] = useState(220)
  const cardRef = useRef<HTMLDivElement>(null)

  const list = steps()
  const step = list[index]
  const last = index === list.length - 1
  const close = useCallback(() => setShowTour(false), [setShowTour])

  // Follow the target as the window resizes or the sidebar scrolls.
  useLayoutEffect(() => {
    const target = step.target
    const el = target ? document.querySelector(`[data-tour="${target}"]`) : null
    el?.scrollIntoView({ block: 'nearest' })
    const update = () => setRect(targetRect(target))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [step.target])

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight)
  }, [index, rect, language])

  useEffect(() => {
    cardRef.current?.focus()
  }, [index])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight' && !last) setIndex((i) => i + 1)
      else if (e.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [close, last, index])

  const pad = 6
  return createPortal(
    <div className="tour-layer">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={cardRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        style={cardPosition(rect, cardHeight)}
      >
        <div className="tour-step text-dim">{t.tour.stepOf(index + 1, list.length)}</div>
        <h2 id="tour-title">{step.title}</h2>
        <p id="tour-body">
          <Rich text={step.body} />
        </p>
        {index === 0 && (
          <label className="theme-row tour-language">
            <span className="text-dim">{t.sidebar.language}</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="tour-actions">
          {!last && (
            <button className="link-btn" onClick={close}>
              {t.tour.skip}
            </button>
          )}
          <span className="tour-spacer" />
          {index > 0 && (
            <button className="btn" onClick={() => setIndex(index - 1)}>
              {t.tour.back}
            </button>
          )}
          <button className="btn btn-primary" onClick={last ? close : () => setIndex(index + 1)}>
            {index === 0 ? t.tour.start : last ? t.tour.finish : t.tour.next}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
