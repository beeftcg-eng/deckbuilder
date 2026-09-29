import { createPortal } from 'react-dom'
import { t } from '../shared/i18n'

/** The desktop keyboard shortcuts (App.tsx), opened with ? or from the sidebar. */
export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['/', t.shortcuts.search],
    ['+', t.shortcuts.add],
    ['−', t.shortcuts.remove],
    ['Ctrl+Z', t.shortcuts.undo],
    ['Esc', t.shortcuts.close],
    ['?', t.shortcuts.help],
  ]
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.shortcuts.title}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <table className="shortcuts-table">
          <tbody>
            {rows.map(([key, what]) => (
              <tr key={key}>
                <td>
                  <kbd>{key}</kbd>
                </td>
                <td>{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  )
}
