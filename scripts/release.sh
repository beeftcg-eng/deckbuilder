#!/usr/bin/env bash
# One command from "the work is committed" to a published release:
#
#   scripts/release.sh <release-notes.md> [patch|minor|major|beta]     (default: minor)
#
# beta: a test version for early access (0.60.0-beta.0, then -beta.1...), published as a GitHub
# pre-release that only copies with Early access ticked take. The next minor release finishes it.
#
# Bumps the version, commits "vX.Y.Z: <the notes' first line>", tags it, pushes master and the tag
# (which starts the "Build Windows installer" workflow), waits for that build, then runs
# scripts/publish-release.sh with the notes. Pushing master also deploys the phone app.
#
# RELEASE_TRAILER, when set, is added to the version commit (e.g. a Co-Authored-By line).
#
# If the Windows build fails, it stops there: nothing is published, and the tag stays. Fix the
# problem, commit, and release again (a patch), the way v0.50.0 -> v0.50.1 went.
set -euo pipefail
cd "$(dirname "$0")/.."

NOTES="${1:-}"
BUMP="${2:-minor}"
[ -n "$NOTES" ] && [ -f "$NOTES" ] || { sed -n '4p' "$0" | sed 's/^#   //' >&2; exit 1; }
case "$BUMP" in patch|minor|major|beta) ;; *) echo "The bump is patch, minor, major or beta, not '$BUMP'." >&2; exit 1 ;; esac
[ "$(git rev-parse --abbrev-ref HEAD)" = master ] || { echo "Switch to master first." >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Working tree isn't clean; commit the work first." >&2; exit 1; }

echo "Checking (types, lint, tests)..."
npx tsc -b
npx oxlint >/dev/null
npx vitest run >/dev/null

if [ "$BUMP" = beta ]; then
  # 0.59.0 -> 0.60.0-beta.0, then 0.60.0-beta.1...
  if node -p "require('./package.json').version" | grep -q -- '-beta\.'; then npm version prerelease --preid beta --no-git-tag-version >/dev/null
  else npm version preminor --preid beta --no-git-tag-version >/dev/null; fi
else
  npm version "$BUMP" --no-git-tag-version >/dev/null
fi
VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"
TITLE="$(grep -m1 . "$NOTES" | sed -E 's/\*\*//g; s/^#+ *//')"
git add package.json package-lock.json
git commit -q -m "$TAG: $TITLE" ${RELEASE_TRAILER:+-m "$RELEASE_TRAILER"}
git tag "$TAG"
git push -q origin master
git push -q origin "$TAG"
echo "Pushed $TAG. Waiting for its Windows build..."

RUN_ID=""
for _ in $(seq 1 30); do
  RUN_ID="$(gh run list --workflow build-windows.yml --json databaseId,headBranch --jq "[.[] | select(.headBranch == \"$TAG\")][0].databaseId // empty")"
  [ -n "$RUN_ID" ] && break
  sleep 10
done
[ -n "$RUN_ID" ] || { echo "No Windows build started for $TAG. Run the workflow by hand, then scripts/publish-release.sh $NOTES." >&2; exit 1; }
if ! gh run watch "$RUN_ID" --exit-status >/dev/null; then
  echo "The Windows build failed: $(gh run view "$RUN_ID" --json url --jq .url)" >&2
  echo "Nothing was published. Fix it, commit, and run this again with 'patch'." >&2
  exit 1
fi

scripts/publish-release.sh "$NOTES"
