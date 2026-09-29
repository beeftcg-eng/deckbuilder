import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

export const ASSET_SCHEME = 'dbasset'

const TYPES: Record<string, string> = {
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
}

/** Must run before the app is ready, alongside the image scheme (imageProtocol.ts). */
export const ASSET_SCHEME_PRIVILEGES = { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }

/**
 * Serves the app's own built files (`dbasset://app/assets/…` → `dist/assets/…`) to the page. The
 * card scanner needs this: its OCR models and onnxruntime's engine are fetched at runtime, and the
 * page itself is a file:// one, which fetch() can't read.
 */
export function registerAssetProtocol(rendererDist: string): void {
  const root = normalize(rendererDist + sep)
  protocol.handle(ASSET_SCHEME, async (request) => {
    const path = normalize(join(root, decodeURIComponent(new URL(request.url).pathname)))
    if (!path.startsWith(root)) return new Response(null, { status: 403 })
    try {
      const bytes = await readFile(path)
      return new Response(new Uint8Array(bytes), {
        headers: { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'access-control-allow-origin': '*' },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
