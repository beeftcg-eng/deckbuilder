import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { registerCardDataIpc } from './ipc/cardData'
import { registerDecksIpc } from './ipc/decks'
import { registerFormatsIpc } from './ipc/formats'
import { registerExportIpc } from './ipc/exportPaste'
import { registerImagesIpc } from './ipc/images'

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
registerImagesIpc()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(createWindow)
