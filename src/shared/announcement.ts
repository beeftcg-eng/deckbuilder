/**
 * A message to everyone who uses the app, shown once the next time each app opens. It's a file next
 * to the phone app (public/announcement.json, published by deploy-pwa.yml), so sending one is: edit
 * that file, give it a new `id`, push. The desktop app reads the same URL. No accounts and no
 * Supabase involved, so it reaches people who never signed in too.
 *
 * {
 *   "id": "2026-10-supabase",          // new id = shown again to everyone; same id = never twice
 *   "title": "Heads up",               // optional
 *   "message": "Text.\nNew lines work.",
 *   "link": "https://...",             // optional, shown as a button
 *   "linkLabel": "Donate",             // optional, that button's text (else "More info")
 *   "until": "2026-11-01"              // optional, not shown from this date on (so new installs months later skip it)
 * }
 * An empty `message` sends nothing.
 */
export const ANNOUNCEMENT_URL = 'https://beeftcg-eng.github.io/deckbuilder/announcement.json'

export interface Announcement {
  id: string
  title: string | null
  message: string
  link: string | null
  linkLabel: string | null
}

/** The file's contents as an Announcement to show, or null when there's nothing (valid) to show today. */
export function normalizeAnnouncement(raw: unknown, now = new Date()): Announcement | null {
  if (raw == null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id.trim()) return null
  if (typeof r.message !== 'string' || !r.message.trim()) return null
  if (typeof r.until === 'string') {
    const until = new Date(r.until)
    if (!Number.isNaN(until.getTime()) && now >= until) return null
  }
  const link = typeof r.link === 'string' && /^https:\/\//.test(r.link) ? r.link : null
  return {
    id: r.id.trim(),
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 120) : null,
    message: r.message.trim().slice(0, 2000),
    link,
    linkLabel: link && typeof r.linkLabel === 'string' && r.linkLabel.trim() ? r.linkLabel.trim().slice(0, 40) : null,
  }
}

/** Never throws: offline or no file just means no announcement. */
export async function loadAnnouncement(): Promise<Announcement | null> {
  try {
    const res = await fetch(ANNOUNCEMENT_URL, { cache: 'no-store' })
    return res.ok ? normalizeAnnouncement(await res.json()) : null
  } catch {
    return null
  }
}
