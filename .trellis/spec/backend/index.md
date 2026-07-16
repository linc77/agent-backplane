# Backend Development Guidelines

## Guidelines Index

| Guide | Description | Status |
|---|---|---|
| [Electron Runtime Contract](./electron-runtime.md) | Sandboxed renderer, typed IPC, native services, credentials, and packaging | Active |
| [Skill Inventory Contract](./skill-inventory.md) | Native discovery, Electron payload, snapshot, and test boundary | Active |
| [Agent Configuration Contract](./agent-configuration.md) | Provider profiles, safeStorage, native adapters, backups, and Electron payload | Active |
| [Agent Memory Scope Contract](./agent-memory-scope.md) | Agent-specific roots, source isolation, and read-only snapshots | Active |
| [MCP Inventory Contract](./mcp-inventory.md) | Native MCP discovery and pre-serialization redaction | Active |
| [Application Updater Contract](./app-updater.md) | GitHub release checks, manual download states, and cross-platform Electron bundles | Active |

## Pre-Development Checklist

- Read `electron-runtime.md` before changing IPC, preload, Electron security,
  OS integration, native services, or desktop packaging.
- Read `skill-inventory.md` before changing Skill discovery, identity, roots,
  snapshot persistence, or the `load_skill_inventory` command.
- Read `agent-configuration.md` before changing Agent profiles, native config
  adapters, Keychain storage, backups, or Agent configuration commands.
- Read `agent-memory-scope.md` before changing Agent memory roots, discovery,
  profiles, source excerpts, or write boundaries.
- Read `mcp-inventory.md` before changing MCP formats, scopes, enabled state,
  transport detection, redaction, or Tauri fields.
- Read `app-updater.md` before changing versions, update UI/state, GitHub
  release checks, signing, or release bundles.

## Quality Check

- Run `pnpm verify`.
- Run focused native tests with `pnpm exec vitest run electron/main`.
- Build the unpacked macOS ARM64 app with `pnpm build:desktop:debug` and verify
  that the renderer URL is `app://renderer/index.html`.
- Confirm IPC inputs are Zod-validated and payload field names round-trip
  unchanged through `window.amm`.
