import { contextBridge, ipcRenderer, clipboard } from 'electron'
import type {
  AppSettings,
  Binder,
  Card,
  CardCacheMeta,
  Collection,
  Deck,
  Format,
  GameId,
  PawmodoroConfig,
  SyncProgress,
  TradeListing,
  TradeMatch,
  TradeWant,
  TraderProfile,
  WishlistEntry,
} from '../src/shared/types'
import type { UpdateStatus } from '../src/shared/updateStatus'
import type { PatchNote } from '../src/shared/patchNotes'
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
    save: (deck: Deck, options?: { keepUpdatedAt?: boolean }): Promise<Deck> => ipcRenderer.invoke('decks:save', deck, options),
    delete: (deckId: string): Promise<void> => ipcRenderer.invoke('decks:delete', deckId),
  },
  binders: {
    list: (): Promise<Binder[]> => ipcRenderer.invoke('binders:list'),
    save: (binder: Binder): Promise<Binder> => ipcRenderer.invoke('binders:save', binder),
    delete: (binderId: string): Promise<void> => ipcRenderer.invoke('binders:delete', binderId),
  },
  formats: {
    list: (gameId: GameId): Promise<Format[]> => ipcRenderer.invoke('formats:list', gameId),
    path: (): Promise<string> => ipcRenderer.invoke('formats:path'),
    save: (gameId: GameId, formats: Format[]): Promise<Format[]> => ipcRenderer.invoke('formats:save', gameId, formats),
  },
  collection: {
    get: (): Promise<Collection> => ipcRenderer.invoke('collection:get'),
    add: (items: { cardId: string; quantity: number }[]): Promise<Collection> => ipcRenderer.invoke('collection:add', items),
    getForTrade: (): Promise<string[]> => ipcRenderer.invoke('collection:getForTrade'),
    setForTrade: (cardId: string, forTrade: boolean): Promise<string[]> => ipcRenderer.invoke('collection:setForTrade', cardId, forTrade),
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
    connect: (url: string, anonKey: string, email: string, password: string, signUp = false): Promise<PawmodoroConfig> =>
      ipcRenderer.invoke('pawmodoro:connect', url, anonKey, email, password, signUp),
    disconnect: (): Promise<PawmodoroConfig> => ipcRenderer.invoke('pawmodoro:disconnect'),
    pushWishlist: (
      items: { entryId: string; text: string }[],
    ): Promise<{ pushed: { entryId: string; taskId: string }[]; failed: { entryId: string; message: string }[] }> =>
      ipcRenderer.invoke('pawmodoro:pushWishlist', items),
    setTradeProfile: (isPublic: boolean, displayName: string): Promise<void> =>
      ipcRenderer.invoke('pawmodoro:setTradeProfile', isPublic, displayName),
    syncTradeCollection: (entries: TradeListing[]): Promise<void> => ipcRenderer.invoke('pawmodoro:syncTradeCollection', entries),
    syncTradeWants: (entries: TradeWant[]): Promise<void> => ipcRenderer.invoke('pawmodoro:syncTradeWants', entries),
    browseTraders: (): Promise<TraderProfile[]> => ipcRenderer.invoke('pawmodoro:browseTraders'),
    tradeMatches: (): Promise<TradeMatch[]> => ipcRenderer.invoke('pawmodoro:tradeMatches'),
    // Fires when this app's own decks/collection/wishlist sync (separate from the trading calls
    // above) applies a background pull - e.g. a deck added on the phone. No payload; the listener
    // just re-fetches via decks.list()/collection.get()/wishlist.list().
    onSyncPulled: (callback: () => void): (() => void) => {
      const listener = () => callback()
      ipcRenderer.on('deckbuilderSync:pulled', listener)
      return () => {
        ipcRenderer.removeListener('deckbuilderSync:pulled', listener)
      }
    },
  },
  backup: {
    export: (): Promise<boolean> => ipcRenderer.invoke('backup:export'),
    import: (): Promise<ImportResult> => ipcRenderer.invoke('backup:import'),
    openFolder: (): Promise<void> => ipcRenderer.invoke('backup:openFolder'),
  },
  updater: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke('updater:status'),
    check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
    install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: UpdateStatus) => callback(status)
      ipcRenderer.on('updater:status', listener)
      return () => {
        ipcRenderer.removeListener('updater:status', listener)
      }
    },
  },
  exportPaste: (content: string): Promise<string> => ipcRenderer.invoke('export:paste', content),
  exportSaveFile: (content: string, suggestedName: string): Promise<boolean> =>
    ipcRenderer.invoke('export:saveFile', content, suggestedName),
  exportSaveImage: (dataUrl: string, suggestedName: string): Promise<boolean> =>
    ipcRenderer.invoke('export:saveImage', dataUrl, suggestedName),
  images: {
    fetchDataUri: (url: string): Promise<string> => ipcRenderer.invoke('images:fetchDataUri', url),
  },
  system: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('system:openExternal', url),
    showFile: (path: string): Promise<void> => ipcRenderer.invoke('system:showFile', path),
  },
  patchNotes: {
    list: (): Promise<PatchNote[]> => ipcRenderer.invoke('patchNotes:list'),
  },
  clipboard: {
    writeText: (text: string): Promise<void> => clipboard.writeText(text),
  },
}

contextBridge.exposeInMainWorld('api', api)

export type DeckbuilderApi = typeof api
