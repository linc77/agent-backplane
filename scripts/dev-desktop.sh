#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

stop_matches() {
  local label="$1"
  shift

  local pattern
  for pattern in "$@"; do
    while IFS= read -r pid; do
      [[ -n "$pid" && "$pid" != "$$" ]] || continue
      local cwd
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
      if [[ -n "$cwd" && "$cwd" != "$repo_root"* ]]; then
        continue
      fi
      echo "Stopping stale ${label}: ${pid}"
      kill "$pid" 2>/dev/null || true
    done < <(pgrep -f "$pattern" || true)
  done
}

stop_matches "installed AMM window" \
  "/Applications/Agent Memory Manager.app/Contents/MacOS/agent-memory-manager"

stop_matches "debug AMM window" \
  "${repo_root}/src-tauri/target/debug/agent-memory-manager" \
  "target/debug/agent-memory-manager" \
  "${repo_root}/src-tauri/target/debug/bundle/macos/Agent Memory Manager.app/Contents/MacOS/agent-memory-manager" \
  "${repo_root}/src-tauri/target/debug/bundle/macos/Agent Memory Manager Dev.app/Contents/MacOS/agent-memory-manager"

stop_matches "desktop dev server" \
  "${repo_root}/node_modules/.bin/../@tauri-apps/cli/tauri.js dev" \
  "${repo_root}/node_modules/.bin/../vite/bin/vite.js"

sleep 0.5

cd "$repo_root"
exec pnpm tauri dev --config src-tauri/tauri.dev.conf.json
