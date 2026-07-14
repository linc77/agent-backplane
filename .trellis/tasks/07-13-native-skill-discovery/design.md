# Native Skill Discovery Design

## Product Boundary

AMM owns the inventory model and snapshot. Filesystem Skill directories are
discovery sources, not databases. This slice never copies, edits, links, or
deletes a discovered Skill. SkillManager compatibility is not needed for the
native path and its absence cannot degrade the page.

## Provider Boundary

Rust owns a small `SkillProvider` contract that produces discovered Skill
copies and root scan status. `FilesystemSkillProvider` is the required native
provider. Future GitHub, marketplace, or SkillManager adapters must convert
their output to the same discovered-copy contract instead of leaking their own
schema through Tauri.

## Discovery Roots

Global roots are derived from the current home directory:

- `.agents/skills`
- `.codex/skills`
- `.claude/skills`
- `.gemini/skills`
- `.cursor/skills`
- `.config/opencode/skills`

When a project root is provided, or the current working directory is a project,
AMM also checks `.agents/skills`, `.codex/skills`, and `.claude/skills` there.
Traversal is bounded to three directory levels beneath each declared root and
only accepts files named `SKILL.md`.

## Identity Model

The scanner produces two levels:

- `SkillCopy`: one filesystem exposure path, including tool, scope, root,
  symlink state, canonical path, parsed manifest, and validation issue.
- `SkillCapability`: one logical capability grouping copies with the same
  manifest content hash. It aggregates tools, health, copy count, and copies.

Name alone is not an identity key because unrelated Skills can share a name.
Path alone is not an identity key because symlinks and copied directories can
expose the same capability through several tools.

## Manifest Parsing

Rust reads UTF-8 `SKILL.md` files, requires YAML frontmatter fences, and extracts
non-empty `name` and `description`. It supports quoted scalar values and folded
or literal description blocks needed by common Skill manifests. Invalid or
unreadable manifests remain visible with an issue instead of disappearing.

## Snapshot

After discovery, AMM writes a formatted JSON snapshot to
`~/.agent-memory-manager/skill-inventory.json`. Snapshot failure is returned as
metadata and does not hide the live scan result. The snapshot is AMM-owned and
does not make external directories writable.

## Frontend Contract

The Skills page consumes only AMM's `SkillInventory` contract. It shows logical
capabilities separately from discovered copies, supports search and tool
filtering, highlights duplicate and invalid groups, and exposes every copy in
the detail panel with real-directory/symlink and global/project status.

## Rollback

Restore the previous SkillManager CLI adapter and its frontend contract. The
AMM snapshot can be deleted safely because it is derived data.
