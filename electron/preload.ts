import { contextBridge, ipcRenderer, clipboard } from 'electron'
import type {
  AppSettings,
  Card,
  CardCacheMeta,
  Collection,
  Deck,
  Format,
  GameId,
  PawmodoroConfig,
  SyncProgress,
  WishlistEntry,
} from '../src/shared/types'
import type { ImportResult } from './ipc/backup'

const api = {
  cards: {
    meta: (gameId: GameId): Promise<CardCacheMeta> => ipcRenderer.invoke('cards:meta', gameId),
    load: (gameId: GameId): Promise<Card[]> => ipcRenderer.invoke('cards:load', gameId),
    sync: (gameId: GameId): Promise<CardCacheMeta> => ipcRenderer.invoke('cards:sync', gameId),
    onSyncProgress: (callback: (progress: SyncProgress) => void): (() => void) => {
      const listener = (_e: unknown, progress: SyncProgress) => callback(progress)
      ipcRenderer.on('cards:syncProgress', listener)
      return () => {
        ipcRenderer.removeListener('cards:syncProgress', listener)
      }
    },
  },
  decks: {
    list: (): Promise<Deck[]> => ipcRenderer.invoke('decks:list'),
    save: (deck: Deck): Promise<Deck> => ipcRenderer.invoke('decks:save', deck),
    delete: (deckId: string): Promise<void> => ipcRenderer.invoke('decks:delete', deckId),
  },
  formats: {
    list: (gameId: GameId): Promise<Format[]> => ipcRenderer.invoke('formats:list', gameId),
    path: (): Promise<string> => ipcRenderer.invoke('formats:path'),
    save: (gameId: GameId, formats: Format[]): Promise<Format[]> => ipcRenderer.invoke('formats:save', gameId, formats),
  },
  collection: {
    get: (): Promise<Collection> => ipcRenderer.invoke('collection:get'),
    add: (items: { cardId: string; quantity: number }[]): Promise<Collection> => ipcRenderer.invoke('collection:add', items),
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (patch: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch),
  },
  wishlist: {
    list: (): Promise<WishlistEntry[]> => ipcRenderer.invoke('wishlist:list'),
    add: (gameId: GameId, cardId: string, quantity: number): Promise<WishlistEntry[]> =>
      ipcRenderer.invoke('wishlist:add', gameId, cardId, quantity),
    addMany: (items: { gameId: GameId; cardId: string; quantity: number }[]): Promise<WishlistEntry[]> =>
      ipcRenderer.invoke('wishlist:addMany', items),
    setQuantity: (entryId: string, quantity: number): Promise<WishlistEntry[]> =>
      ipcRenderer.invoke('wishlist:setQuantity', entryId, quantity),
    remove: (entryId: string): Promise<WishlistEntry[]> => ipcRenderer.invoke('wishlist:remove', entryId),
    markPushed: (results: { entryId: string; taskId: string }[]): Promise<WishlistEntry[]> =>
      ipcRenderer.invoke('wishlist:markPushed', results),
  },
  pawmodoro: {
    getConfig: (): Promise<PawmodoroConfig> => ipcRenderer.invoke('pawmodoro:getConfig'),
    connect: (url: string, anonKey: string, email: string, password: string): Promise<PawmodoroConfig> =>
      ipcRenderer.invoke('pawmodoro:connect', url, anonKey, email, password),
    disconnect: (): Promise<PawmodoroConfig> => ipcRenderer.invoke('pawmodoro:disconnect'),
    pushWishlist: (
      items: { entryId: string; text: string }[],
    ): Promise<{ pushed: { entryId: string; taskId: string }[]; failed: { entryId: string; message: string }[] }> =>
      ipcRenderer.invoke('pawmodoro:pushWishlist', items),
  },
  backup: {
    export: (): Promise<boolean> => ipcRenderer.invoke('backup:export'),
    import: (): Promise<ImportResult> => ipcRenderer.invoke('backup:import'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('backup:openFolder'),
  },
  exportPaste: (content: string): Promise<string> => ipcRenderer.invoke('export:paste', content),
  exportSaveFile: (content: string, suggestedName: string): Promise<boolean> =>
    ipcRenderer.invoke('export:saveFile', content, suggestedName),
  exportSavePng: (dataUrl: string, suggestedName: string): Promise<boolean> =>
    ipcRenderer.invoke('export:savePng', dataUrl, suggestedName),
  images: {
    fetchDataUri: (url: string): Promise<string> => ipcRenderer.invoke('images:fetchDataUri', url),
  },
  system: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('system:openExternal', url),
    showFile: (path: string): Promise<void> => ipcRenderer.invoke('system:showFile', path),
  },
  clipboard: {
    writeText: (text: string): Promise<void> => clipboard.writeText(text),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type DeckbuilderApi = typeof api
