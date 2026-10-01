# Flatpak

Beef's Brewhouse as a Flatpak (`io.github.beeftcg_eng.deckbuilder`), built from source the way Flathub
requires: offline, with every npm package and the Electron download listed in `generated-sources.json`.

## Build and run it locally

Needs `org.flatpak.Builder` (`flatpak install --user flathub org.flatpak.Builder`).

```sh
cd flatpak
flatpak run org.flatpak.Builder --user --install-deps-from=flathub --force-clean \
  --repo=repo --state-dir=.flatpak-builder --install build-dir io.github.beeftcg_eng.deckbuilder.yml
flatpak run io.github.beeftcg_eng.deckbuilder
```

Lint before submitting:

```sh
flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest io.github.beeftcg_eng.deckbuilder.yml
flatpak run --command=flatpak-builder-lint org.flatpak.Builder repo repo
```

## When package-lock.json changes

Regenerate the sources ([flatpak-node-generator](https://github.com/flatpak/flatpak-builder-tools/tree/master/node)):

```sh
flatpak-node-generator npm package-lock.json -o flatpak/generated-sources.json
```

## Notes

- The Flatpak keeps its data in `~/.var/app/io.github.beeftcg_eng.deckbuilder/`, not `~/.config/deckbuilder`;
  move a collection over with a backup and **Restore…**.
- Flatpak updates the app, so the built-in updater is switched off (`DECKBUILDER_DISABLE_UPDATES`).
- The window's Wayland app id comes from `desktopName`, which the build sets to the Flatpak id.
- For Flathub, the manifest's `dir` source becomes a `git` source pinned to a release tag and commit.
