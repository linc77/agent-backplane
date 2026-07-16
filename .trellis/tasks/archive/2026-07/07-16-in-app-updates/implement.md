# In-app updates implementation plan

## 1. Signing and native foundation

- [x] Generate one password-protected Tauri updater keypair outside the repo.
- [x] Store the private key and password as GitHub repository secrets without
      printing either value.
- [x] Add updater/process Rust and JavaScript dependencies.
- [x] Initialize plugins, add minimal capabilities, embed the public key, set
      the HTTPS endpoint, and enable updater artifacts.

## 2. Update state and UI

- [x] Add a pure update-state reducer plus preference helpers and focused tests.
- [x] Add a `useAppUpdater` controller that owns Tauri resources, startup/manual
      checks, progress translation, installation, cleanup, and relaunch.
- [x] Add the global Settings footer action and available-update indicator.
- [x] Add the bilingual Settings dialog with current version, startup toggle,
      release notes, progress, retry, and install actions.
- [x] Keep fixture mode native-free and add an end-to-end fixture UI test.

## 3. Release automation

- [x] Extend the release workflow to build macOS ARM64 and Windows x64 from the
      same tagged draft release using signing secrets.
- [x] Upload updater signatures and prefer NSIS for Windows updater metadata.
- [x] Add a verification script or command that rejects `latest.json` unless
      both supported platform entries have non-empty URL/signature values.

## 4. Validation

- [x] Run focused Vitest coverage for reducer, preference, and Settings UI.
- [x] Run TypeScript/Vite build and Rust plugin checks.
- [x] Run `pnpm verify` and `git diff --check`.
- [x] Build a signed macOS ARM64 updater artifact locally and verify its
      signature file exists without exposing key material. Build both `app`
      and `dmg`; a DMG-only build does not emit updater artifacts.
- [x] Review the final diff against the PRD and update Loop verification.

## Risky Files and Rollback Points

- `src-tauri/tauri.conf.json`: a wrong public key or endpoint makes every update
  check fail; validate config generation and a signed artifact before release.
- GitHub Actions release workflow: parallel platform jobs must leave one
  complete `latest.json`; verify the draft asset before publication.
- Updater keypair: never regenerate for normal releases. Back up the original
  private key before publishing the first updater-enabled version.
- `src/App.tsx`: keep updater state isolated from Agent switching and existing
  Memory/Skills/MCP query state.
