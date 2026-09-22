/**
 * The Supabase REST/auth calls Deckbuilder's own decks/collection/wishlist sync needs - plain
 * `fetch()`, so this file works unchanged in the Electron main process (Node's fetch) and in a
 * browser (the PWA). Mirrors electron/ipc/pawmodoro.ts's request/refreshAccessToken/callRpc,
 * which predates this and is left as its own thing rather than refactored to use this, since it
 * already works and touches the trading feature - duplication here is cheap and safer than a
 * risky shared-code refactor of something already shipped.
 */

export interface SyncConfig {
  url: string
  anonKey: string
  refreshToken: string
  /** Display-only; not used for any auth call. */
  email?: string
}

export class SyncClientError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

/** A network-level failure or a dead session - worth retrying later. Anything else (the server
 * rejected the request itself, e.g. a row that's already gone) is final and shouldn't be retried. */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof SyncClientError)) return true // fetch() throwing (offline, DNS, etc.)
  if (err.status == null) return true
  return err.status === 401 || err.status === 408 || err.status === 429 || err.status >= 500
}

async function request(url: string, anonKey: string, path: string, body: unknown, accessToken?: string): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: anonKey }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  let res: Response
  try {
    res = await fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  } catch (err) {
    throw new SyncClientError(err instanceof Error ? err.message : String(err))
  }
  const raw = await res.text()
  if (!res.ok) throw new SyncClientError(`${res.status}: ${raw}`, res.status)
  return raw ? JSON.parse(raw) : null
}

/** Supabase rotates the refresh token on every use - callers must persist the returned one. */
export async function refreshAccessToken(config: SyncConfig): Promise<{ accessToken: string; refreshToken: string }> {
  const result = (await request(config.url, config.anonKey, '/auth/v1/token?grant_type=refresh_token', {
    refresh_token: config.refreshToken,
  })) as { access_token: string; refresh_token: string }
  return { accessToken: result.access_token, refreshToken: result.refresh_token }
}

export async function passwordLogin(url: string, anonKey: string, email: string, password: string): Promise<{ refreshToken: string }> {
  const result = (await request(url, anonKey, '/auth/v1/token?grant_type=password', { email, password })) as { refresh_token: string }
  return { refreshToken: result.refresh_token }
}

export async function signUp(url: string, anonKey: string, email: string, password: string): Promise<{ refreshToken: string | null }> {
  const result = (await request(url, anonKey, '/auth/v1/signup', { email, password })) as { refresh_token?: string }
  return { refreshToken: result.refresh_token ?? null }
}

export async function callRpc(config: SyncConfig, accessToken: string, name: string, params: unknown): Promise<unknown> {
  return request(config.url, config.anonKey, `/rest/v1/rpc/${name}`, params, accessToken)
}
