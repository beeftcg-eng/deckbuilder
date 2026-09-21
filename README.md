# Deckbuilder

A desktop deckbuilder for Riftbound, One Piece Card Game, Pokémon TCG, and Magic: The Gathering — with card images, legality checking, and export.

## Features

- **Card database** synced from each game's community API (see Data sources below), cached locally so you can browse and build offline after the first sync.
- **Deckbuilding** with per-game zones (e.g. Leader + Main for One Piece; Legend + Main + Runes + Battlefields + Sideboard for Riftbound; a single 60-card deck for Pokémon; Main Deck + Sideboard for Magic's 60-card formats, or Commander + a 99-card Main Deck for Commander), enforced copy limits, and color/domain lock.
- **Legality checking** against each game's format rules (Pokémon Standard/Expanded/Unlimited via the official per-card legality data; Magic (Standard, Pioneer, Modern, Legacy, Vintage, Pauper, Commander) via Scryfall's per-card legality data, including Vintage's restricted list and Commander's singleton rule and color identity; One Piece and Riftbound via an editable local ban list — see below).
- **Collection tracking**: mark how many copies of each card you own (the **Own** stepper on every card, or **✓ I own this deck** / **✓ Got it** on the wishlist). Decks then show what you're still missing (`own 1/4`), the browser can filter to **Owned** cards, and **☆ Wishlist missing** adds only the cards you neither own nor have already wishlisted. Owning any printing of a card counts (by name for Riftbound/Pokémon; by card number for One Piece, matching each game's copy-limit rule).
- **Card wishlist**: star any card (or a whole deck at once, via the "Wishlist deck" button) to track cards you still need, across all three games. Optionally connect a [Pawmodoro](https://github.com/beeftcg-eng/pawmodoro) account to push unpushed wishlist cards straight into its checklist, in their own section separate from your regular tasks. It's pre-connected to the shared Pawmodoro project — just enter an email and password (**Create account** the first time, or the same login you use in Pawmodoro).
- **Deck tools**: import a decklist from pasted text (a line that gives only a card's name gets the printing you own, else one that's legal in the chosen format, else the regular one over alternate art / a promo, else the lowest rarity — never just whichever the card data lists first) (this app's own export, or common community formats such as `4xOP01-006` / `4 Professor's Research SVI 189`), duplicate a deck, sort/filter the deck list, multi-level **undo** (Ctrl+Z, or the button in the sidebar) for card changes, deck deletes and creations, a cost curve / type / color breakdown, and a **Sample hand** simulator (draw an opening hand, mulligan, draw more).
- **Prices**: One Piece (optcgapi `market_price`) and Pokémon (TCGplayer market price via pokemontcg.io) and Magic (Scryfall's USD price) cards show a market price, with deck value and "to buy" totals. Riftbound's API has no prices. Cards cached before prices were added need one **Update card data** to pick them up.
- **Ban list editor**: for One Piece and Riftbound, *Edit ban list…* under the legality panel edits banned cards, restricted cards, banned pairs and the legal-set rotation in the app, and records when the list was last reviewed (it turns amber after 60 days).
- **Full-screen deck view**: **⛶ Full view** on any deck opens the whole deck filling the window, as **Grid** (card images with ×N badges, a card-size slider, grouped by card type), **List** (compact rows with cost, type and price) or **Text** (the plain decklist in columns, with **Copy list**). Click any card for its details; **⛶ Full screen** hands the window to the OS's real full screen, and Esc backs out one layer at a time. Your last-used view is remembered.
- **Themes**: eight colour themes (Midnight, Graphite & Amber, Forest, Royal Purple, Crimson, Ocean, Light, Parchment) from the picker at the top of the sidebar. The choice is remembered, applied before the window paints (no flash of the default), and every palette is checked for readable contrast in the tests.
- **Deck icons**: each deck in the sidebar (and its panel header) shows a thumbnail of a card so you can tell decks apart at a glance. It defaults to the deck's Leader / Legend / Commander, or else its first card that isn't a basic land or Energy, so decks you built earlier get one without any work. Click the **🖼** button on any card in the deck to pick a different one (click it again to go back to the automatic choice; Ctrl+Z undoes it).
- **Collection view**: **▦ Collection** in the sidebar shows what you own for the game you're browsing (search, sort by name / set / copies / value, +/− to adjust) and a **Sets & expansions** tab with your progress in every set. **Add missing** tops you up to owning at least 1–4 of each card in a set (running it twice never overshoots) after a confirmation, and **☆ Wishlist** adds the set's cards you don't own to the wishlist. For Magic a set holds only the cards Scryfall currently shows from it (its data is one printing per card).
- **Export**: decks and the wishlist can each be copied to the clipboard as plain text, saved as `.txt`, uploaded for a shareable paste link (via [dpaste.com](https://dpaste.com), no account needed), or rendered as a `.png` image with full-size, legible card thumbnails.

## Running it

Requires Node.js 20+.

```bash
npm install
npm run dev
```

This starts the Vite dev server and launches the Electron window.

Other scripts: `npm test` (unit tests for the importer, legality/collection math, atomic saves and backups), `npm run typecheck`, `npm run lint`.

## Installing and updating

Installers live in the public downloads repo, **[beeftcg-eng/deckbuilder-releases](https://github.com/beeftcg-eng/deckbuilder-releases/releases/latest)** (this source repo is private):

- **Windows:** `Deckbuilder-Setup.exe` — always at <https://github.com/beeftcg-eng/deckbuilder-releases/releases/latest/download/Deckbuilder-Setup.exe>. From PowerShell:
  ```powershell
  $f = Join-Path $env:TEMP 'Deckbuilder-Setup.exe'; $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest 'https://github.com/beeftcg-eng/deckbuilder-releases/releases/latest/download/Deckbuilder-Setup.exe' -OutFile $f
  Start-Process $f -Wait
  ```
- **Linux:** `Deckbuilder.AppImage` from the same release (`chmod +x` it and run).

**The app updates itself.** A few seconds after launch (and every 6 hours while it stays open) the installed app checks that repo's latest release; a newer version downloads in the background and a banner offers **Restart & update** (or **Later** — it installs when you next close the app). The sidebar shows the version and a **Check for updates** link. Updates only apply to the installed app: not `npm run dev`, and on Linux only the AppImage. Set `DECKBUILDER_DISABLE_UPDATES=1` to turn it off. Installs of 0.6.0 or older have no updater and need this one manual install.

**Publishing a release** (maintainers): bump the version in `package.json`, commit and push, push a `v*` tag (or run the *Build Windows installer* workflow) and wait for it to succeed, then run `scripts/publish-release.sh [notes-file]`. It fetches the Windows build, builds the AppImage, checks both update manifests match the version, and creates the release in the downloads repo. The manifests (`latest.yml`, `latest-linux.yml`) are what installed copies read, so a release without them can't update anyone.

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
5. If you use Cloud Sync with Pawmodoro, reconnect it from the Wishlist panel with your usual email and password (the Project URL / anon key are built in unless you chose **Use a different project**) — that login isn't part of the backup file on purpose (see below).

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
| Pokémon TCG | [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) (cards, one file per set on GitHub) + [pokemontcg.io](https://pokemontcg.io) (prices only) |
| One Piece Card Game | [optcgapi.com](https://optcgapi.com) |
| Riftbound | [riftcodex.com](https://riftcodex.com) (unofficial fan project, not affiliated with Riot Games) |
| Magic: The Gathering | [Scryfall](https://scryfall.com) bulk data ("Oracle Cards") |

All four are free APIs with no login required. Click "Sync card data" in the sidebar for each game the first time you use it — Pokémon has ~20k cards and takes about a minute; the others are quick.

**Pokémon** takes its cards from the community's static dataset, which is fast and reliable, and asks the pokemontcg.io API only for prices. That API is slow (7–28 s a page) and answers 500 at random, so it gets a 45-second budget with retries and whatever it returns is used; cards it couldn't price keep the price a previous sync found, so prices fill in over repeated syncs. (Syncing straight from that API used to fail on its first hiccup and save nothing.)

**Magic** downloads Scryfall's daily *Oracle Cards* file (~25 MB compressed, ~32k cards, about 10 seconds), with one entry per unique card — decks are limited and matched by card name, so a single printing per card is all a deckbuilder needs. Things to know:
- The image, set and price are those of the printing Scryfall shows for the card; some printings have no price (Sol Ring's shows none), so a deck's value can under-count. Saved decks, collection and wishlist entries are keyed by Scryfall's stable card id, not by printing, so they keep pointing at the right card when that printing changes on a later sync.
- Cards no supported format can ever play (Un-sets, digital-only Alchemy, Planechase/Archenemy, tokens, sticker sheets) are left out, except cards legal in the upcoming Standard.
- **Commander** has a guided first step (*Pick your Commander*: legendary creatures and cards that say they can be your commander). A second commander (Partner) and the sideboard are filled with the **→ Commander / → Sideboard** buttons on each deck entry, which move one copy between zones. Legendary Vehicles/Spacecraft and Backgrounds aren't recognised as commanders yet, and Partner pairing isn't checked (only that there are at most two).
- While a Commander deck has no commander yet, the browser shows only possible commanders, with a **Commanders only** switch in the banner to browse every card.
- **Import** understands Arena, MTGO, Moxfield and Archidekt lists: `Deck` / `Sideboard` / `Commander` headings, `SB:` lines, a blank line before the sideboard, set/collector suffixes like `(2XM) 141`, foil markers and tags, and double-faced cards by front face only. A list with a `Commander` heading imports as Commander; otherwise pick the format first.
- **Export** writes `Commander` / `Deck` / `Sideboard` sections (`4 Lightning Bolt`), which those sites and Arena import directly.
- Scryfall asks apps to identify themselves and rejects Node's default `User-Agent` (with a 400), so card sync and the deck-image export send `Deckbuilder/1.0`.

**One Piece printings:** the API sometimes gives a card's regular version, reprints, foils and alternate arts the same id, which used to make a deck slot resolve to whichever came last (usually an alternate art) no matter which tile you clicked. Card ids are now made unique from each printing's image file (`shared/cardIds.ts`, applied on every sync and whenever the cache is read, so an older cache fixes itself without re-syncing). Ids that were already unique are untouched, and an id that used to be shared now means the regular printing, so existing decks, collection and wishlist entries keep working.

One Piece's starter/structure decks (`ST-01`, `ST-02`, ...) live under a separate endpoint (`/api/allSTCards/`) from numbered `OP-`/`EB-`/`PRB-` sets, fetched alongside them on sync. Promo cards and DON!! cards have their own endpoints too (`/api/allPromoCards/`, `/api/allDonCards/`) but aren't pulled in yet.

## Format / ban list data

Pokémon and Magic get legality from their card data; One Piece and Riftbound don't have an API that exposes official legality, so their ban lists are shipped as a snapshot (see `src/shared/games/onepiece.ts` / `riftbound.ts`) and copied on first launch to an editable JSON file in your user data directory (typically `~/.config/deckbuilder/formats.json` on Linux — see "Where your data lives" above). Use **Edit ban list…** in the app when Bandai/Riot update their list (or edit that file directly and restart) — legality checks pick up the change immediately. The panel shows when the list was last reviewed, so you can tell when it's due for a look. Pokémon legality always comes straight from the API and needs no maintenance.

## Architecture notes

- `src/shared/` — game-agnostic types, per-game adapters (`games/*.ts`), the legality checker, and export formatting. Shared between the Electron main process and the React renderer.
- `electron/` — main process: IPC handlers for card sync/caching, deck persistence, format storage, the wishlist, the collection, settings, Pawmodoro Cloud Sync, backup/restore, and export (paste upload, save-file dialog). `electron/lib/` holds the shared plumbing: `jsonStore.ts` (atomic writes, corrupt-file handling, the per-file save queue) and `backups.ts` (rotating snapshots).
- `src/` — React renderer (card browser, deck panel, wishlist panel, export/import/sample-hand/ban-list modals). State lives in one zustand store (`src/state/useAppStore.ts`); deck edits apply to it immediately and are saved in the background, which is also what makes undo cheap.

Adding a new game means writing one adapter file implementing `GameAdapter` (fetch + normalize cards, deck zone rules, decklist text formatter) and registering it in `src/shared/games/registry.ts` (the game-id lists used by settings and backups are derived from the registry). A game whose deck shape depends on the format (Magic's Commander vs 60-card formats) sets `deckRulesByFormat`; read rules through `rulesForFormat()`. Optional hooks: `copyLimitFor` (basic lands/Energy, "any number of" cards), `identityColorFilter`, `importOptions`, and zones can be `manualOnly` so a plain click never lands there.
