#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.local/node/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WS="$(cd "$SCRIPT_DIR/.." && pwd)"
HAVEN_AOL="$(cd "$WS/.." && pwd)/haven-aol"

cd "$WS"
PROJECT_CACHE_DIR="$HOME/.cache/projects/$(basename "$PWD")-$(pwd -P | sha1sum | cut -c1-8)"
RUN_DIR="$PROJECT_CACHE_DIR/deps"
mkdir -p "$PROJECT_CACHE_DIR/npm" "$RUN_DIR"

if [ ! -d "$RUN_DIR/node_modules" ] || ! cmp -s "$WS/package.json" "$RUN_DIR/package.json" 2>/dev/null; then
  cp "$WS/package.json" "$RUN_DIR/package.json"
  (cd "$RUN_DIR" && npm install --cache "$PROJECT_CACHE_DIR/npm" --no-audit --no-fund)
fi

ln -sfn "$HAVEN_AOL" "$PROJECT_CACHE_DIR/haven-aol"
ln -sfn "$WS/src" "$RUN_DIR/src"
ln -sfn "$WS/public" "$RUN_DIR/public"
ln -sfn "$WS/index.html" "$RUN_DIR/index.html"
ln -sfn "$WS/tsconfig.json" "$RUN_DIR/tsconfig.json"
ln -sfn "$WS/vite.config.ts" "$RUN_DIR/vite.config.ts"

cd "$RUN_DIR"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}"
MODE="${1:-dev}"
if [ "$MODE" = "build" ]; then
  ./node_modules/.bin/vite build --outDir "$PROJECT_CACHE_DIR/dist" --emptyOutDir
  rm -rf "$WS/dist"
  cp -r "$PROJECT_CACHE_DIR/dist" "$WS/dist"
else
  exec ./node_modules/.bin/vite --host --port "${PORT:-5173}"
fi
