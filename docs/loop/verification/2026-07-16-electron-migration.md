# Electron Runtime Migration Verification

Date: 2026-07-16
Decision: implementation and local macOS acceptance passed

## Change Verified

- Replaced the Rust/Tauri runtime with TypeScript Electron main, sandboxed
  preload, fixed named IPC channels, and the existing React renderer.
- Ported Memory, Skills, MCP, corrections, profiles, Codex audits, background
  cancellation, Agent configuration, backups, and source reveal behavior.
- Kept existing profile/catalog/cache paths while intentionally not migrating
  Rust keyring credentials. New credentials use Electron `safeStorage`
  ciphertext and never cross IPC.
- Replaced signed Tauri updater behavior with a truthful GitHub release check
  and explicit manual-download link for the unsigned Electron transition.
- Removed project Rust, Cargo, Tauri packages/configuration, and the Tauri
  release workflow.
- Removed `.trellis/tasks/` from Git tracking and ignored future local task
  plans.

## Automated Gates

```bash
pnpm verify
pnpm build:desktop:debug
pnpm build:desktop
```

Observed:

- 20 Vitest files and 74 tests passed.
- Renderer, Electron main, preload, and shared TypeScript checks passed.
- Production Electron build, profile-cache check, Loop verification, and
  `git diff --check` passed.
- Unpacked macOS ARM64 application packaged successfully.
- DMG and ZIP were produced for version 0.2.0.

## Security and Data Probes

- Window tests assert `nodeIntegration=false`, `contextIsolation=true`, and
  `sandbox=true`, including exact development-origin matching.
- Correction tests reject path escape and existing targets.
- MCP tests prove args, environment values, credentials, URL paths, and query
  values are removed before IPC.
- Agent configuration tests preserve unrelated JSON/TOML/YAML fields, create
  backups, omit legacy secrets, and reject invalid inputs.
- Encrypted storage tests prove the on-disk file contains ciphertext only,
  uses mode 0600 on Unix, supports deletion, and refuses a plaintext fallback.

## Packaged Desktop Acceptance

The packaged ARM64 application launched from
`release/mac-arm64/Agent Memory Manager.app`. Process inspection confirmed an
ARM64 Electron renderer with sandboxing enabled. Accessibility inspection
reported the packaged URL as `app://renderer/index.html`.

User-like checks passed:

- Codex Memory loaded from the real local root.
- The top-left Agent menu showed Codex, Claude Code, and Hermes.
- Switching to Claude Code changed the selected profile and visible Memory
  context without exposing Codex write/Audit actions.
- Settings showed version 0.2.0, automatic release checks, and the manual
  GitHub download contract.

## Artifacts

```text
release/Agent Memory Manager_0.2.0_arm64.dmg
release/Agent Memory Manager_0.2.0_arm64.zip
```

The macOS application Info.plist reports bundle id
`com.linc.agent-memory-manager` and version `0.2.0`. The first Electron build
is intentionally unsigned.

Windows cannot be packaged on this macOS host because no Wine/NSIS toolchain
is installed. `.github/workflows/release-desktop.yml` builds Windows x64 NSIS
on `windows-latest`, runs `pnpm verify`, and uploads only final installers to a
draft release. That remote job remains the Windows runtime acceptance gate.
