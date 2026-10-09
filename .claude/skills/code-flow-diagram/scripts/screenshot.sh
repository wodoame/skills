#!/usr/bin/env bash
# Screenshots a flow diagram page in light and dark mode, and optionally with one box clicked.
# Usage: screenshot.sh <page.html> <out-dir> [height] [node-id-to-click]
set -euo pipefail

page=$(realpath "$1")
out=$(realpath -m "$2")
height=${3:-1600}
click_id=${4:-}
mkdir -p "$out"

chrome=${CHROME:-}
if [ -z "$chrome" ]; then
  chrome=$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -1 || true)
fi
if [ -z "$chrome" ]; then
  chrome=$(command -v chromium || command -v chromium-browser || command -v google-chrome || command -v google-chrome-stable || true)
fi
if [ -z "$chrome" ]; then
  echo "No Chromium found. Set CHROME=/path/to/chrome, or install one (e.g. npx playwright install chromium)." >&2
  exit 1
fi

name=$(basename "$page" .html)
shoot() {
  # A hung headless run must never block the session, hence the timeout. Don't add --user-data-dir: it can hang.
  timeout 30 "$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --blink-settings=preferredColorScheme="$1" --window-size=1560,"$height" \
    --screenshot="$2" "file://$3" >/dev/null 2>&1 || echo "screenshot failed or timed out: $2" >&2
}

shoot 1 "$out/$name-light.png" "$page"
shoot 0 "$out/$name-dark.png" "$page"

if [ -n "$click_id" ]; then
  # The copy must sit next to the page so its relative flow.css / flow.js links still resolve.
  clicked="$(dirname "$page")/.click-$name.html"
  trap 'rm -f "$clicked"' EXIT
  sed "s#^});\$#}); document.querySelectorAll('.node')[NODES.findIndex(n => n.id === '$click_id')].dispatchEvent(new MouseEvent('click'));#" "$page" > "$clicked"
  shoot 1 "$out/$name-click-$click_id.png" "$clicked"
fi

ls "$out"/"$name"-*.png
