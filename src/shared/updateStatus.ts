/** Where the app's self-update stands. Sent from the main process (electron/ipc/updater.ts) to the window. */
export type UpdateStatus =
  | { state: 'disabled'; version: string; reason: string }
  | { state: 'idle'; version: string }
  | { state: 'checking'; version: string }
  | { state: 'uptodate'; version: string }
  | { state: 'downloading'; version: string; newVersion: string; percent: number }
  | { state: 'ready'; version: string; newVersion: string }
  | { state: 'error'; version: string; message: string }

/** The line shown under the sidebar's version number. */
export function describeUpdate(status: UpdateStatus): string {
  switch (status.state) {
    case 'disabled':
      return status.reason
    case 'idle':
      return ''
    case 'checking':
      return 'Checking for updates…'
    case 'uptodate':
      return 'You have the latest version.'
    case 'downloading':
      return `Downloading ${status.newVersion}… ${Math.round(status.percent)}%`
    case 'ready':
      return `${status.newVersion} is ready to install.`
    case 'error':
      return `Couldn't check for updates: ${status.message}`
  }
}

/** Whether a manual "Check for updates" click would do anything right now. */
export function canCheckForUpdates(status: UpdateStatus): boolean {
  return status.state === 'idle' || status.state === 'uptodate' || status.state === 'error'
}

/** A short, single-line reason from an updater error (they can be long stack-like blocks). */
export function shortUpdateError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const first = message.split('\n').find((line) => line.trim() !== '') ?? 'unknown error'
  return first.length > 140 ? `${first.slice(0, 137)}…` : first
}
