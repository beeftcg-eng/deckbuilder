#!/usr/bin/env bash
# Publishes the current version to the public downloads repo (beeftcg-eng/deckbuilder-releases):
# the Windows installer built by GitHub Actions, a Linux AppImage built here, and the two update
# manifests (latest.yml / latest-linux.yml) that installed copies read to update themselves.
#
#   scripts/publish-release.sh [release-notes-file]
#
# Run it from a clean checkout whose HEAD is pushed, after the "Build Windows installer"
# workflow has succeeded for that commit (push a v* tag, or Actions -> Run workflow).
set -euo pipefail

REPO="${RELEASES_REPO:-beeftcg-eng/deckbuilder-releases}"
NOTES_FILE="${1:-}"
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"
SHA="$(git rev-parse HEAD)"

[ -z "$(git status --porcelain)" ] || { echo "Working tree isn't clean; commit or stash first." >&2; exit 1; }
git fetch -q origin
git branch -r --contains "$SHA" | grep -q . || { echo "HEAD ($SHA) isn't pushed yet." >&2; exit 1; }
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then echo "$REPO already has a $TAG release." >&2; exit 1; fi

echo "Publishing Deckbuilder $VERSION ($SHA) to $REPO"

RUN_ID="$(gh run list --workflow build-windows.yml --json databaseId,headSha,conclusion \
  --jq "[.[] | select(.headSha == \"$SHA\" and .conclusion == \"success\")][0].databaseId // empty")"
[ -n "$RUN_ID" ] || { echo "No successful 'Build Windows installer' run for $SHA. Push the $TAG tag or run the workflow, wait for it, then retry." >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/win" "$WORK/linux"

echo "Downloading the Windows build (run $RUN_ID)..."
gh run download "$RUN_ID" -n Deckbuilder-Setup -D "$WORK/win"

echo "Building the Linux AppImage..."
npx tsc -b
npx vitest run
npx vite build
npx electron-builder --linux --publish never --config.directories.output="$WORK/linux"

for f in "$WORK/win/Deckbuilder-Setup.exe" "$WORK/win/latest.yml" "$WORK/win/Deckbuilder-Setup.exe.blockmap" \
         "$WORK/linux/Deckbuilder.AppImage" "$WORK/linux/latest-linux.yml"; do
  [ -f "$f" ] || { echo "Missing expected file: $f" >&2; exit 1; }
done
# The manifests must describe this version, or installed copies would be offered the wrong one.
for m in "$WORK/win/latest.yml" "$WORK/linux/latest-linux.yml"; do
  grep -q "^version: $VERSION\$" "$m" || { echo "$m isn't for version $VERSION" >&2; exit 1; }
done

ARGS=(--repo "$REPO" --title "Deckbuilder $VERSION" --latest)
if [ -n "$NOTES_FILE" ]; then ARGS+=(--notes-file "$NOTES_FILE"); else ARGS+=(--notes "Deckbuilder $VERSION"); fi

gh release create "$TAG" "${ARGS[@]}" \
  "$WORK/win/Deckbuilder-Setup.exe" "$WORK/win/latest.yml" "$WORK/win/Deckbuilder-Setup.exe.blockmap" \
  "$WORK/linux/Deckbuilder.AppImage" "$WORK/linux/latest-linux.yml"

echo "Done: https://github.com/$REPO/releases/tag/$TAG"
