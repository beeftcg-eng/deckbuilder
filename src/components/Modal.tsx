import { useEffect, useRef, type FormEventHandler, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** The dialogs open right now, innermost last: only the top one handles Tab and Esc. */
const open: HTMLElement[] = []

interface Props {
  /** The window's name for screen readers (usually its title). */
  label: string
  /** Classes besides "modal" (sizes and layouts in app.css). */
  className?: string
  /** Classes besides "modal-overlay". */
  overlayClassName?: string
  /** Clicking outside, or Esc. */
  onClose: () => void
  /** A form window (its Enter submits). */
  as?: 'div' | 'form'
  onSubmit?: FormEventHandler<HTMLFormElement>
  children: ReactNode
}

/**
 * Every window in the app: shown over the page in a portal, closed by clicking outside it or Esc,
 * named for screen readers, and keyboard-safe. Opening moves focus into it (its first field or
 * button, or the window itself), Tab and Shift+Tab stay inside it, and closing puts focus back on
 * whatever had it before (usually the button that opened it). A window opened from inside another
 * takes over until it closes.
 */
export function Modal({ label, className, overlayClassName, onClose, as = 'div', onSubmit, children }: Props) {
  const ref = useRef<HTMLElement | null>(null)
  // What had focus before the window, read while rendering: a field inside it with autoFocus takes focus
  // as soon as it's on the page, before any effect could look.
  const previousRef = useRef<HTMLElement | null>(typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previous = previousRef.current
    open.push(dialog)
    // A field the window focuses itself (autoFocus) keeps it; otherwise the first field, else the first button, else the window.
    // On a touch screen a text field would pop the keyboard up over the window, so the window itself takes focus there.
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    if (!dialog.contains(document.activeElement)) {
      const fields = touch ? [] : dialog.querySelectorAll<HTMLElement>('input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea:not([disabled]), select:not([disabled])')
      const target = fields[0] ?? (touch ? dialog : (dialog.querySelector<HTMLElement>(FOCUSABLE) ?? dialog))
      target.focus({ preventScroll: true })
    }

    function onKeyDown(e: KeyboardEvent) {
      if (open[open.length - 1] !== dialog || !dialog) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
      if (!items.length) {
        e.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !dialog.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    // On the document, in the capture phase: Esc closes the top window before App's own Esc handling sees it.
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      open.splice(open.indexOf(dialog), 1)
      // Back to what had focus, if it's still on the page (a deleted deck's button isn't).
      if (previous && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  const props = {
    className: `modal${className ? ` ${className}` : ''}`,
    role: 'dialog',
    'aria-modal': true,
    'aria-label': label,
    tabIndex: -1,
    onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
  } as const
  return createPortal(
    <div className={`modal-overlay${overlayClassName ? ` ${overlayClassName}` : ''}`} onClick={onClose}>
      {as === 'form' ? (
        <form {...props} ref={(el) => void (ref.current = el)} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...props} ref={(el) => void (ref.current = el)}>
          {children}
        </div>
      )}
    </div>,
    document.body,
  )
}
