# Agent Memory Manager

Cross-platform desktop app for understanding and controlling what local Agents know and can do. It inspects Codex memory, surfaces stale or conflicting entries, writes safe correction notes, natively inventories global/project Skills, and manages provider profiles for Codex, Claude Code, and Hermes.

The Skills workspace separates logical capabilities from filesystem copies,
shows tool exposure and symlink state, and writes a derived AMM-owned snapshot
to `~/.agent-memory-manager/skill-inventory.json`. Discovery is read-only.

## Downloads

Installers are published on [GitHub Releases](https://github.com/linc77/agent-memory-manager/releases/latest):

- macOS Apple Silicon: `.dmg`
- Windows x64: NSIS `.exe` or WiX `.msi`

The first public builds are unsigned. macOS Gatekeeper or Windows SmartScreen may require explicit confirmation before opening them.

## Development

```bash
pnpm install
pnpm dev:desktop
```

`pnpm dev:desktop` closes stale installed/debug AMM windows and launches Tauri with the dev-only app identity `Agent Memory Manager Dev`, so desktop verification does not inspect an old bundle by mistake.

For a packaged debug app with the same dev-only identity:

```bash
pnpm build:desktop:debug
open "src-tauri/target/debug/bundle/macos/Agent Memory Manager Dev.app"
```

## Checks

```bash
pnpm verify
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
```
