# Beef's Brewhouse

(Formerly *Deckbuilder*. Downloads, the update feed and the app's data folder keep the old `Deckbuilder` name, so existing links, installs and saved decks are untouched.)

A deckbuilder for **Riftbound, One Piece, Pokémon, Magic: The Gathering and Yu-Gi-Oh!**, on your computer and your phone. Build decks with every card's picture, check they're legal, track the cards you own and want, and see what's winning.

## Highlights

- **Every card, offline**: each game's full card database with images, synced from free community sources and kept on your device.
- **Legality as you build**: copy limits, deck sizes, colours and each format's ban list, which updates itself, with a notice when a new list affects your decks.
- **Your collection**: what you own, what each deck still needs, the cheapest way to finish it (a TCGplayer-ready buy list), spares for trade, and your collection's value over time.
- **What's winning**: recent tournament lists for Riftbound, One Piece and Pokémon, how your deck compares, and suggestions from the lists most like it.
- **Practice**: deal hands, mulligan, play turns out with each game's resources, and see the exact odds of drawing what you need.
- **Ctrl+K**: one search box for your decks, cards and everything the app does.
- **Bring decks in and out**: paste a list, a deck code or a link from the big deck sites; export text, an image, a QR code or a share link; print proxies at true size.
- **Desktop and phone, in sync**: the same app on both, synced with a free account. The phone app installs from the browser.
- **English, Spanish and Portuguese**, eight themes, keyboard shortcuts, and screen-reader support.

The full list is in **[docs/FEATURES.md](docs/FEATURES.md)**.

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

## Phone app

**Live right now:** https://beeftcg-eng.github.io/deckbuilder/ — open it in your phone's browser and **Add to Home Screen** (Safari: Share → Add to Home Screen; Chrome/Android: menu → Add to Home Screen / Install app) for a real home-screen icon that opens full-screen, no app store needed. This is a PWA (Progressive Web App), not an `.apk` — the same reasoning as Pawmodoro's own phone app applies: an APK can't install on an iPhone at all (an Apple platform restriction), so the actual cross-platform answer is a PWA, and the same link works the same way on Android and iPhone both.

Decks, collection and wishlist sync between your computer and phone once you log in with the same account on both.

## Backups and moving to a new machine

Your decks, wishlist and collection live outside this repo, in the app's user data directory (see "Where your data lives" below) — so a fresh `git clone` alone won't bring them along.

**Automatic snapshots:** on every launch, and before an edit if the last snapshot is over 30 minutes old, the app copies your decks/wishlist/collection into a `backups/` folder inside the data directory (newest 15 kept; a snapshot identical to the previous one is skipped). Restoring one is **Restore…** in the sidebar — the file picker opens in that folder — and **Open auto-backups folder** shows it in your file manager. A restore first saves what it's about to overwrite as a `pre-restore-…` snapshot, so a wrong restore can be reversed.

**Saves are crash-safe:** files are written to a temp file and renamed into place, and if a data file ever can't be parsed it's set aside as `<name>.corrupt-<timestamp>` rather than being overwritten by the next save.

To move to a new machine:

1. Clone this repo and install/build it (see [docs/DEVELOPING.md](docs/DEVELOPING.md)):
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

Inside: `decks.json`, `wishlist.json` and `collection.json` (your real data — what **Backup…**/**Restore…** and the automatic snapshots cover), `backups/` (the automatic snapshots), `settings.json` (last deck/game, deck sort), `cards/` and `formats.json` (downloaded API data and your ban list — `cards/` is safe to lose, regenerated by "Sync card data"; `formats.json` holds any ban-list edits you've made), and `pawmodoro-sync.json` (your Pawmodoro login, if connected — deliberately excluded from backups; just reconnect on the new machine instead) and `pairings-account.json` (your Pairings login, same treatment).

## More

- [docs/FEATURES.md](docs/FEATURES.md): every feature in detail.
- [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md): where cards, prices, lists and ban lists come from, and how ban lists are kept up to date.
- [docs/DEVELOPING.md](docs/DEVELOPING.md): running it from source, tests, releases, building installers, architecture.

## License

MIT, see [LICENSE](LICENSE). It covers this project's code only: card names, images, text and other game data belong to their owners (Riot Games, Bandai, The Pokémon Company, Wizards of the Coast, Konami and others), including the card images in `public/card-art/`. Beef's Brewhouse is a fan project, not affiliated with or endorsed by any of them.
