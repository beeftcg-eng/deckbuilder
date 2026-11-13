/**
 * Anonymous usage counts, only for people who tick "Share anonymous usage counts" (off until then).
 * What's counted is which parts of the app get used, by fixed names: a window opening ("window:export-
 * modal"), a panel or game shown ("panel:collection", "game:onepiece"), a palette group used. Never a
 * deck, card, name, anything typed, an account or a device id. Counts add up per day on the device
 * and are sent once the day is over, to deckbuilder_record_usage (scripts/pawmodoro-migration-
 * 2026-11-13-usage.sql), which adds them to everyone's totals for that day, platform and version.
 */
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from './pawmodoroDefaults'

const STORAGE_KEY = 'brewhouse.usage.v1'
/** Counts older than this that never went through are dropped. */
const KEEP_DAYS = 30
const FEATURE = /^[a-z][a-z0-9:.-]{0,63}$/
/** At most this many uses of one thing a day are counted (the server caps it too). */
const MAX_PER_DAY = 5000

export type UsageDays = Record<string, Record<string, number>>

let enabled = false

/** Turned on and off with the setting (and off until settings have loaded). */
export function setUsageEnabled(on: boolean): void {
  enabled = on
  if (!on) write({})
}

export function usageEnabled(): boolean {
  return enabled
}

function read(): UsageDays {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as UsageDays) : {}
  } catch {
    return {}
  }
}

function write(days: UsageDays): void {
  try {
    if (Object.keys(days).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(days))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // storage blocked: nothing is kept, so nothing is sent
  }
}

export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** A feature name as counted: lower case, only the allowed characters, or null when it isn't one. */
export function featureName(raw: string): string | null {
  const name = raw
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9:.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return FEATURE.test(name) ? name : null
}

/** Adds one use of `feature` to today's counts (nothing when the setting is off). */
export function countUse(feature: string, now = new Date()): void {
  if (!enabled) return
  const name = featureName(feature)
  if (!name) return
  const days = read()
  const day = (days[localDay(now)] ??= {})
  day[name] = Math.min(MAX_PER_DAY, (day[name] ?? 0) + 1)
  write(days)
}

/** What's waiting to be sent, for "What's sent?". */
export function pendingUsage(): UsageDays {
  return read()
}

/** The days to send now (every finished day), and what's kept: today, and nothing older than KEEP_DAYS. */
export function daysToSend(days: UsageDays, now = new Date()): { send: [string, Record<string, number>][]; keep: UsageDays } {
  const today = localDay(now)
  const oldest = localDay(new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000))
  const send: [string, Record<string, number>][] = []
  const keep: UsageDays = {}
  for (const [day, counts] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < oldest) continue
    if (day === today) keep[day] = counts
    else send.push([day, counts])
  }
  return { send, keep }
}

/**
 * Sends every finished day's counts, one request a day, and forgets each once it's in. A day that
 * fails stays for next time. Never throws.
 */
export async function sendUsage(platform: 'desktop' | 'web', version: string, now = new Date()): Promise<void> {
  if (!enabled) return
  const { send, keep } = daysToSend(read(), now)
  const left: UsageDays = { ...keep }
  for (const [day, counts] of send) {
    try {
      const res = await fetch(`${DEFAULT_PAWMODORO_URL}/rest/v1/rpc/deckbuilder_record_usage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: DEFAULT_PAWMODORO_ANON_KEY, Authorization: `Bearer ${DEFAULT_PAWMODORO_ANON_KEY}` },
        body: JSON.stringify({ p_day: day, p_platform: platform, p_version: /^[0-9a-z.+-]{1,32}$/.test(version) ? version : 'unknown', p_counts: counts }),
      })
      if (!res.ok) left[day] = counts
    } catch {
      left[day] = counts
    }
  }
  // Counts made while sending were added to storage meanwhile: keep those too.
  const current = read()
  for (const [day, counts] of Object.entries(current)) if (day === localDay(now)) left[day] = counts
  write(left)
}
