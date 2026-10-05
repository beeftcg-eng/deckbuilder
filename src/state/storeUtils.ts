import type {
  AppSettings,
  Binder,
  Card,
  CardCacheMeta,
  Collection,
  Deck,
  DeckViewMode,
  Format,
  GameId,
  PairingsConfig,
  PairingsLink,
  PairingsResult,
  PawmodoroConfig,
  SharedDeck,
  SyncProgress,
  TradeMatch,
  TraderProfile,
  WishlistEntry,
} from '../shared/types'
import { buildPoolIndex, gameIdOfCardId } from '../shared/collection'
import type { ParsedDeck } from '../shared/importDeck'
import type { PackOpening } from '../shared/packOpenings'
import type { BatchItem, BatchSource } from '../shared/collectionBatches'
import type { CopyDetail } from '../shared/copyDetails'
import type { UpdateStatus } from '../shared/updateStatus'
import type { RatesFile } from '../shared/currency'
import { PRICE_FILES_URL } from '../shared/priceKeys'
import { fetchJson } from '../shared/games/fetchUtil'
import type { DeckSortMode } from '../shared/deckOrder'
import type { MoveEnd } from '../shared/cardMoves'
import { t, type Language } from '../shared/i18n'
import type { StoreApi } from 'zustand'

/** Today's exchange rates, published with the price files (scripts/build-prices.ts). Null when unreachable. */
export async function loadExchangeRates(): Promise<RatesFile | null> {
  try {
    const file = await fetchJson<RatesFile>(`${PRICE_FILES_URL}/rates.json`, 3)
    return file && typeof file.rates === 'object' ? file : null
  } catch {
    return null
  }
}

export interface Catalog {
  cards: Card[]
  byId: Map<string, Card>
}

export type Catalogs = Partial<Record<GameId, Catalog>>

export type ImportBackupResult = Awaited<ReturnType<typeof window.api.backup.import>>

/** One reversible change. Undo pops the newest and puts things back as they were. */
export type UndoEntry =
  | { kind: 'edit'; label: string; before: Deck }
  | { kind: 'delete'; label: string; deck: Deck }
  | { kind: 'create'; label: string; deckId: string }

export const MAX_UNDO = 100

