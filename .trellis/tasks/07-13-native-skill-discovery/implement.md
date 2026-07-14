# Implementation Plan

1. Replace the competitor-shaped Rust types with AMM-owned root, copy,
   capability, provider, and inventory contracts.
2. Implement bounded native root discovery, manifest parsing, hashing,
   symlink/canonical-path inspection, grouping, summary counts, and snapshot.
3. Add filesystem fixtures covering real directories, symlinks, duplicates,
   project/global roots, invalid frontmatter, and snapshot output.
4. Replace TypeScript contracts and fixture inventory with the native model.
5. Update Skills UI and translations for capabilities, copies, tools, health,
   scope, and filesystem type.
6. Add frontend regression coverage proving capability/copy separation,
   filtering, duplicate visibility, and no competitor wording.
7. Run focused tests, `pnpm verify`, and browser fixture verification.
8. Update the parent Trellis design and Loop verification with the independent
   data boundary and evidence.

## Risk and Rollback Points

- Keep traversal depth bounded and do not recursively follow directory
  symlinks.
- Do not mutate external roots during scan or snapshot creation.
- Invalid manifests must be represented, not silently skipped.
- Preserve existing memory queries and navigation behavior.
