import { ipcMain } from 'electron'
import type { PawmodoroConfig, TradeListing, TradeMatch, TradeWant, TraderProfile } from '../../src/shared/types'
import {
  clearPawmodoroConfig,
  readPawmodoroConfig,
  writePawmodoroConfig,
  type StoredPawmodoroConfig,
} from '../lib/pawmodoroConfig'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../../src/shared/pawmodoroDefaults'
import { notifyPawmodoroConnectionChanged } from './deckbuilderSync'
import { t } from '../../src/shared/i18n'

type StoredConfig = StoredPawmodoroConfig
const readConfig = readPawmodoroConfig

// Connecting/disconnecting here also starts/stops this app's own decks/collection/wishlist sync
// (see deckbuilderSync.ts) - it's the same account and the same Supabase project, so one "connect
// Pawmodoro" flow covers both instead of asking twice.
async function writeConfig(config: StoredConfig): Promise<void> {
  await writePawmodoroConfig(config)
  notifyPawmodoroConnectionChanged()
}

function toPublicConfig(config: StoredConfig | null): PawmodoroConfig {
  // Unless the person opted into their own project, the shared one is the default.
  return {
    url: config?.url || DEFAULT_PAWMODORO_URL,
    anonKey: config?.anonKey || DEFAULT_PAWMODORO_ANON_KEY,
    email: config?.email ?? '',
    connected: !!config?.refreshToken,
  }
}

class PawmodoroError extends Error {}

