# Deckbuilder

A desktop deckbuilder for Riftbound, One Piece Card Game, and Pokémon TCG — with card images, legality checking, and export.

## Features

- **Card database** synced from each game's community API (see Data sources below), cached locally so you can browse and build offline after the first sync.
- **Deckbuilding** with per-game zones (e.g. Leader + Main for One Piece; Legend + Main + Runes + Battlefields + Sideboard for Riftbound; a single 60-card deck for Pokémon), enforced copy limits, and color/domain lock.
- **Legality checking** against each game's format rules (Pokémon Standard/Expanded/Unlimited via the official per-card legality data; One Piece and Riftbound via an editable local ban list — see below).
- **Export**: copy a plain-text decklist to the clipboard, save it as a `.txt` file, or upload it to get a shareable paste link (via [dpaste.com](https://dpaste.com), no account needed).

## Running it

Requires Node.js 20+.

```bash
npm install
npm run dev
```

This starts the Vite dev server and launches the Electron window.

## Building an installer

```bash
npm run build
```

Produces an AppImage (Linux), NSIS installer (Windows), or dmg (macOS, when built on a Mac) in `release/`.

## Data sources

| Game | Source |
|---|---|
| Pokémon TCG | [pokemontcg.io](https://pokemontcg.io) |
| One Piece Card Game | [optcgapi.com](https://optcgapi.com) |
| Riftbound | [riftcodex.com](https://riftcodex.com) (unofficial fan project, not affiliated with Riot Games) |

All three are free community APIs with no login required. Click "Sync card data" in the sidebar for each game the first time you use it — Pokémon has ~20k cards and can take a couple of minutes; the others are quick.

## Format / ban list data

One Piece and Riftbound don't have an API that exposes official legality, so their ban lists are shipped as a snapshot (see `src/shared/games/onepiece.ts` / `riftbound.ts`) and copied on first launch to an editable JSON file in your user data directory (shown via the app, typically `~/.config/Deckbuilder/formats.json` on Linux). Edit that file directly if Bandai/Riot update their ban list and you want the checker to reflect it — the app will pick up your edits on next launch. Pokémon legality always comes straight from the API and needs no maintenance.

## Architecture notes

- `src/shared/` — game-agnostic types, per-game adapters (`games/*.ts`), the legality checker, and export formatting. Shared between the Electron main process and the React renderer.
- `electron/` — main process: IPC handlers for card sync/caching, deck persistence, format storage, and export (paste upload, save-file dialog).
- `src/` — React renderer (card browser, deck panel, export modal).

Adding a new game means writing one adapter file implementing `GameAdapter` (fetch + normalize cards, deck zone rules, decklist text formatter) and registering it in `src/shared/games/registry.ts`.
