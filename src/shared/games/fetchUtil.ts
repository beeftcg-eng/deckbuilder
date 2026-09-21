/**
 * Identifies this app to the APIs it calls. Scryfall rejects a generic client such as
 * Node's default "node" user agent with a 400, for both its API and its card-image CDN.
 */
export const USER_AGENT = 'Deckbuilder/1.0'

/** Headers Scryfall requires on every request (a real User-Agent and an Accept). */
export const SCRYFALL_HEADERS = { 'User-Agent': USER_AGENT, Accept: '*/*' }

/** Fetches JSON with retry/backoff on rate-limit (429) or transient server errors. */
export async function fetchJson<T>(url: string, attempt = 1, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, headers ? { headers } : undefined)
  if (res.ok) return (await res.json()) as T

  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const delayMs = 500 * attempt
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return fetchJson<T>(url, attempt + 1, headers)
  }

  throw new Error(`Request failed (${res.status}): ${url}`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