// Mirrors supabase_sync.py's SupabaseSync — same REST/auth endpoints, same
// "refresh once on 401 then retry" behavior, so tasks pushed from here show
// up identically to ones added from the desktop app or phone.
async function request(url: string, anonKey: string, path: string, body: unknown, accessToken?: string): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: anonKey }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const res = await fetch(`${url}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const raw = await res.text()
  if (!res.ok) throw new PawmodoroError(`${res.status}: ${raw}`)
  return raw ? JSON.parse(raw) : null
}

async function refreshAccessToken(config: StoredConfig): Promise<{ accessToken: string; refreshToken: string }> {
  const result = (await request(config.url, config.anonKey, '/auth/v1/token?grant_type=refresh_token', {
    refresh_token: config.refreshToken,
  })) as { access_token: string; refresh_token: string }
  return { accessToken: result.access_token, refreshToken: result.refresh_token }
}

// Every trade call needs a config (must be connected) and a fresh access token; Supabase rotates
// the refresh token on every use, same as pushWishlist below, so it's persisted after every call.
async function authorizedConfig(): Promise<{ config: StoredConfig; accessToken: string }> {
  const config = await readConfig()
  if (!config) throw new PawmodoroError(t.store.notConnectedPawmodoro)
  const { accessToken, refreshToken } = await refreshAccessToken(config)
  if (refreshToken !== config.refreshToken) await writeConfig({ ...config, refreshToken })
  return { config, accessToken }
}

async function callRpc(config: StoredConfig, accessToken: string, name: string, params: unknown): Promise<unknown> {
  return request(config.url, config.anonKey, `/rest/v1/rpc/${name}`, params, accessToken)
}

export function registerPawmodoroIpc(): void {
  ipcMain.handle('pawmodoro:getConfig', async (): Promise<PawmodoroConfig> => toPublicConfig(await readConfig()))

  ipcMain.handle(
    'pawmodoro:connect',
    async (_e, url: string, anonKey: string, email: string, password: string, signUp = false): Promise<PawmodoroConfig> => {
      const cleanUrl = (url.trim() || DEFAULT_PAWMODORO_URL).replace(/\/$/, '')
      const key = anonKey.trim() || DEFAULT_PAWMODORO_ANON_KEY
      const credentials = { email, password }
      let result: { refresh_token?: string }
      if (signUp) {
        // Same endpoint Pawmodoro's own "Create account" uses. With email
        // confirmation on, Supabase answers with a user but no session.
        result = (await request(cleanUrl, key, '/auth/v1/signup', credentials)) as { refresh_token?: string }
        if (!result?.refresh_token) {
          throw new PawmodoroError(t.store.confirmEmail)
        }
      } else {
        result = (await request(cleanUrl, key, '/auth/v1/token?grant_type=password', credentials)) as { refresh_token?: string }
      }
      const config: StoredConfig = { url: cleanUrl, anonKey: key, email, refreshToken: result.refresh_token as string }
      await writeConfig(config)
      return toPublicConfig(config)
    },
  )

  ipcMain.handle('pawmodoro:disconnect', async (): Promise<PawmodoroConfig> => {
    await clearPawmodoroConfig()
    notifyPawmodoroConnectionChanged()
    return toPublicConfig(null)
  })

  ipcMain.handle(
    'pawmodoro:pushWishlist',
    async (
      _e,
      items: { entryId: string; text: string }[],
    ): Promise<{ pushed: { entryId: string; taskId: string }[]; failed: { entryId: string; message: string }[] }> => {
      const { config, accessToken } = await authorizedConfig()

      const pushed: { entryId: string; taskId: string }[] = []
      const failed: { entryId: string; message: string }[] = []
      for (const item of items) {
        try {
          const task = (await request(config.url, config.anonKey, '/rest/v1/rpc/add_task', {
            p_text: item.text,
            p_recurrence: 'once',
            p_source: 'wishlist',
          }, accessToken)) as { id: string }
          pushed.push({ entryId: item.entryId, taskId: task.id })
        } catch (err) {
          failed.push({ entryId: item.entryId, message: err instanceof Error ? err.message : String(err) })
        }
      }
      return { pushed, failed }
    },
  )

  ipcMain.handle('pawmodoro:setTradeProfile', async (_e, isPublic: boolean, displayName: string): Promise<void> => {
    const { config, accessToken } = await authorizedConfig()
    await callRpc(config, accessToken, 'deckbuilder_set_profile', { p_public: isPublic, p_display_name: displayName })
  })

  ipcMain.handle('pawmodoro:syncTradeCollection', async (_e, entries: TradeListing[]): Promise<void> => {
    const { config, accessToken } = await authorizedConfig()
    await callRpc(config, accessToken, 'deckbuilder_sync_collection', {
      p_entries: entries.map((e) => ({
        game_id: e.gameId, card_id: e.cardId, card_name: e.cardName, set_code: e.setCode, quantity: e.quantity, for_trade: e.forTrade,
      })),
    })
  })

  ipcMain.handle('pawmodoro:syncTradeWants', async (_e, entries: TradeWant[]): Promise<void> => {
    const { config, accessToken } = await authorizedConfig()
    await callRpc(config, accessToken, 'deckbuilder_sync_wants', {
      p_entries: entries.map((e) => ({ game_id: e.gameId, card_id: e.cardId, card_name: e.cardName, quantity: e.quantity })),
    })
  })

  ipcMain.handle('pawmodoro:browseTraders', async (): Promise<TraderProfile[]> => {
    const { config, accessToken } = await authorizedConfig()
    const rows = (await callRpc(config, accessToken, 'deckbuilder_browse', {})) as Array<{
      user_id: string
      display_name: string
      email: string
      collection: Array<{ game_id: string; card_id: string; card_name: string; set_code: string; quantity: number; for_trade: boolean }>
      wants: Array<{ game_id: string; card_id: string; card_name: string; quantity: number }>
    }>
    return rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      collection: r.collection.map((c) => ({
        gameId: c.game_id as TradeListing['gameId'], cardId: c.card_id, cardName: c.card_name, setCode: c.set_code, quantity: c.quantity, forTrade: c.for_trade,
      })),
      wants: r.wants.map((w) => ({ gameId: w.game_id as TradeWant['gameId'], cardId: w.card_id, cardName: w.card_name, quantity: w.quantity })),
    }))
  })

  ipcMain.handle('pawmodoro:tradeMatches', async (): Promise<TradeMatch[]> => {
    const { config, accessToken } = await authorizedConfig()
    const rows = (await callRpc(config, accessToken, 'deckbuilder_matches', {})) as Array<{
      user_id: string
      display_name: string
      email: string
      they_have_what_i_want: Array<{ game_id: string; card_name: string }>
      i_have_what_they_want: Array<{ game_id: string; card_name: string }>
      mutual: boolean
    }>
    return rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      theyHaveWhatIWant: r.they_have_what_i_want.map((c) => ({ gameId: c.game_id as TradeMatch['theyHaveWhatIWant'][number]['gameId'], cardName: c.card_name })),
      iHaveWhatTheyWant: r.i_have_what_they_want.map((c) => ({ gameId: c.game_id as TradeMatch['iHaveWhatTheyWant'][number]['gameId'], cardName: c.card_name })),
      mutual: r.mutual,
    }))
  })
}
