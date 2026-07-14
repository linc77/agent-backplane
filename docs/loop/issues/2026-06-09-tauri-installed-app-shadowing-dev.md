# Tauri Installed App Shadows Dev Window

Status: fixed
Date: 2026-06-09

## Reproduction

After `pnpm tauri dev`, `ps` showed both:

- `/Applications/Agent Memory Manager.app/Contents/MacOS/agent-memory-manager`
- `target/debug/agent-memory-manager`

Computer Use selected the installed app by bundle id and showed the old topic-first UI from `tauri://localhost`, while Vite at `http://localhost:1420/` served the new source-first frontend.

## Impact

Desktop visual verification can accidentally inspect the old installed bundle instead of the current dev frontend.

## Follow-Up

Add a dev-start guard or documented command that quits the installed app before `pnpm tauri dev`, or use a distinct dev bundle identifier/name.

## Resolution

Added `pnpm dev:desktop`, which runs `scripts/dev-desktop.sh` to stop stale installed/debug AMM windows, repo-local bare `target/debug/agent-memory-manager` processes, and the repo-local desktop dev server before launching `pnpm tauri dev`. README now points development startup to this guarded command.

Added `src-tauri/tauri.dev.conf.json` and `pnpm build:desktop:debug` so desktop verification can target `Agent Memory Manager Dev.app` with bundle id `com.linc.agent-memory-manager.dev`.

Boundary: Computer Use should not target `Agent Memory Manager` by app name for live verification, because macOS can launch the installed app again. Use `Agent Memory Manager Dev` for debug-bundle verification. A separate current limitation remains: the Dev debug window was observed through CoreGraphics with an abnormal small frame, so live click verification still needs a window visibility/size fix.
