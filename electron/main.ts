import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { registerCardDataIpc } from './ipc/cardData'
import { registerDecksIpc } from './ipc/decks'
import { registerFormatsIpc } from './ipc/formats'
import { registerExportIpc } from './ipc/exportPaste'

const __dirname = dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = join(__dirname, '..')
const RENDERER_DIST = join(process.env.APP_ROOT, 'dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#14151a',
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
