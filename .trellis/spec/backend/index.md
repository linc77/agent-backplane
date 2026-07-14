# Backend Development Guidelines

## Guidelines Index

| Guide | Description | Status |
|---|---|---|
| [Skill Inventory Contract](./skill-inventory.md) | Native discovery, Tauri payload, snapshot, and test boundary | Active |

## Pre-Development Checklist

- Read `skill-inventory.md` before changing Skill discovery, identity, roots,
  snapshot persistence, or the `load_skill_inventory` command.

## Quality Check

- Run `cargo test --manifest-path src-tauri/Cargo.toml skill_manager -- --nocapture`.
- Run `pnpm exec vitest run src/lib/api.test.ts src/App.fixture.test.tsx`.
- Confirm frontend/backend field names still round-trip through Tauri camelCase.
