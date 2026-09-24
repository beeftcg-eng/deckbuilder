import { ClipboardItem, clipboard, ipcMain, nativeImage } from 'electron'
import { USER_AGENT } from '../../src/shared/games/fetchUtil'
import { ImageFetcher, parseImageUrl } from '../lib/imageCache'

/**
 * Fetches an image server-side and returns it as a data: URI. Card images come from
 * CDNs that don't send CORS headers, so fetching them from the renderer would taint
 * any canvas that draws them; a data: URI is same-origin as far as canvas is concerned.
 */
export function registerImagesIpc(imageFetcher: ImageFetcher): void {
  // Copies a picture as PNG (what every app pastes). This Electron's clipboard takes W3C-style items.
  ipcMain.handle('clipboard:writeImage', async (_e, dataUrl: string): Promise<void> => {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) throw new Error("That image couldn't be read")
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }) })])
  })

  ipcMain.handle('images:fetchDataUri', async (_e, url: string): Promise<string> => {
    // Images that mustn't be hotlinked come from the local cache (downloaded once) instead of the network.
    const cached = parseImageUrl(url)
    if (cached) return `data:image/jpeg;base64,${(await imageFetcher.get(cached)).toString('base64')}`
    // Scryfall's image CDN answers Node's default user agent with a 400.
    const res = await fetch(url, new URL(url).hostname.endsWith('scryfall.io') ? { headers: { 'User-Agent': USER_AGENT } } : undefined)
    if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${url}`)
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString('base64')}`
  })
}
