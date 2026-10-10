#!/usr/bin/env bash
# Sends a message to everyone who uses Brewhouse: writes public/announcement.json, commits just that
# file and pushes it to master, which runs "Deploy PWA to GitHub Pages". A few minutes later every
# app (desktop and phone) shows it once, the next time it opens. See src/shared/announcement.ts.
#
#   scripts/send-announcement.sh "Message" [--title "Title"] [--link https://...] [--until YYYY-MM-DD]
#   scripts/send-announcement.sh --clear        # take the current message down
#
# Write "\n" in the message for a new line. Each run gets a fresh id, so it shows even to people
# who saw an earlier one. --until stops it from showing on and after that date.
set -euo pipefail
cd "$(dirname "$0")/.."

FILE=public/announcement.json
MESSAGE="" TITLE="" LINK="" UNTIL="" CLEAR=0

usage() { sed -n '6,7p' "$0" | sed 's/^#   //' >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --title) TITLE="${2:?--title needs a value}"; shift 2 ;;
    --link) LINK="${2:?--link needs a value}"; shift 2 ;;
    --until) UNTIL="${2:?--until needs a value}"; shift 2 ;;
    --clear) CLEAR=1; shift ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) [ -z "$MESSAGE" ] || { echo "Only one message, please (quote it)." >&2; exit 1; }; MESSAGE="$1"; shift ;;
  esac
done

if [ "$CLEAR" = 1 ]; then
  MESSAGE="" TITLE="" LINK="" UNTIL=""
else
  [ -n "$MESSAGE" ] || usage
  [ -z "$LINK" ] || [[ "$LINK" == https://* ]] || { echo "--link must start with https://" >&2; exit 1; }
  [ -z "$UNTIL" ] || date -d "$UNTIL" >/dev/null 2>&1 || { echo "--until must be a date like 2026-11-01" >&2; exit 1; }
fi

[ "$(git rev-parse --abbrev-ref HEAD)" = master ] || { echo "Switch to master first." >&2; exit 1; }
git pull -q --ff-only origin master

ID="$([ "$CLEAR" = 1 ] && echo "" || date -u +%Y%m%d-%H%M%S)"
MESSAGE="${MESSAGE//\\n/$'\n'}"
ID="$ID" MESSAGE="$MESSAGE" TITLE="$TITLE" LINK="$LINK" UNTIL="$UNTIL" node -e '
  const { ID, MESSAGE, TITLE, LINK, UNTIL } = process.env
  const out = { id: ID, title: TITLE, message: MESSAGE }
  if (LINK) out.link = LINK
  if (UNTIL) out.until = UNTIL
  require("fs").writeFileSync(process.argv[1], JSON.stringify(out, null, 2) + "\n")
' "$FILE"

echo "--- $FILE"
cat "$FILE"
echo "---"
if git diff --quiet -- "$FILE"; then echo "No change to send."; exit 0; fi
read -r -p "Send this to everyone? [y/N] " answer
[[ "$answer" =~ ^[Yy]$ ]] || { git checkout -q -- "$FILE"; echo "Not sent."; exit 1; }

git commit -q -m "$([ "$CLEAR" = 1 ] && echo "Clear announcement" || echo "Announcement: ${TITLE:-${MESSAGE%%$'\n'*}}")" -- "$FILE"
git push -q origin master
echo "Pushed. It's live once the 'Deploy PWA to GitHub Pages' run finishes (gh run watch, or the Actions tab)."
