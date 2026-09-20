# Deckbuilder

A desktop deckbuilder for Riftbound, One Piece Card Game, and Pokémon TCG — with card images, legality checking, and export.

## Features

- **Card database** synced from each game's community API (see Data sources below), cached locally so you can browse and build offline after the first sync.
- **Deckbuilding** with per-game zones (e.g. Leader + Main for One Piece; Legend + Main + Runes + Battlefields + Sideboard for Riftbound; a single 60-card deck for Pokémon), enforced copy limits, and color/domain lock.
- **Legality checking** against each game's format rules (Pokémon Standard/Expanded/Unlimited via the official per-card legality data; One Piece and Riftbound via an editable local ban list — see below).
- **Collection tracking**: mark how many copies of each card you own (the **Own** stepper on every card, or **✓ I own this deck** / **✓ Got it** on the wishlist). Decks then show what you're still missing (`own 1/4`), the browser can filter to **Owned** cards, and **☆ Wishlist missing** adds only the cards you neither own nor have already wishlisted. Owning any printing of a card counts (by name for Riftbound/Pokémon; by card number for One Piece, matching each game's copy-limit rule).
- **Card wishlist**: star any card (or a whole deck at once, via the "Wishlist deck" button) to track cards you still need, across all three games. Optionally connect a [Pawmodoro](https://github.com/beeftcg-eng/pawmodoro) account to push unpushed wishlist cards straight into its checklist, in their own section separate from your regular tasks.
- **Deck tools**: import a decklist from pasted text (this app's own export, or common community formats such as `4xOP01-006` / `4 Professor's Research SVI 189`), duplicate a deck, sort/filter the deck list, multi-level **undo** (Ctrl+Z, or the button in the sidebar) for card changes, deck deletes and creations, a cost curve / type / color breakdown, and a **Sample hand** simulator (draw an opening hand, mulligan, draw more).
- **Prices**: One Piece (optcgapi `market_price`) and Pokémon (TCGplayer market price via pokemontcg.io) cards show a market price, with deck value and "to buy" totals. Riftbound's API has no prices. Cards cached before prices were added need one **Update card data** to pick them up.
- **Ban list editor**: for One Piece and Riftbound, *Edit ban list…* under the legality panel edits banned cards, restricted cards, banned pairs and the legal-set rotation in the app, and records when the list was last reviewed (it turns amber after 60 days).
- **Export**: decks and the wishlist can each be copied to the clipboard as plain text, saved as `.txt`, uploaded for a shareable paste link (via [dpaste.com](https://dpaste.com), no account needed), or rendered as a `.png` image with full-size, legible card thumbnails.

## Running it

Requires Node.js 20+.

```bash
npm install
npm run dev
```

This starts the Vite dev server and launches the Electron window.

Other scripts: `npm test` (unit tests for the importer, legality/collection math, atomic saves and backups), `npm run typecheck`, `npm run lint`.

## Building an installer

```bash
npm run build
```

Type-checks, runs the tests, then produces an AppImage (Linux), NSIS installer (Windows), or dmg (macOS, when built on a Mac) in `release/`. The Linux AppImage is always named `Deckbuilder.AppImage` (no version in the file name), so a desktop launcher pointing at `release/Deckbuilder.AppImage` keeps working across updates — just rebuild.

## Backups and moving to a new machine

Your decks, wishlist and collection live outside this repo, in the app's user data directory (see "Where your data lives" below) — so a fresh `git clone` alone won't bring them along.

**Automatic snapshots:** on every launch, and before an edit if the last snapshot is over 30 minutes old, the app copies your decks/wishlist/collection into a `backups/` folder inside the data directory (newest 15 kept; a snapshot identical to the previous one is skipped). Restoring one is **Restore…** in the sidebar — the file picker opens in that folder — and **Open auto-backups folder** shows it in your file manager. A restore first saves what it's about to overwrite as a `pre-restore-…` snapshot, so a wrong restore can be reversed.

**Saves are crash-safe:** files are written to a temp file and renamed into place, and if a data file ever can't be parsed it's set aside as `<name>.corrupt-<timestamp>` rather than being overwritten by the next save.

To move to a new machine:

1. Clone this repo and install/build as above:
   ```bash
   git clone https://github.com/beeftcg-eng/deckbuilder.git
   cd deckbuilder
   npm install
   npm run build   # or `npm run dev` to just try it first
   ```
2. Launch the app once (`npm run dev`, or the built AppImage from `release/`) so its user data directory gets created.
3. In the sidebar, click **Restore…** and pick a backup file — either one you made with **Backup…** on the old machine, one from the old machine's `backups/` folder, or [`backup/deckbuilder-backup.json`](backup/deckbuilder-backup.json) in this repo (a manual snapshot, refreshed occasionally — it can be behind).
4. Click **Sync card data** for each game you use — the card database itself isn't backed up (it's just downloaded API data, and re-syncing is quick).
5. If you use Cloud Sync with Pawmodoro, reconnect it from the Wishlist panel with your usual Project URL / anon key / email / password — that login isn't part of the backup file on purpose (see below).

### Where your data lives

| Platform | Path |
|---|---|
| Linux | `~/.config/deckbuilder/` |
| Windows | `%APPDATA%\deckbuilder\` |
| macOS | `~/Library/Application Support/deckbuilder/` |

Inside: `decks.json`, `wishlist.json` and `collection.json` (your real data — what **Backup…**/**Restore…** and the automatic snapshots cover), `backups/` (the automatic snapshots), `settings.json` (last deck/game, deck sort), `cards/` and `formats.json` (downloaded API data and your ban list — `cards/` is safe to lose, regenerated by "Sync card data"; `formats.json` holds any ban-list edits you've made), and `pawmodoro-sync.json` (your Pawmodoro login, if connected — deliberately excluded from backups; just reconnect on the new machine instead).

## Data sources

| Game | Source |
|---|---|
| Pokémon TCG | [pokemontcg.io](https://pokemontcg.io) |
| One Piece Card Game | [optcgapi.com](https://optcgapi.com) |
| Riftbound | [riftcodex.com](https://riftcodex.com) (unofficial fan project, not affiliated with Riot Games) |

All three are free community APIs with no login required. Click "Sync card data" in the sidebar for each game the first time you use it — Pokémon has ~20k cards and can take a couple of minutes; the others are quick.

One Piece's starter/structure decks (`ST-01`, `ST-02`, ...) live under a separate endpoint (`/api/allSTCards/`) from numbered `OP-`/`EB-`/`PRB-` sets, fetched alongside them on sync. Promo cards and DON!! cards have their own endpoints too (`/api/allPromoCards/`, `/api/allDonCards/`) but aren't pulled in yet.

## Format / ban list data

One Piece and Riftbound don't have an API that exposes official legality, so their ban lists are shipped as a snapshot (see `src/shared/games/onepiece.ts` / `riftbound.ts`) and copied on first launch to an editable JSON file in your user data directory (typically `~/.config/deckbuilder/formats.json` on Linux — see "Where your data lives" above). Use **Edit ban list…** in the app when Bandai/Riot update their list (or edit that file directly and restart) — legality checks pick up the change immediately. The panel shows when the list was last reviewed, so you can tell when it's due for a look. Pokémon legality always comes straight from the API and needs no maintenance.

## Architecture notes

- `src/shared/` — game-agnostic types, per-game adapters (`games/*.ts`), the legality checker, and export formatting. Shared between the Electron main process and the React renderer.
- `electron/` — main process: IPC handlers for card sync/caching, deck persistence, format storage, the wishlist, the collection, settings, Pawmodoro Cloud Sync, backup/restore, and export (paste upload, save-file dialog). `electron/lib/` holds the shared plumbing: `jsonStore.ts` (atomic writes, corrupt-file handling, the per-file save queue) and `backups.ts` (rotating snapshots).
- `src/` — React renderer (card browser, deck panel, wishlist panel, export/import/sample-hand/ban-list modals). State lives in one zustand store (`src/state/useAppStore.ts`); deck edits apply to it immediately and are saved in the background, which is also what makes undo cheap.

Adding a new game means writing one adapter file implementing `GameAdapter` (fetch + normalize cards, deck zone rules, decklist text formatter) and registering it in `src/shared/games/registry.ts`.
