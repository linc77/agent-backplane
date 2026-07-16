# In-app updates

## Goal

Let desktop users discover, download, and install new Agent Memory Manager
releases from inside the app instead of manually visiting GitHub and replacing
the application on every release.

## Background

- The shipped `v0.1.1` app has no updater plugin, update endpoint, or embedded
  verification key. Users on `v0.1.1` must install the first updater-enabled
  release manually once; in-app updates work from that release onward.
- The app currently exposes Agent configuration from the top-left Agent menu,
  while the sidebar footer only contains the language switch. Application-wide
  update controls need a separate Settings entry.
- Releases are hosted in the public `linc77/agent-memory-manager` GitHub
  repository. macOS Apple Silicon and Windows x64 are the supported targets.
- Tauri updater signatures are mandatory and are separate from Apple or
  Windows platform code-signing certificates.

## Requirements

1. Add an application Settings entry to the sidebar footer. It must not be
   scoped to the selected Agent.
2. Add an Application Update section that shows the installed version and can
   manually check for a newer stable GitHub Release.
3. Persist an `Automatically check on startup` preference locally. It defaults
   to enabled and performs only a check; it never downloads or installs without
   explicit user confirmation.
4. When an update exists, show its version and release notes, mark the Settings
   entry, and let the user download and install it without opening a browser.
5. Show useful checking, up-to-date, downloading, installing, installed, and
   error states. Show determinate progress when the server provides a content
   length and an indeterminate state otherwise.
6. Relaunch the app after a successful installation. Keep the rest of the app
   usable after check or download failures.
7. Support signed updater artifacts for macOS Apple Silicon and Windows x64.
   The public verification key is embedded in the app; the private key and its
   password are stored only as GitHub Actions secrets and in the owner's local
   recovery location.
8. The release workflow must upload installer assets, updater signatures, and a
   complete `latest.json` containing both supported platform entries before a
   draft release is made public.
9. Keep Chinese and English UI text complete. Browser fixture mode must not
   invoke native updater APIs.

## Acceptance Criteria

- [x] The sidebar footer exposes a keyboard-accessible Settings button in both
      locales, independent of the selected Agent.
- [x] Settings shows the actual desktop app version and the persisted startup
      check preference.
- [x] Manual checks distinguish no update, update available, and request or
      verification failure.
- [x] Startup checks never start a download and visibly mark Settings when a
      newer version is available.
- [x] Confirming an available update reports download progress, installs the
      signed artifact, and requests an app relaunch.
- [x] The updater endpoint is HTTPS and points at the public GitHub Release
      `latest.json` asset.
- [x] Tauri capabilities grant only update check/download/install and process
      restart access needed by the frontend.
- [x] The release workflow consumes signing secrets without logging them and
      emits macOS ARM64 plus Windows x64 updater artifacts and signatures.
- [x] Focused UI/state tests, `pnpm verify`, and a signed artifact build pass.
- [x] Verification records the one-time manual transition from `v0.1.1` to the
      first updater-enabled release.

## Out of Scope

- Silent or forced installation.
- Beta channels, downgrade support, staged rollout, or a custom update server.
- Linux or macOS Intel packages.
- Apple notarization and Windows Authenticode signing.
