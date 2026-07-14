# Build native skill discovery foundation

## Goal

Make Agent Memory Manager independently useful for Skill inventory without
requiring the competing SkillManager app, database, directory, or CLI.

The first slice establishes AMM-owned discovery and identity so later profile,
adoption, deployment, verification, and rollback features have a trustworthy
foundation.

## Background

- The current Skills screen calls `skills-manager-cli` as its only data source.
- SkillManager is a competitor and may be absent from a user's machine.
- Skills currently exist across global and project-specific directories, with
  real folders, symlinks, duplicate copies, and tool-specific exposure paths.
- AMM must distinguish a logical capability from the filesystem copies through
  which that capability is exposed.

## Requirements

- Add an AMM-owned Skill inventory contract independent of external managers.
- Add a provider boundary so native filesystem discovery is mandatory and
  SkillManager compatibility is optional.
- Discover supported global and project Skill roots without following paths
  outside the configured scan boundary unexpectedly.
- Parse `SKILL.md` frontmatter and retain name, description, root, source,
  target/tool, symlink information, and content identity.
- Group duplicate filesystem copies into logical capabilities using stable
  evidence rather than name alone.
- Show capability count separately from discovered-copy count.
- Show source roots, symlink/real-directory status, duplicate groups, invalid
  manifests, and which tools can currently see each capability.
- Keep fixture mode deterministic and preserve the current memory surfaces.
- Treat SkillManager as an optional compatibility provider, never as the AMM
  source of truth.
- Persist the latest inventory snapshot under AMM's own application-data root.
- Keep this slice read-only toward every discovered external Skill directory.
- Preserve unrelated dirty-worktree changes.

## Out of Scope

- Remote marketplace search and publishing.
- Automatic deletion of external Skill directories.
- Modifying global Agent configuration without an explicit preview and
  confirmation workflow.

## Acceptance Criteria

- [x] The app starts and displays Skills when SkillManager is not installed.
- [x] Native discovery finds real global/project Skill roots and reports their
      provenance without depending on the competitor CLI.
- [x] Duplicate copies are grouped into a logical capability with copy count.
- [x] Symlinks, real directories, invalid manifests, and tool exposure are
      visible and covered by tests.
- [x] The UI shows both logical capability count and discovered-copy count.
- [x] SkillManager availability changes only optional compatibility metadata,
      not whether Skills can load.
- [x] AMM persists its latest inventory snapshot without modifying discovered
      Skill directories.
- [x] Focused Rust/frontend tests and `pnpm verify` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
