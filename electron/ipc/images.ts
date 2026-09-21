import { ipcMain } from 'electron'
import { USER_AGENT } from '../../src/shared/games/fetchUtil'

/**
 * Fetches an image server-side and returns it as a data: URI. Card images come from
 * CDNs that don't send CORS headers, so fetching them from the renderer would taint
 * any canvas that draws them; a data: URI is same-origin as far as canvas is concerned.
 */
export function registerImagesIpc(): void {
  ipcMain.handle('images:fetchDataUri', async (_e, url: string): Promise<string> => {
    // Scryfall's image CDN answers Node's default user agent with a 400.
    const res = await fetch(url, new URL(url).hostname.endsWith('scryfall.io') ? { headers: { 'User-Agent': USER_AGENT } } : undefined)
    if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${url}`)
    const contentType = res.headers.get('content-type') ?? 'image/png'
    const buffer = Buffer.from(await res.arrayBuffer())
    return `data:${contentType};base64,${buffer.toString('base64')}`
  })
}
