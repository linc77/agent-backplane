# Agent Memory Manager

macOS-first desktop app for understanding what local Agents know and can do. It inspects Codex memory, surfaces stale or conflicting entries, writes safe correction notes, and natively inventories global/project Skills without depending on an external Skill manager.

The Skills workspace separates logical capabilities from filesystem copies,
shows tool exposure and symlink state, and writes a derived AMM-owned snapshot
to `~/.agent-memory-manager/skill-inventory.json`. Discovery is read-only.

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
