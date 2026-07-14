# Implementation Plan

1. Define AMM-owned Skill root, copy, capability, provider, and inventory
   contracts in Rust.
2. Implement bounded native filesystem discovery, manifest parsing, content
   hashing, duplicate grouping, symlink inspection, and atomic snapshots.
3. Register `load_skill_inventory` and add matching TypeScript contracts plus
   deterministic fixture data.
4. Add the `skillManager` navigation item, bilingual labels, and full-width
   Skills workspace with summary, search, tool filter, refresh, details, and
   Finder reveal actions.
5. Add focused Rust and frontend tests for discovery, invalid manifests,
   capability/copy identity, navigation, filtering, and competitor independence.
6. Run focused checks, `pnpm verify`, `git diff --check`, and live desktop
   verification.
7. Record verification evidence and finish the Trellis parent and child tasks.

## Rollback

Remove the new SkillManager Rust module/command, TypeScript contracts/API,
component/styles, and navigation entry. Trellis initialization remains a
separate user-requested project workflow change.
