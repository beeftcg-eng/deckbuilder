/**
 * The last few errors the page ran into, so a bug report (BugReportModal.tsx) can say what went wrong
 * without anyone having to open developer tools. Kept in memory only, for this session.
 */
const MAX = 12
const recent: string[] = []

function remember(text: string) {
  const line = `${new Date().toISOString().slice(11, 19)} ${text}`.slice(0, 600)
  if (recent[recent.length - 1] === line) return
  recent.push(line)
  if (recent.length > MAX) recent.shift()
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n${value.stack.split('\n').slice(1, 4).join('\n')}` : ''}`
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function installErrorLog(): void {
  window.addEventListener('error', (e) => remember(describe(e.error ?? e.message)))
  window.addEventListener('unhandledrejection', (e) => remember(`(promise) ${describe(e.reason)}`))
  // The app reports most of its own failures with console.error (a failed save, a sync error).
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    remember(args.map(describe).join(' '))
    original(...args)
  }
}

export function recentErrors(): string[] {
  return [...recent]
}
