import { app, BrowserWindow, ipcMain } from 'electron'
// electron-updater is CommonJS; the default import is the portable way to reach its exports from this ES module.
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '../../src/shared/updateStatus'
import { shortUpdateError } from '../../src/shared/updateStatus'

const { autoUpdater } = electronUpdater

const FIRST_CHECK_DELAY_MS = 5_000
const RECHECK_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * Self-update is only for an installed copy: not `npm run dev`, not a Linux build that isn't an
 * AppImage (electron-updater can only replace an AppImage there), and not when switched off.
 */
function disabledReason(): string | null {
  if (process.env.DECKBUILDER_DISABLE_UPDATES) return 'Updates are switched off.'
  if (!app.isPackaged) return 'Updates only work in the installed app.'
  if (process.platform === 'linux' && !process.env.APPIMAGE) return 'Updates need the AppImage build.'
  return null
}

const version = app.getVersion()
const reason = disabledReason()
let status: UpdateStatus = reason ? { state: 'disabled', version, reason } : { state: 'idle', version }

function setStatus(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('updater:status', status)
}

let configured = false
function configure(): void {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = true // fetch in the background as soon as one is found…
  autoUpdater.autoInstallOnAppQuit = true // …and install it when the app is closed, even if the banner is ignored
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking', version }))
  autoUpdater.on('update-available', (info) => setStatus({ state: 'downloading', version, newVersion: info.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => setStatus({ state: 'uptodate', version }))
  autoUpdater.on('download-progress', (p) => {
    if (status.state === 'downloading') setStatus({ ...status, percent: p.percent })
  })
  autoUpdater.on('update-downloaded', (info) => setStatus({ state: 'ready', version, newVersion: info.version }))
  autoUpdater.on('error', (err) => setStatus({ state: 'error', version, message: shortUpdateError(err) }))
}

function checkNow(): void {
  if (status.state === 'disabled' || status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return
  configure()
  autoUpdater.checkForUpdates().catch((err) => setStatus({ state: 'error', version, message: shortUpdateError(err) }))
}

export function registerUpdaterIpc(): void {
  ipcMain.handle('updater:status', (): UpdateStatus => status)
  ipcMain.handle('updater:check', (): void => checkNow())
  ipcMain.handle('updater:install', (): void => {
    if (status.state === 'ready') autoUpdater.quitAndInstall(false, true) // close, install, and reopen the new version
  })
}

/** Checks shortly after launch, then every few hours for as long as the app stays open. */
export function startUpdateChecks(): void {
  if (status.state === 'disabled') return
  setTimeout(checkNow, FIRST_CHECK_DELAY_MS)
  setInterval(checkNow, RECHECK_EVERY_MS).unref()
}
