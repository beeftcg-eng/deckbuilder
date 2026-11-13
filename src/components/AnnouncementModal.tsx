import { Modal } from './Modal'
import { useAppStore } from '../state/useAppStore'
import { t } from '../shared/i18n'

/** The message in public/announcement.json (shared/announcement.ts), shown once per announcement id. */
export function AnnouncementModal() {
  const announcement = useAppStore((s) => s.announcement)
  const dismiss = useAppStore((s) => s.dismissAnnouncement)
  if (!announcement) return null
  return (
    <Modal label={announcement.title ?? t.announcement.title} className="announcement-modal" onClose={dismiss}>
      <div className="modal-header">
        <span>{announcement.title ?? t.announcement.title}</span>
      </div>
      <p className="announcement-message">{announcement.message}</p>
      <div className="announcement-actions">
        {announcement.link && (
          <a className="btn" href={announcement.link} target="_blank" rel="noreferrer">
            {announcement.linkLabel ?? t.announcement.more}
          </a>
        )}
        <button className="btn btn-primary" onClick={dismiss}>
          {t.announcement.ok}
        </button>
      </div>
    </Modal>
  )
}
