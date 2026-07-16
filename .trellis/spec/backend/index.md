# Backend Development Guidelines

## Guidelines Index

| Guide | Description | Status |
|---|---|---|
| [Skill Inventory Contract](./skill-inventory.md) | Native discovery, Tauri payload, snapshot, and test boundary | Active |
| [Agent Configuration Contract](./agent-configuration.md) | Provider profiles, Keychain, native adapters, backups, and Tauri payload | Active |

## Pre-Development Checklist

- Read `skill-inventory.md` before changing Skill discovery, identity, roots,
  snapshot persistence, or the `load_skill_inventory` command.
- Read `agent-configuration.md` before changing Agent profiles, native config
  adapters, Keychain storage, backups, or Agent configuration commands.

## Quality Check

- Run `cargo test --manifest-path src-tauri/Cargo.toml skill_manager -- --nocapture`.
- Run `pnpm exec vitest run src/lib/api.test.ts src/App.fixture.test.tsx`.
- Run `cargo test --manifest-path src-tauri/Cargo.toml agent_config -- --nocapture`.
- Confirm frontend/backend field names still round-trip through Tauri camelCase.
