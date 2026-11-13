import { Modal } from './Modal'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { t } from '../shared/i18n'
import type { BanListUpdate } from '../shared/banLists'

function Update({ update }: { update: BanListUpdate }) {
  const status = (s: string) => t.banLists.status(update.gameId, s)
  return (
    <section className="banlist-update">
      <h3>{t.banLists.heading(getAdapter(update.gameId).shortName, update.formatLabel)}</h3>
      {update.changes.length > 0 && (
        <ul className="banlist-changes">
          {update.changes.map((c) => (
            <li key={c.key} className={`banlist-to-${c.to}`}>
              {t.banLists.change(c.name, status(c.from), status(c.to))}
            </li>
          ))}
        </ul>
      )}
      {(
        [
          [t.banLists.pairsAdded, update.pairsAdded.map(([a, b]) => `${a} + ${b}`)],
          [t.banLists.pairsRemoved, update.pairsRemoved.map(([a, b]) => `${a} + ${b}`)],
          [t.banLists.setsOut, update.setsRotatedOut],
          [t.banLists.setsBack, update.setsBack],
        ] as const
      ).map(([label, items]) =>
        items.length ? (
          <p key={label}>
            {label} {items.join(', ')}
          </p>
        ) : null,
      )}
      {update.decks.length > 0 ? (
        <p className="banlist-decks">
          <strong>{t.banLists.decks(update.decks.length)}</strong> {update.decks.join(', ')}
        </p>
      ) : (
        <p className="text-dim">{t.banLists.noDecks}</p>
      )}
    </section>
  )
}

/** Ban lists that changed since the last launch (banListCheck.ts), shown once. */
export function BanListUpdateModal() {
  const updates = useAppStore((s) => s.banListUpdates)
  const dismiss = useAppStore((s) => s.dismissBanListUpdates)
  const blocked = useAppStore((s) => s.showTour || !!s.announcement)
  if (!updates.length || blocked) return null
  return (
    <Modal label={t.banLists.title} className="announcement-modal banlist-update-modal" onClose={dismiss}>
      <div className="modal-header">
        <span>{t.banLists.title}</span>
      </div>
      <div className="banlist-update-body">
        {updates.map((u) => (
          <Update key={`${u.gameId}:${u.formatId}`} update={u} />
        ))}
      </div>
      <div className="announcement-actions">
        <button className="btn btn-primary" onClick={dismiss}>
          {t.banLists.ok}
        </button>
      </div>
    </Modal>
  )
}
