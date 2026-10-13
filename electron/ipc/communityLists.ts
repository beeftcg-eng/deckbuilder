import { ipcMain } from 'electron'
import { COMMUNITY_LISTS_HOST, COMMUNITY_LISTS_URL } from '../../src/shared/communityLists'
import { t } from '../../src/shared/i18n'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 20_000

/** Reads RiftAtlas's Decks page for the Community lists window (shared/communityLists.ts). Only that page. */
export function registerCommunityListsIpc(): void {
  ipcMain.handle('communityLists:fetch', async (): Promise<string> => {
    const res = await fetch(COMMUNITY_LISTS_URL, {
      headers: { 'User-Agent': 'BeefsBrewhouse (community lists)', Accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (new URL(res.url).hostname.replace(/^www\./, '') !== COMMUNITY_LISTS_HOST) throw new Error('RiftAtlas sent the request somewhere else')
    if (!res.ok) throw new Error(t.communityLists.fetchFailed(String(res.status)))
    const body = await res.text()
    if (body.length > MAX_BYTES) throw new Error(t.communityLists.fetchFailed('too large'))
    return body
  })
}
