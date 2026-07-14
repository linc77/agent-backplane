# Dev Debug Window Visibility

Status: open
Date: 2026-06-27

## Problem

`Agent Memory Manager Dev.app` now has a unique product name and bundle id, but live desktop click verification still cannot proceed.

## Evidence

- `pnpm build:desktop:debug` produces `src-tauri/target/debug/bundle/macos/Agent Memory Manager Dev.app`.
- Adding the `amm-profile-generate` CLI binary briefly caused the debug bundle to select the wrong executable: `pnpm build:desktop:debug` reported `Built application at: .../target/debug/amm-profile-generate`, and opening the Dev app launched `.../Contents/MacOS/amm-profile-generate` plus a `codex exec` child.
- Setting `default-run = "agent-memory-manager"` in `src-tauri/Cargo.toml` fixed that packaging regression; the next debug build reported `Built application at: .../target/debug/agent-memory-manager`, and opening the Dev app launched `.../Contents/MacOS/agent-memory-manager`.
- Computer Use lists the app as `Agent Memory Manager Dev` with bundle id `com.linc.agent-memory-manager.dev`.
- `mcp__computer_use.get_app_state` for `Agent Memory Manager Dev` returned `cgWindowNotFound`.
- Re-probing after the `default-run` fix still returned `cgWindowNotFound` for both `Agent Memory Manager Dev` and the full `.app` path.
- Direct terminal launch of `Agent Memory Manager Dev.app/Contents/MacOS/agent-memory-manager` printed `[amm-window] label=main inner=Ok(PhysicalSize { width: 2360, height: 1520 }) outer=Ok(PhysicalSize { width: 2360, height: 1520 }) visible=Ok(true)`.
- System Events saw the process as `agent-memory-manager` but reported `count of windows = 0`, which matches the Computer Use inability to acquire a key window.
- A CoreGraphics probe saw a window owned by `Agent Memory Manager Dev`, but with an abnormal 199x129 frame instead of the configured 1180x760 window.
- The app now creates the main window explicitly from Tauri config (`create: false` plus `WebviewWindowBuilder::from_config`) and normalizes size/focus on startup.
- A debug terminal launch printed `[amm-window] label=main inner=Ok(PhysicalSize { width: 2360, height: 1520 }) outer=Ok(PhysicalSize { width: 2360, height: 1520 }) visible=Ok(true)`, which matches the expected 1180x760 logical window on the Retina display.

## Impact

Automated desktop click verification for Regenerate/Cancel cannot be trusted yet because the macOS accessibility/capture layer reports zero accessible windows even while Tauri reports a visible correctly sized main window. Current stability evidence remains covered by frontend interaction tests, backend state-machine tests, Tauri internal window-size evidence, strict non-UI profile generation, browser-equivalent fixture checks, and full repo verification.

## Next Probe

Treat the abnormal CoreGraphics/AX state as a capture/tooling problem unless a user-visible desktop symptom contradicts the Tauri internal size evidence. Next probe should focus on Computer Use/macOS capture permissions or a lower-level WebView/window accessibility setting, not on the profile-generation product flow.
