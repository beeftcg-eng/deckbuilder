/**
 * Yu-Gi-Oh! card images (see games/yugioh.ts's normalizeCard) are addressed as `dbimg://ygo/<size>/<id>.jpg`
 * rather than a real URL, because YGOPRODeck's API guide asks that its images not be hotlinked directly
 * ("failure to do so will result in an IP blacklist"). On Electron, `electron/ipc/imageProtocol.ts` registers
 * a real `dbimg:` protocol handler backed by `electron/lib/imageCache.ts`'s on-disk cache, so each image is
 * only ever fetched from YGOPRODeck once per machine. A browser has no way to register a custom protocol
 * scheme at all - `dbimg://` URLs simply fail to load there, which is why Yu-Gi-Oh card images were
 * completely broken in the PWA. This resolves the same address to the real HTTPS URL instead, relying on
 * the browser's own standard HTTP cache (YGOPRODeck's image CDN sends normal cache headers) rather than a
 * custom on-disk cache - a card's image is still normally fetched from their servers only once per device,
 * just via the browser's built-in caching instead of a bespoke one.
 */

const YGO_URLS: Record<'small' | 'full', (id: string) => string> = {
  small: (id) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`,
  full: (id) => `https://images.ygoprodeck.com/images/cards/${id}.jpg`,
}

const DBIMG_PATTERN = /^dbimg:\/\/(ygo)\/(small|full)\/(\d{1,12})\.jpg$/

/** Passes any ordinary URL through unchanged; only resolves the `dbimg://` scheme. */
export function resolveDbImgUrl(url: string): string {
  const match = DBIMG_PATTERN.exec(url)
  if (!match) return url
  const [, , size, id] = match
  return YGO_URLS[size as 'small' | 'full'](id)
}
