# Add independent local Skill management

## Goal

Add a usable Skill workspace to Agent Memory Manager while keeping AMM an
independent product. AMM owns the inventory contract and derived snapshot;
external directories and competing managers are optional discovery sources.

## Requirements

- Add a dedicated `Skills` item to primary navigation.
- Discover global and project Skills natively from supported filesystem roots.
- Distinguish logical capabilities from filesystem copies and exposures.
- Surface tool visibility, scope, symlink/real-directory state, duplicate
  groups, invalid manifests, paths, and descriptions.
- Persist a derived inventory snapshot under AMM's own application-data root.
- Present summary counts, search, tool filtering, refresh, detail, and Finder
  reveal actions.
- Keep fixture mode usable with deterministic native discovery data.
- Keep this slice read-only toward discovered external directories.
- Preserve unrelated uncommitted work.

## Acceptance Criteria

- [x] The sidebar exposes a `Skills` view in Chinese and English.
- [x] Skills loads without the SkillManager app, CLI, database, or directory.
- [x] Native discovery reports global and project roots with provenance.
- [x] The UI separates logical capability and discovered-copy counts.
- [x] Duplicate copies, tools, scope, symlink/real-directory state, invalid
      manifests, and paths are visible through the unified contract.
- [x] Refresh reruns discovery without restarting the app.
- [x] AMM writes its own inventory snapshot without mutating external Skills.
- [x] Focused frontend/Rust tests, `pnpm verify`, and live desktop verification
      pass.

## Child Tasks

- `07-13-native-skill-discovery` — replaces the initial competitor CLI adapter
  with AMM-owned native discovery, identity, snapshot, UI, and verification.
