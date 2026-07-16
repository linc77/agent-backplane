# Implementation Plan

1. Add Rust inventory/profile contracts, catalog persistence, Keychain secret
   storage, validation, backups, and atomic-write helpers.
2. Add native Claude JSON, Codex TOML, and Hermes YAML inspect/apply adapters
   with focused fixture tests proving unrelated configuration is preserved.
3. Register Tauri commands for load, save, delete, and activate operations.
4. Add matching TypeScript contracts, API wrappers, and deterministic fixture
   inventory for three Agents.
5. Add the Agents navigation item, full-width layout, top Agent switcher,
   profile cards, add/edit dialog, activation flow, and bilingual copy.
6. Add frontend tests for Agent switching, redaction, profile editing, and
   activation refresh behavior.
7. Run focused Rust/Vitest checks, `pnpm verify`, `git diff --check`, and live
   desktop verification.
8. Update backend specs and Loop verification with the config adapter, secret,
   and atomic-write contracts.

## Rollback Points

- Backend commands can be removed without touching existing Memory or Skill
  commands.
- The Agents view is isolated behind one navigation item.
- Native writes always create a backup before replacement.
- No migration is required beyond deleting the derived AMM catalog and
  Keychain entries.
