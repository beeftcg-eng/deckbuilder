import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { registerCardDataIpc } from './ipc/cardData'
import { registerDecksIpc } from './ipc/decks'
import { registerFormatsIpc } from './ipc/formats'
import { registerExportIpc } from './ipc/exportPaste'
import { registerImagesIpc } from './ipc/images'
import { registerImageProtocol, registerImageSchemePrivileges } from './ipc/imageProtocol'
import { ImageFetcher } from './lib/imageCache'
import { userDataDir } from './lib/paths'
import { registerWishlistIpc } from './ipc/wishlist'
import { registerPawmodoroIpc } from './ipc/pawmodoro'
import { registerBackupIpc } from './ipc/backup'
import { registerCollectionIpc } from './ipc/collection'
import { registerSettingsIpc } from './ipc/settings'
import { registerUpdaterIpc, startUpdateChecks } from './ipc/updater'
import { registerPatchNotesIpc } from './ipc/patchNotes'
import { registerDeckbuilderSyncIpc } from './ipc/deckbuilderSync'
import { snapshot } from './lib/backups'
import { withDataLock } from './lib/dataFiles'
import { isWebUrl } from './lib/urls'

const __dirname = dirname(fileURLToPath(import.meta.url))

const APP_ROOT = join(__dirname, '..')
process.env.APP_ROOT = APP_ROOT
const RENDERER_DIST = join(APP_ROOT, 'dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#14151a',
    icon: join(APP_ROOT, 'build/icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // The app is one page: a link in card text must open in the user's browser, never replace the app or open a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win?.webContents.getURL() || (VITE_DEV_SERVER_URL && url.startsWith(VITE_DEV_SERVER_URL))) return // a reload
    event.preventDefault()
    if (isWebUrl(url)) void shell.openExternal(url)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(RENDERER_DIST, 'index.html'))
  }
}

registerCardDataIpc()
registerDecksIpc()
registerFormatsIpc()
registerExportIpc()
registerImageSchemePrivileges()
const imageFetcher = new ImageFetcher({ cacheDir: join(userDataDir(), 'image-cache') })
registerImagesIpc(imageFetcher)
registerWishlistIpc()
registerPawmodoroIpc()
registerBackupIpc()
registerCollectionIpc()
registerSettingsIpc()
registerUpdaterIpc()
registerPatchNotesIpc()
registerDeckbuilderSyncIpc()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  registerImageProtocol(imageFetcher)
  // A fresh snapshot of decks/wishlist/collection on every launch (skipped if
  // nothing changed since the last one), taken before the renderer can touch anything.
  withDataLock(() => snapshot('auto'))
    .catch((err) => console.error('Launch backup failed:', err))
    .finally(() => {
      createWindow()
      startUpdateChecks()
    })
})
