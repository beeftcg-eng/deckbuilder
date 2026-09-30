import { ipcMain } from 'electron'
import { DECK_SITE_HOSTS, deckUrlTarget } from '../../src/shared/deckUrl'
import { t } from '../../src/shared/i18n'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 20_000

/**
 * Reads a deck page or API for the import box (shared/deckUrl.ts). Here rather than in the window
 * because none of these sites allows a web page to read them. Only the deck sites deckUrl.ts knows
 * are fetched, and only their deck addresses, whatever the window asks for.
 */
export function registerDeckUrlIpc(): void {
  ipcMain.handle('deckUrl:fetch', async (_e, url: string): Promise<string> => {
    const target = deckUrlTarget(String(url))
    if (!target) throw new Error('Not a deck link this app can import')
    const res = await fetch(target.fetchUrl, {
      headers: { 'User-Agent': 'BeefsBrewhouse (deck import)', Accept: target.site === 'archidekt' ? 'application/json' : 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!(DECK_SITE_HOSTS as readonly string[]).includes(new URL(res.url).hostname.replace(/^www\./, ''))) throw new Error('The deck site sent the request somewhere else')
    if (!res.ok) throw new Error(t.importDeck.linkFailed(String(res.status)))
    const body = await res.text()
    if (body.length > MAX_BYTES) throw new Error(t.importDeck.linkFailed('too large'))
    return body
  })
}
