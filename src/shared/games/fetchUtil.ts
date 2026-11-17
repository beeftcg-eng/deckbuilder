import { t } from '../i18n'

/**
 * Identifies this app to the APIs it calls. Scryfall rejects a generic client such as
 * Node's default "node" user agent with a 400, for both its API and its card-image CDN.
 */
export const USER_AGENT = 'Deckbuilder/1.0'

/** Headers Scryfall requires on every request (a real User-Agent and an Accept). */
export const SCRYFALL_HEADERS = { 'User-Agent': USER_AGENT, Accept: '*/*' }

/** How long a server gets to start answering. Only the wait for its reply counts, not the download itself (a price file is several MB). */
export const ANSWER_TIMEOUT_MS = 45_000

/**
 * fetch() that gives up when the server hasn't started answering within `timeoutMs` (a hung API otherwise
 * stalls a sync for minutes), and turns the bare "Failed to fetch" / "fetch failed" into a NetworkError
 * that names the site.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = ANSWER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    throw toNetworkError(err, url)
  } finally {
    clearTimeout(timer)
  }
}

/** Fetches JSON with retry/backoff on rate-limit (429) or transient server errors. */
export async function fetchJson<T>(url: string, attempt = 1, headers?: Record<string, string>): Promise<T> {
  const res = await fetchWithTimeout(url, headers ? { headers } : undefined)
  if (res.ok) return (await res.json().catch((err: unknown) => Promise.reject(toNetworkError(err, url)))) as T

  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const delayMs = 500 * attempt
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return fetchJson<T>(url, attempt + 1, headers)
  }

  throw new HttpError(res.status, url)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export class HttpError extends Error {
  status: number
  url: string

  constructor(status: number, url: string) {
    // A server-side failure is the site's problem, so say so; anything else (404...) keeps the technical form.
    super(status === 429 || status >= 500 ? t.common.siteServerError(hostOf(url), status) : `Request failed (${status}): ${url}`)
    this.status = status
    this.url = url
  }
}

/** A request that never got an answer: the site is down or blocked, the device is offline, or it timed out. */
export class NetworkError extends Error {
  url: string
  timedOut: boolean

  constructor(url: string, timedOut: boolean, cause?: unknown) {
    super(timedOut ? t.common.siteTimedOut(hostOf(url)) : t.common.siteUnreachable(hostOf(url)), { cause })
    this.url = url
    this.timedOut = timedOut
  }
}

/** fetch()'s own errors ("Failed to fetch", "fetch failed", an abort) as a NetworkError; anything else as it was. */
export function toNetworkError(err: unknown, url: string): unknown {
  if (err instanceof NetworkError || err instanceof HttpError) return err
  const name = (err as { name?: unknown } | null)?.name
  if (name === 'TimeoutError' || name === 'AbortError') return new NetworkError(url, true, err)
  if (err instanceof TypeError) return new NetworkError(url, false, err)
  return err
}

export interface RetryOptions {
  /** Total tries per request (first try included). */
  attempts?: number
  /** Each try is abandoned after this long, so a hung server can't stall a sync forever. */
  timeoutMs?: number
  /** First wait between tries; doubles each time, capped at 30 s. */
  baseDelayMs?: number
  headers?: Record<string, string>
  /** Injectable so tests don't really wait. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Fetches JSON, retrying what could work next time — timeouts, dropped connections, 429 and 5xx (some of these
 * APIs answer 500 at random under load) — with growing waits. A 4xx like 404 is final and thrown at once.
 */
export async function fetchJsonWithRetry<T>(url: string, options: RetryOptions = {}): Promise<T> {
  const { attempts = 6, timeoutMs = 60_000, baseDelayMs = 1000, headers, sleep: wait = sleep } = options
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers }, timeoutMs)
      if (res.ok) return (await res.json()) as T
      const error = new HttpError(res.status, url)
      if (res.status !== 429 && res.status < 500) throw error
      lastError = error
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err
      lastError = toNetworkError(err, url)
    }
    if (attempt < attempts) await wait(Math.min(30_000, baseDelayMs * 2 ** (attempt - 1)))
  }
  throw lastError
}

/** Runs `fn` over `items` with at most `limit` in flight at once; results keep the items' order. */
export async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await fn(items[index], index)
      }
    }),
  )
  return results
}