export function emptyDeck(gameId: GameId, formatId: string): Deck {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    gameId,
    name: t.store.newDeck,
    formatId,
    zones: {},
    freeTextZones: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function lookupIn(catalogs: Catalogs): (cardId: string) => Card | undefined {
  return (cardId) => {
    const gameId = gameIdOfCardId(cardId)
    return gameId ? catalogs[gameId]?.byId.get(cardId) : undefined
  }
}

/** Copies you own per card pool (see collection.ts poolKey), across all printings. */
export function ownedIndexOf(collection: Collection, catalogs: Catalogs): Map<string, number> {
  return buildPoolIndex(
    Object.entries(collection).map(([cardId, quantity]) => ({ cardId, quantity })),
    lookupIn(catalogs),
  )
}

export function wishlistIndexOf(wishlist: WishlistEntry[], catalogs: Catalogs): Map<string, number> {
  return buildPoolIndex(wishlist, lookupIn(catalogs))
}

export interface AppState {
  currentGameId: GameId
  catalogs: Catalogs
  syncMeta: Partial<Record<GameId, CardCacheMeta>>
  syncProgress: Partial<Record<GameId, SyncProgress>>
  formats: Partial<Record<GameId, Format[]>>
  decks: Deck[]
  currentDeckId: string | null
  showWishlist: boolean
  showCollection: boolean
  settings: AppSettings
  undoStack: UndoEntry[]
  /** Self-update progress, pushed from the main process; null until it has reported. */
  updateStatus: UpdateStatus | null
  /** Last failure worth telling the user about (e.g. a save that didn't go through). */
  error: string | null
  /** A good-news message (e.g. cards restored after a card-data change), shown until dismissed. */
  notice: string | null
  setNotice: (message: string | null) => void
  /** Shows `artId` for this Yu-Gi-Oh printing everywhere (null = its default artwork) - see artChoice.ts. */
  setArtChoice: (card: Card, artId: string | null) => void

  wishlist: WishlistEntry[]
  collection: Collection
  pawmodoroConfig: PawmodoroConfig
  pushingWishlist: boolean

  initialize: () => Promise<void>
  setError: (message: string | null) => void
  setGame: (gameId: GameId) => void
  loadMeta: (gameId: GameId) => Promise<void>
  loadCatalog: (gameId: GameId) => Promise<void>
  syncCatalog: (gameId: GameId) => Promise<void>
  loadFormats: (gameId: GameId) => Promise<void>
  saveFormats: (gameId: GameId, formats: Format[]) => Promise<void>
  loadDecks: () => Promise<void>
  createDeck: (gameId: GameId) => Promise<void>
  duplicateDeck: (deckId: string) => Promise<void>
  importDeck: (gameId: GameId, parsed: ParsedDeck, name: string, formatId: string, tags?: Record<string, string[]>) => Promise<void>
  selectDeck: (deckId: string | null) => void
  deleteDeck: (deckId: string) => Promise<void>
  updateDeck: (updater: (deck: Deck) => Deck, undoLabel?: string) => Promise<void>
  setCardQuantity: (zoneId: string, card: Card, quantity: number) => Promise<void>
  setFreeTextQuantity: (zoneId: string, label: string, quantity: number) => Promise<void>
  /** Moves one copy of a card between two zones of the open deck (e.g. main deck → sideboard), as one undoable edit. */
  moveCard: (fromZoneId: string, toZone: { id: string; label: string }, card: Card) => Promise<void>
  /** Reorders cards within one zone of the open deck (a drag-and-drop), as one undoable edit. */
  reorderDeckEntries: (zoneId: string, dragCardId: string, targetCardId: string, position: 'before' | 'after') => Promise<void>
  undo: () => Promise<void>
  setDeckSort: (sort: DeckSortMode) => void
  /** Saves a new order for the decks on screen (one game's list) and switches the list to that custom order. */
  reorderDecks: (visibleIds: string[]) => void
  showMyDecks: boolean
  setShowMyDecks: (show: boolean) => void

  /** Named, cross-game groups of owned cards (see shared/types.ts's Binder) - separate from the single flat `collection`. */
  binders: Binder[]
  /** The binder quick-add steppers on card tiles target, if any - set by opening/creating a binder in the Binders panel. */
  currentBinderId: string | null
  showBinders: boolean
  setShowBinders: (show: boolean) => void
  loadBinders: () => Promise<void>
  createBinder: (name?: string) => Promise<void>
  duplicateBinder: (binderId: string) => Promise<void>
  renameBinder: (binderId: string, name: string) => Promise<void>
  deleteBinder: (binderId: string) => Promise<void>
  /** Sets the active binder for quick-add steppers, or null to stop targeting one. */
  selectBinder: (binderId: string | null) => void
  setBinderCardQuantity: (binderId: string, cardId: string, quantity: number) => Promise<void>
  /** Moves copies of a card between binders and decks, in any direction (a deck target gets the zone the
   * card browser would pick). The collection doesn't change. Returns whether anything moved. */
  moveCards: (from: MoveEnd, to: MoveEnd, card: Card, quantity: number) => Promise<boolean>
  /** Whether the open deck is shown as the read-only full view (the default when a deck is selected) rather than in the editor. */
  deckViewing: boolean
  setDeckViewing: (viewing: boolean) => void
  /** Locks a deck so it can't be changed or deleted, or unlocks it. Not an edit itself, so it isn't undoable. */
  setDeckLocked: (deckId: string, locked: boolean) => Promise<void>
  /** Records (or clears) a deck's share-link token. Not an edit, so it isn't undoable and works on a locked deck. */
  setDeckShareToken: (deckId: string, token: string | null) => Promise<void>
  /** Saves a deck's notes. Works on a locked deck too: notes aren't the list. */
  setDeckNotes: (deckId: string, notes: string) => Promise<void>
  /** Files a deck under a folder ('' takes it out). Works on a locked deck: it's filing, not the list. */
  setDeckFolder: (deckId: string, folder: string) => Promise<void>
  /** Saves the open deck's list as a named version (deckHistory.ts). Works on a locked deck: the list doesn't change. */
  saveDeckVersion: (deckId: string, name: string) => Promise<void>
  /** Puts an earlier version's list back into the open deck (the current list is saved as a version first). Undoable. */
  restoreDeckVersion: (versionId: string) => Promise<void>
  renameDeckVersion: (deckId: string, versionId: string, name: string) => Promise<void>
  /** Sets your tags on a card in a deck (deckTags.ts). Works on a locked deck: it's sorting, not the list. */
  setCardTags: (deckId: string, card: Card, tags: string[]) => Promise<void>
  deleteDeckVersion: (deckId: string, versionId: string) => Promise<void>
  /** The phone app's card scanner (ScannerModal.tsx), opened from Collection or the menu. */
  showScanner: boolean
  setShowScanner: (show: boolean) => void
  /** A deck someone shared by link (?share=<token>), shown over everything else until closed. */
  sharedDeck: SharedDeck | null
  sharedDeckState: 'loading' | 'ready' | 'dead' | 'error' | null
  sharedDeckError: string | null
  openSharedLink: (token: string) => Promise<void>
  closeSharedDeck: () => void
  /** Saves the shared deck as a new deck of your own and opens it. */
  copySharedDeck: () => Promise<void>
  /** Opens the game's example deck (sampleDecks.ts) read-only, the way a share link opens: to try things on, or copy. Needs the game's cards loaded. */
  openExampleDeck: (gameId: GameId) => void
  /** The pack opening being filled in, if any: the scanner can add its cards to it. */
  activeOpeningId: string | null
  /** The keyboard shortcuts list (desktop). */
  showShortcuts: boolean
  setShowShortcuts: (show: boolean) => void
  setActiveOpening: (id: string | null) => void
  /** Adds or replaces an opening (packOpenings.ts). */
  savePackOpening: (opening: PackOpening) => void
  /** Forgets an opening. Its cards stay in the collection. */
  deletePackOpening: (id: string) => void
  /** One more (or fewer) of a card in an opening, and in the collection too when the opening adds its pulls there. */
  changePackPull: (openingId: string, cardId: string, delta: number) => Promise<void>
  /** Saves the order of the game tabs in the sidebar. */
  setGameOrder: (order: GameId[]) => void
  /** Shows or hides a game's tab in the sidebar. Never lets the last visible game be hidden, and switches off a game you're hiding. */
  setGameHidden: (gameId: GameId, hidden: boolean) => void
  /** Opens a deck from anywhere (the My Decks page): switches to its game, selects it, and shows the deck panel. */
  openDeck: (deckId: string) => void
  setDeckViewMode: (mode: DeckViewMode) => void
  setUpdateStatus: (status: UpdateStatus) => void
  setTheme: (id: string) => void
  /** Shows prices in this currency (converted from US dollars at the day's rate). */
  setCurrency: (code: string) => void
  /** Saves today's collection value for a game whose cards are loaded (valueHistory.ts). */
  recordCollectionValue: (gameId: GameId) => void
  /** Sets (US dollars) or clears (null) the price alert on a wishlisted card (priceAlerts.ts). */
  setPriceAlert: (cardId: string, targetUsd: number | null) => void
  /** Changes whenever the currency or its rate does, so price text re-renders (App.tsx keys on it). */
  currencyKey: string
  /** The welcome tour (WelcomeTour.tsx): opens by itself on a first launch, or from the sidebar. */
  showTour: boolean
  setShowTour: (show: boolean) => void
  /** The UI language. Changing it re-mounts the screens (App.tsx) so every string picks it up. */
  language: Language
  setLanguage: (language: Language) => void
  /** Picks (or, with null, clears) the open deck's icon card. */
  setDeckIcon: (cardId: string | null) => Promise<void>
  applySyncProgress: (progress: SyncProgress) => void

  setShowWishlist: (show: boolean) => void
  setShowCollection: (show: boolean) => void
  loadWishlist: () => Promise<void>
  addToWishlist: (card: Card, quantity?: number) => Promise<void>
  addDeckToWishlist: (deck: Deck) => Promise<number>
  wishlistMissing: (deck: Deck) => Promise<number>
  setWishlistQuantity: (entryId: string, quantity: number) => Promise<void>
  removeFromWishlist: (entryId: string) => Promise<void>

  loadCollection: () => Promise<void>
  /** Adds (or, if negative, removes) copies of one printing. Relative, so quick repeat clicks can't overwrite each other. */
  changeOwned: (cardId: string, delta: number) => Promise<void>
  /** Adds copies of several printings at once (relative, like changeOwned). Returns the copies added. */
  addToCollection: (items: { cardId: string; quantity: number }[]) => Promise<number>
  /** Keeps a many-card change to the collection so it can be undone later (collectionBatches.ts). */
  recordCollectionBatch: (gameId: GameId, source: BatchSource, items: BatchItem[]) => void
  /** Reverses a recorded batch and forgets it. Returns the copies it changed. */
  undoCollectionBatch: (batchId: string) => Promise<number>
  /** Removes every copy of these cards, as one undoable batch. Returns the copies removed. */
  removeFromCollection: (gameId: GameId, cardIds: string[]) => Promise<number>
  /** Removes every card of one game from the collection, as one undoable batch. Returns the copies removed. */
  clearCollection: (gameId: GameId) => Promise<number>
  /** Sets how many owned copies of a card have this finish and condition (copyDetails.ts). Never more than you own. */
  setCopyDetail: (cardId: string, kind: Pick<CopyDetail, 'finish' | 'condition'>, quantity: number) => void
  /** Replaces a card's copy details at once (the details editor). */
  setCopyDetails: (cardId: string, details: CopyDetail[]) => void
  /** Adds the finishes and conditions of newly added copies (an import) to what's recorded. */
  addCopyDetails: (items: { cardId: string; details: CopyDetail[] }[]) => void
  /** Wishlists one copy of each card; the ones already on the wishlist are the caller's to leave out. */
  wishlistCards: (cards: Card[]) => Promise<number>
  markDeckOwned: (deck: Deck) => Promise<number>
  markGotIt: (entryId: string) => Promise<void>

  loadPawmodoroConfig: () => Promise<void>
  connectPawmodoro: (url: string, anonKey: string, email: string, password: string, signUp?: boolean) => Promise<void>
  disconnectPawmodoro: () => Promise<void>
  pushWishlistToPawmodoro: (items: { entryId: string; text: string }[]) => Promise<{ pushedCount: number; failedCount: number }>

  /** The Pairings (tournament tracker) login - a separate account from Pawmodoro's. */
  pairingsConfig: PairingsConfig
  /** Results logged in Pairings, by Brewhouse deck id; null until fetched. */
  pairingsRecords: Record<string, PairingsResult[]> | null
  /** Every deck linked in Pairings, by Brewhouse deck id: the card list it last synced (for the sync reminder). */
  pairingsLinks: Record<string, PairingsLink> | null
  pairingsLoading: boolean
  pairingsError: string | null
  loadPairingsConfig: () => Promise<void>
  connectPairings: (email: string, password: string) => Promise<void>
  disconnectPairings: () => Promise<void>
  /** Fetches your Pairings results. `ifOlderThanMs` skips it when the last fetch is more recent than that. */
  loadPairingsRecords: (options?: { ifOlderThanMs?: number }) => Promise<void>

  showTrade: boolean
  setShowTrade: (show: boolean) => void
  /** Card ids from `collection` currently marked "for trade" — separate from quantity, see electron/lib/paths.ts forTradeFile. */
  forTrade: Set<string>
  loadForTrade: () => Promise<void>
  toggleForTrade: (cardId: string) => Promise<void>
  /** Marks every card in `cardIds` for trade (ones already marked stay marked). */
  markForTrade: (cardIds: string[]) => Promise<void>
  /** Turns your profile public/private (and sets the name shown while browsing); public turns on an immediate sync. */
  setTradeVisibility: (isPublic: boolean, displayName: string) => Promise<void>
  tradeSyncing: boolean
  /** Pushes your current collection/for-trade flags and wishlist to the cloud, for Browse/Matches to see. No-ops while private. */
  syncTradeData: () => Promise<{ skipped: number }>
  browseTraders: TraderProfile[]
  loadBrowseTraders: () => Promise<void>
  tradeMatches: TradeMatch[]
  loadTradeMatches: () => Promise<void>

  exportBackup: () => Promise<boolean>
  importBackup: () => Promise<ImportBackupResult>
}


export type SetState = StoreApi<AppState>['setState']
export type GetState = StoreApi<AppState>['getState']
