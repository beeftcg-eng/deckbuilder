/**
 * "Report a bug": sends what someone wrote, plus (if they leave the box ticked) the app version,
 * device and recent errors, to deckbuilder_report_bug in Pawmodoro's supabase/schema.sql. Works
 * signed in or not, with just the anon key; the reports can only be read from the Supabase dashboard.
 */
export interface BugReport {
  message: string
  contact: string
  /** Technical details, or {} when they chose not to send them. */
  context: Record<string, unknown>
}

export const MAX_MESSAGE = 5000

export async function sendBugReport(url: string, anonKey: string, report: BugReport): Promise<void> {
  const res = await fetch(`${url}/rest/v1/rpc/deckbuilder_report_bug`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ p_message: report.message.slice(0, MAX_MESSAGE), p_contact: report.contact.slice(0, 200), p_context: report.context }),
  })
  if (!res.ok) {
    const raw = await res.text()
    let message = raw
    try {
      message = (JSON.parse(raw) as { message?: string }).message ?? raw
    } catch {
      // not JSON
    }
    throw new Error(res.status === 404 ? 'the server needs updating' : message || String(res.status))
  }
}

/** The report as plain text, for copying when sending fails. */
export function reportAsText(report: BugReport): string {
  const details = Object.keys(report.context).length ? `\n\n${JSON.stringify(report.context, null, 2)}` : ''
  return `${report.message}${report.contact ? `\n\n— ${report.contact}` : ''}${details}`
}
