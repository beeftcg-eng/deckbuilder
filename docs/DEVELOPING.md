# Developing

## Running it

Requires Node.js 20+.

```bash
npm install
npm run dev
```

This starts the Vite dev server and launches the Electron window.

Other scripts: `npm test` (unit tests for the importer, legality/collection math, atomic saves and backups, plus component tests in `src/components/__tests__/` that render screens in happy-dom), `npm run typecheck`, `npm run lint`, and `npm run check` for all three, which CI (`.github/workflows/ci.yml`) runs on every push.

The app's state is one zustand store (`src/state/useAppStore.ts`) built from slices in `src/state/slices/` (app, catalog, decks, binders, collection, accounts) that share the helpers in `src/state/storeContext.ts`. Settings are stored in two parts: preferences in `settings.json` and the growing records (pack openings, price alerts, value graph, collection batches, copy details) in `items.json` (`src/shared/settingsItems.ts`); records move there by themselves on the first save, and desktop backups now include them.

### Tests

- `npm test`: unit and component tests (vitest), including an accessibility pass with axe over the main screens (`src/components/__tests__/accessibility.test.tsx`).
- `npm run e2e`: end-to-end tests (Playwright, `e2e/`). They build the phone app, serve it locally, and drive it in Chromium at desktop and phone sizes: importing, building a deck, Ctrl+K, Practice, a ban list update, phone layout (no control past the screen's edge), and axe's WCAG 2.1 AA rules on real pages. Card data and every outside file are fixtures, so nothing depends on the network. Run `npx playwright install chromium` once first. CI runs both.

## Releases

**Publishing a release** (maintainers): with the work committed on master, `scripts/release.sh notes.md [patch|minor|major]` does it all: checks, bumps the version, commits `vX.Y.Z: <the notes' first line>`, tags and pushes, waits for the Windows build, and publishes (it stops before publishing if that build fails). By hand: bump the version in `package.json`, commit and push, push a `v*` tag (or run the *Build Windows installer* workflow) and wait for it to succeed, then run `scripts/publish-release.sh [notes-file]`. It fetches the Windows build, builds the AppImage, checks both update manifests match the version, and creates the release in the downloads repo. The manifests (`latest.yml`, `latest-linux.yml`) are what installed copies read, so a release without them can't update anyone.

Release in batches: a handful of changes a week as one version, not one release per fix. Each release is an update prompt for everyone, and fewer, fuller patch notes are easier to read.

## Building an installer

```bash
npm run build
```

Type-checks, runs the tests, then produces an AppImage (Linux), NSIS installer (Windows), or dmg (macOS, when built on a Mac) in `release/`. The Linux AppImage is always named `Deckbuilder.AppImage` (no version in the file name), so a desktop launcher pointing at `release/Deckbuilder.AppImage` keeps working across updates — just rebuild.

## The phone app

**Phone layout**: a top bar (game picker, Undo) and a bottom tab bar: **Cards** (the card browser), **Deck** (the open deck, with its card count), **My Decks**, **Wishlist** and **More** (the drawer with your decks, Collection, Trade, Binders and settings). While editing a deck, Cards and Deck are separate tabs rather than one long page with the deck below every loaded card, and the card list keeps its place when you switch back. The browser's filters fold away behind a **Filters** button. All of it is inside app.css's mobile breakpoint (plus `MobileNav.tsx`, hidden above it), so the desktop window is untouched.

It's almost entirely the same React app as the desktop build — `src/web/webApi.ts` implements the same `window.api` surface the Electron preload script does (see `electron/preload.ts`), just backed by the browser's IndexedDB instead of local JSON files, so none of the UI components or the Zustand store needed to change. Built and deployed to GitHub Pages by `.github/workflows/deploy-pwa.yml` on every push to `master`; to build+preview it locally: `npm run dev:web` (or `npm run build:web` for a production build in `dist-web/`).

**Decks, collection and wishlist sync with desktop** — the one thing local-only phone data wouldn't be much good for. Connect the same Pawmodoro account the desktop app already offers (for wishlist push and trading — connecting once covers all three). Sync is local-first and offline-safe: every edit applies immediately and is queued for upload, following the exact same design as Pawmodoro's own desktop↔phone sync (`sync_engine.py`/`storage.py` there) — see `src/shared/sync/engine.ts` here, and `supabase/schema.sql` in the Pawmodoro repo (the `deckbuilder_decks` table and the `deckbuilder_*` RPCs below the trading feature's own tables) for the server side. Card data itself isn't synced — the phone does its own first sync from the same public card APIs the desktop app uses.

## Architecture notes

- `src/shared/` — game-agnostic types, per-game adapters (`games/*.ts`), the legality checker, export formatting, and `sync/` (the decks/collection/wishlist sync engine — outbox + local rev, see "The phone app" above — used identically by both platforms below).
- `electron/` — main process: IPC handlers for card sync/caching, deck persistence, format storage, the wishlist, the collection, settings, Pawmodoro Cloud Sync + this app's own sync (`ipc/deckbuilderSync.ts`, `lib/nodeSyncStore.ts`), backup/restore, and export (paste upload, save-file dialog). `electron/lib/` holds the shared plumbing: `jsonStore.ts` (atomic writes, corrupt-file handling, the per-file save queue) and `backups.ts` (rotating snapshots).
- `src/web/` — the browser/PWA implementation of the same `window.api` surface `electron/preload.ts` exposes (`webApi.ts`), backed by IndexedDB (`idb.ts`) instead of local JSON files. Installed by `src/main.tsx` only when Electron's own preload-provided `window.api` isn't already there, so it's a no-op inside the desktop app.
- `src/` — React renderer (card browser, deck panel, wishlist panel, export/import/sample-hand/ban-list modals). State lives in one zustand store (`src/state/useAppStore.ts`); deck edits apply to it immediately and are saved in the background, which is also what makes undo cheap. This is shared between the desktop and phone builds — see "The phone app" above.

Adding a new game means writing one adapter file implementing `GameAdapter` (fetch + normalize cards, deck zone rules, decklist text formatter) and registering it in `src/shared/games/registry.ts` (the game-id lists used by settings and backups are derived from the registry). A game whose deck shape depends on the format (Magic's Commander vs 60-card formats) sets `deckRulesByFormat`; read rules through `rulesForFormat()`. Optional hooks: `copyLimitFor` (basic lands/Energy, "any number of" cards), `identityColorFilter`, `importOptions`, and zones can be `manualOnly` so a plain click never lands there.

## Daily data (deploy-pwa.yml)

The phone app's deploy also runs daily, and publishes next to the app: TCGplayer prices and exchange rates (`scripts/build-prices.ts`), Community lists (`scripts/build-community-lists.ts`), ban lists (`scripts/build-ban-lists.ts`), and the announcement (`public/announcement.json`, `scripts/send-announcement.sh`). Then it checks every outside source (`scripts/check-sources.ts`), see [DATA-SOURCES.md](DATA-SOURCES.md).
