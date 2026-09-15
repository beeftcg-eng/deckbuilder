import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'

const DPASTE_URL = 'https://dpaste.com/api/v2/'

export function registerExportIpc(): void {
  ipcMain.handle('export:paste', async (_e, content: string): Promise<string> => {
    const body = new URLSearchParams({ content, syntax: 'text', expiry_days: '365' })
    const res = await fetch(DPASTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) throw new Error(`Paste upload failed (${res.status})`)
    const url = (await res.text()).trim()
    return url
  })

  ipcMain.handle('system:openExternal', async (_e, url: string): Promise<void> => {
    await shell.openExternal(url)
  })

  ipcMain.handle('system:showFile', async (_e, path: string): Promise<void> => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('export:saveFile', async (e, content: string, suggestedName: string): Promise<boolean> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.SaveDialogOptions = {
      defaultPath: suggestedName,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    await writeFile(result.filePath, content, 'utf-8')
    return true
  })

  ipcMain.handle('export:savePng', async (e, dataUrl: string, suggestedName: string): Promise<boolean> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: Electron.SaveDialogOptions = {
      defaultPath: suggestedName,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
    }
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    await writeFile(result.filePath, Buffer.from(base64, 'base64'))
    return true
  })
}
