# In-app updates design

## Architecture

The feature uses Tauri 2's official updater and process plugins from the React
frontend. GitHub Releases remains the only update metadata and artifact host.

```text
Settings / startup check
  -> useAppUpdater
  -> @tauri-apps/plugin-updater check()
  -> GitHub Release latest.json
  -> signed platform artifact
  -> downloadAndInstall(progress)
  -> @tauri-apps/plugin-process relaunch()
```

The Settings UI receives one controller state rather than interpreting raw
plugin events. A pure reducer owns transitions between `idle`, `checking`,
`upToDate`, `available`, `downloading`, `installing`, `installed`, and `error`.
The hook owns the non-serializable Tauri `Update` resource and closes stale
resources before a new check or on unmount.

## UI Boundary

- `Sidebar` gets an application Settings action in its footer and a small
  update-available indicator.
- `App` owns whether the Settings dialog is open and creates one updater
  controller for the application lifetime.
- `SettingsDialog` renders version, preference, status, release notes, progress,
  and explicit check/install actions. It does not call Tauri APIs directly.
- The persisted startup-check preference lives under a dedicated localStorage
  key and defaults to `true` when absent or unavailable.
- Fixture mode supplies an unavailable native boundary and never calls updater
  or process plugins.

## Native and Security Boundary

- Add `tauri-plugin-updater` and `tauri-plugin-process` in Rust and JavaScript.
- Initialize both plugins in the desktop builder.
- Grant `updater:default` and only `process:allow-restart` to the main window.
- Configure `bundle.createUpdaterArtifacts = true`.
- Configure the endpoint as
  `https://github.com/linc77/agent-memory-manager/releases/latest/download/latest.json`.
- Embed the generated public minisign key in `tauri.conf.json`. Never commit or
  log the private key or password.
- Use Windows `passive` install mode so the installer provides progress without
  requiring a separate manual installer flow.

Tauri verifies update artifacts against the embedded key before installation;
signature verification cannot be disabled. The update metadata must contain a
valid URL and signature for every advertised platform.

## Release Pipeline

Replace the Windows-only release job with a desktop matrix:

- macOS runner: `aarch64-apple-darwin` with explicit `app,dmg` bundles. The
  `app` target produces the signed updater `.app.tar.gz`; the DMG remains the
  first-install package.
- Windows runner: `x86_64-pc-windows-msvc`, NSIS and MSI, preferring NSIS in
  updater metadata.
- Both jobs receive `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from repository secrets.
- `tauri-apps/tauri-action@v1` uploads signatures and merges the static
  `latest.json` into the existing draft release.
- Publication remains a separate explicit gate after checking that
  `latest.json` contains `darwin-aarch64` and `windows-x86_64` entries.

## Compatibility and Rollout

`v0.1.1` cannot discover the updater-enabled release because it does not contain
the plugin or public key. The first updater-enabled release is a one-time manual
upgrade. Every later release signed with the same private key can update it in
place. Losing the private key prevents updates for already-installed clients,
so the local recovery copy and GitHub secrets are operational requirements.

## Failure and Rollback

- Network, malformed metadata, missing platform, and signature errors become a
  user-visible retryable error; they do not block other app features.
- Download/install is never started by the startup check.
- A release with incomplete `latest.json` stays draft.
- Source rollback removes the updater UI/plugins/config; shipped clients remain
  usable but will not receive another in-app update until a correctly signed
  release is published.

## Research

- Tauri updater setup, signing, artifacts, configuration, and permissions:
  https://v2.tauri.app/plugin/updater/
- Tauri updater JavaScript API:
  https://v2.tauri.app/reference/javascript/updater/
- Tauri process relaunch plugin:
  https://v2.tauri.app/plugin/process/
- Official Tauri GitHub Action:
  https://github.com/tauri-apps/tauri-action
