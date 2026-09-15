import { contextBridge, ipcRenderer, clipboard } from 'electron'
import type { Card, CardCacheMeta, Deck, Format, GameId, SyncProgress } from '../src/shared/types'

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
