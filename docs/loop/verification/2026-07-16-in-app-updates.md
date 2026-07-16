# In-app Updates Verification

Status: complete; `v0.1.2` remains a draft release
Date: 2026-07-16
Trellis task: `.trellis/tasks/07-16-in-app-updates/`
Commit: `a53d37e`

## Acceptance Target

Application Settings lets macOS Apple Silicon and Windows x64 users check for,
download, verify, install, and relaunch into a newer GitHub Release without
manually replacing the app on every future update.

## Delivered

- Added a global Settings action in the sidebar footer, separate from the
  selected Codex, Claude Code, or Hermes context.
- Added current-version display, a persisted startup-check preference, manual
  checks, update-available marking, release notes, progress, retry, install,
  and relaunch states in Chinese and English.
- Startup checks only discover updates. Download and installation require an
  explicit user action.
- Added Tauri updater and process plugins with signed artifacts, an embedded
  public verification key, the GitHub `latest.json` HTTPS endpoint, and the
  minimum updater/restart capabilities.
- Added one release workflow for macOS ARM64 and Windows x64, plus a metadata
  gate that rejects a draft unless both supported updater targets have URLs and
  signatures.
- Added the updater release contract to
  `.trellis/spec/backend/app-updater.md`.

## Automated Evidence

Final `pnpm verify` passed:

- Vitest: 10 files, 52 tests passed.
- Rust: 72 tests passed.
- TypeScript/Vite production build passed.
- Cargo check, profile-cache verification, Loop-reference verification, and
  `git diff --check` passed.

Focused coverage includes update-state transitions, persisted preferences,
startup/manual checks, native cleanup, Settings rendering, install progress,
and fixture-mode isolation from native updater APIs.

## Visual Evidence

The fixture application was reviewed at `http://127.0.0.1:1420/?fixture=1` in
the in-app browser. The Settings action rendered at the bottom left, the dialog
showed the Chinese update controls and disabled browser-only state correctly,
and the browser console remained free of errors.

## Signed Artifact Evidence

A local signed macOS ARM64 build produced a DMG, an `.app.tar.gz` updater
archive, and its `.sig` file. The application binary is ARM64 and
`hdiutil verify` reported the DMG as valid. The macOS command builds both `app`
and `dmg`; a DMG-only build does not emit the updater archive.

GitHub Actions run
[`29477347961`](https://github.com/linc77/agent-memory-manager/actions/runs/29477347961)
passed for:

- macOS ARM64 `app,dmg` build and upload;
- Windows x64 `nsis,msi` build and upload;
- post-build `latest.json` verification.

The draft release contains eight assets:

- `Agent.Memory.Manager_0.1.2_aarch64.dmg`
- `Agent.Memory.Manager_0.1.2_aarch64.app.tar.gz`
- `Agent.Memory.Manager_0.1.2_aarch64.app.tar.gz.sig`
- `Agent.Memory.Manager_0.1.2_x64-setup.exe`
- `Agent.Memory.Manager_0.1.2_x64-setup.exe.sig`
- `Agent.Memory.Manager_0.1.2_x64_en-US.msi`
- `Agent.Memory.Manager_0.1.2_x64_en-US.msi.sig`
- `latest.json`

The downloaded metadata reports version `0.1.2`, covers `darwin-aarch64` and
`windows-x86_64`, uses GitHub release asset URLs, and includes a non-empty
signature for every supported updater target. The release intentionally remains
a draft until publication is explicitly requested.

## Upgrade Boundary

The public `v0.1.1` binary does not contain the updater plugin, endpoint, or
verification key. Existing users therefore need to install `v0.1.2` manually
once. From `v0.1.2` onward, signed updates can be completed inside the app.

## Security Boundary

The updater private key and password are not stored in the repository. GitHub
Actions reads them through repository secrets, while the app contains only the
public verification key. Platform notarization and Authenticode signing remain
out of scope for this release.
