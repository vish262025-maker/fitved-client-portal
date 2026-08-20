#!/usr/bin/env bash
# Rebuild the Society Yoga Poll (Next.js) micro-app and embed it into the main
# FitVed site under public/societies/. Run this whenever the polls app changes.
#
# The polls app lives OUTSIDE this repo. Point POLLS_DIR at it if it moves.
set -euo pipefail

POLLS_DIR="${POLLS_DIR:-/Users/harshsaini/Desktop/New project/Society Poles}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/societies"

echo "▸ Building polls app in: $POLLS_DIR"
cd "$POLLS_DIR"
rm -rf out .next
npm run build

echo "▸ Copying static export → $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R out/. "$DEST"/

# The app requests society photos at /societies/<slug>.jpg, but the export nests
# the public/societies/ folder one level deeper. Flatten those up, then drop the
# now-redundant nested folder so public/societies/ stays clean.
if [ -d "$DEST/societies" ]; then
  cp "$DEST"/societies/*.jpg "$DEST"/ 2>/dev/null || true
  rm -rf "$DEST/societies"
fi

# Prune files the statically-served export doesn't need, so public/societies/
# stays lean (no repeating content, no dead template assets):
#   • *.txt        — Next.js RSC soft-navigation payloads. Each duplicates its
#                    page's HTML (index.txt == __next._full.txt, etc.). Direct
#                    page loads use index.html; internal <Link> clicks fall back
#                    to a full-page navigation when the payload is absent.
#   • starter SVGs — file/globe/next/vercel/window.svg are unused Next.js
#                    template leftovers (icon.svg is the favicon — kept).
find "$DEST" -type f -name "*.txt" -delete
rm -f "$DEST"/file.svg "$DEST"/globe.svg "$DEST"/next.svg "$DEST"/vercel.svg "$DEST"/window.svg

echo "✓ Societies embedded (pruned $(find "$DEST" -type f | wc -l | tr -d ' ') files). Commit public/societies/ and deploy."
