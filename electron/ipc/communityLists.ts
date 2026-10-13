import { ipcMain } from 'electron'
import { COMMUNITY_LISTS_HOST, COMMUNITY_LISTS_URL } from '../../src/shared/communityLists'
import { t } from '../../src/shared/i18n'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 20_000

/**
 * Reads RiftAtlas's Decks page or one of its event pages, for the Community lists when the published
 * file is missing or old (shared/communityLists.ts). Only those pages.
 */
export function registerCommunityListsIpc(): void {
  ipcMain.handle('communityLists:fetch', async (_e, url: unknown): Promise<string> => {
    const target = String(url ?? COMMUNITY_LISTS_URL)
    if (target !== COMMUNITY_LISTS_URL && !/^https:\/\/riftatlas\.com\/events\/[a-z0-9][a-z0-9-]{0,199}$/.test(target)) throw new Error('Not a RiftAtlas page this app reads')
    const res = await fetch(target, {
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
