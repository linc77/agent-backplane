# Independent Skill Management Design

## Boundary

AMM owns the Skill inventory model and derived snapshot. It does not use a
competitor database or CLI as its source of truth. Filesystem directories are
read-only discovery roots; optional providers can be added later by converting
their data into AMM's contract.

## Data Flow

1. React Query calls `loadSkillInventory()`.
2. Tauri invokes `load_skill_inventory` with an optional project root.
3. Rust's native filesystem provider scans declared global/project roots.
4. Rust parses and validates `SKILL.md`, hashes content, inspects symlinks, and
   produces discovered copies.
5. AMM groups exact manifest content into logical capabilities, aggregates
   tools and health, and writes its own JSON snapshot.
6. The React Skills workspace searches and filters capabilities and renders
   their underlying copy/exposure evidence.

## Core Model

- `SkillRootStatus`: one declared discovery root.
- `SkillCopy`: one filesystem exposure with tool, scope, link type, canonical
  path, manifest health, and content hash.
- `SkillCapability`: one logical capability grouping identical manifest
  content across copies.
- `SkillInventory`: AMM-owned summary, roots, capabilities, copies, and snapshot
  metadata.

## Safety

- Traversal is depth-bounded and does not recursively follow directory
  symlinks.
- External directories are never copied, edited, linked, or deleted.
- Invalid manifests remain visible with issues.
- Snapshot failure is reported without hiding live results.
- Adoption, deployment, deletion, and rollback require later workflows with
  explicit previews and confirmation.

## UI Integration

Skills uses the full work area and hides the memory-specific evidence pane. The
page shows capability/copy/duplicate/invalid counts, active roots, search, tool
filter, capability list, and per-copy details.
