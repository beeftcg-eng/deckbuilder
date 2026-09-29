import { protocol } from 'electron'
import { ImageFetcher, parseImageUrl } from '../lib/imageCache'

export const IMAGE_SCHEME = 'dbimg'

/** Must run before the app is ready: lets the page load `dbimg://` images like any other. */
export function registerImageSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

/** Serves `dbimg://…` from the local image cache, downloading an image the first time it's asked for (see lib/imageCache.ts). */
export function registerImageProtocol(fetcher: ImageFetcher): void {
  protocol.handle(IMAGE_SCHEME, async (request) => {
    const ref = parseImageUrl(request.url)
    if (!ref) return new Response(null, { status: 400 })
    try {
      const bytes = await fetcher.get(ref)
      return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } })
    } catch {
      return new Response(null, { status: 502 })
    }
  })
}
