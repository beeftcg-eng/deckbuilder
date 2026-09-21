import { ipcMain } from 'electron'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { PawmodoroConfig } from '../../src/shared/types'
import { pawmodoroConfigFile } from '../lib/paths'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../../src/shared/pawmodoroDefaults'

interface StoredConfig {
  url: string
  anonKey: string
  email: string
  refreshToken: string
}

async function readConfig(): Promise<StoredConfig | null> {
  const path = pawmodoroConfigFile()
  if (!existsSync(path)) return null
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as StoredConfig
  } catch {
    return null
  }
}

async function writeConfig(config: StoredConfig): Promise<void> {
  await writeFile(pawmodoroConfigFile(), JSON.stringify(config, null, 2), 'utf-8')
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
          throw new PawmodoroError('Account created — check your email to confirm it, then press Log in.')
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
    const path = pawmodoroConfigFile()
    if (existsSync(path)) await rm(path)
    return toPublicConfig(null)
  })

  ipcMain.handle(
    'pawmodoro:pushWishlist',
    async (
      _e,
      items: { entryId: string; text: string }[],
    ): Promise<{ pushed: { entryId: string; taskId: string }[]; failed: { entryId: string; message: string }[] }> => {
      const config = await readConfig()
      if (!config) throw new PawmodoroError('Not connected to Pawmodoro')

      const { accessToken, refreshToken } = await refreshAccessToken(config)
      if (refreshToken !== config.refreshToken) await writeConfig({ ...config, refreshToken })

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
}
