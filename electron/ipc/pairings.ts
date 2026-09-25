import { ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import type { PairingsConfig, PairingsDeckRecord } from '../../src/shared/types'
import { passwordLogin, type SyncConfig } from '../../src/shared/sync/client'
import { fetchDeckRecords } from '../../src/shared/pairingsRecord'
import { PAIRINGS_ANON_KEY, PAIRINGS_URL } from '../../src/shared/pairingsDefaults'
import { pairingsConfigFile } from '../lib/paths'
import { t } from '../../src/shared/i18n'

// The Pairings login: read-only use of your tournament results (see shared/pairingsRecord.ts).
// Kept in its own file, apart from pawmodoro-sync.json, because it's a different account.

async function readConfig(): Promise<SyncConfig | null> {
  const path = pairingsConfigFile()
  if (!existsSync(path)) return null
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as SyncConfig
  } catch {
    return null
  }
}

async function writeConfig(config: SyncConfig): Promise<void> {
  await writeFile(pairingsConfigFile(), JSON.stringify(config, null, 2), 'utf-8')
}

function toPublicConfig(config: SyncConfig | null): PairingsConfig {
  return { email: config?.email ?? '', connected: !!config?.refreshToken }
}

export function registerPairingsIpc(): void {
  ipcMain.handle('pairings:getConfig', async (): Promise<PairingsConfig> => toPublicConfig(await readConfig()))

  ipcMain.handle('pairings:connect', async (_e, email: string, password: string): Promise<PairingsConfig> => {
    const { refreshToken } = await passwordLogin(PAIRINGS_URL, PAIRINGS_ANON_KEY, email, password)
    const config: SyncConfig = { url: PAIRINGS_URL, anonKey: PAIRINGS_ANON_KEY, email, refreshToken }
    await writeConfig(config)
    return toPublicConfig(config)
  })

  ipcMain.handle('pairings:disconnect', async (): Promise<PairingsConfig> => {
    const path = pairingsConfigFile()
    if (existsSync(path)) await rm(path)
    return toPublicConfig(null)
  })

  ipcMain.handle('pairings:deckRecords', async (): Promise<PairingsDeckRecord[]> => {
    const config = await readConfig()
    if (!config) throw new Error(t.store.notConnectedPairings)
    const { records, refreshToken } = await fetchDeckRecords(config)
    if (refreshToken !== config.refreshToken) await writeConfig({ ...config, refreshToken })
    return records
  })
}
