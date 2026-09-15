/** Fetches JSON with retry/backoff on rate-limit (429) or transient server errors. */
export async function fetchJson<T>(url: string, attempt = 1): Promise<T> {
  const res = await fetch(url)
  if (res.ok) return (await res.json()) as T

  if ((res.status === 429 || res.status >= 500) && attempt < 5) {
    const delayMs = 500 * attempt
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return fetchJson<T>(url, attempt + 1)
  }

  throw new Error(`Request failed (${res.status}): ${url}`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
