# Native Skill Discovery Verification

Status: complete
Date: 2026-07-13
Parent task: `.trellis/tasks/07-11-skill-management/`
Child task: `.trellis/tasks/07-13-native-skill-discovery/`

## Acceptance Target

AMM loads a useful Skill workspace without the competing SkillManager app,
database, directory, or CLI. It discovers global/project Skills itself,
separates logical capabilities from copies, preserves provenance, and writes an
AMM-owned derived snapshot while leaving external directories untouched.

## Delivered

- Replaced the `skills-manager-cli` adapter with `FilesystemSkillProvider`.
- Added AMM-owned `SkillRootStatus`, `SkillCopy`, `SkillCapability`, and
  `SkillInventory` contracts.
- Scans `.agents`, `.codex`, `.claude`, `.gemini`, `.cursor`, and OpenCode
  global roots plus current-project `.agents`, `.codex`, and `.claude` roots.
- Bounds traversal to three levels and does not recursively follow directory
  symlinks.
- Parses scalar, quoted, folded, and literal `SKILL.md` frontmatter values.
- Keeps invalid/unreadable manifests visible with explicit issues.
- Records tool, global/project scope, symlink/real-directory state, resolved
  path, manifest path, and SHA-256 content identity per copy.
- Groups exact manifest content into logical capabilities and aggregates tools,
  health, and copy count.
- Writes `~/.agent-memory-manager/skill-inventory.json` atomically; snapshot
  failure is returned without hiding live discovery.
- Rebuilt the Skills UI around capabilities, copies, duplicate groups, invalid
  copies, scan roots, tool filtering, and copy evidence.
- Removed all runtime references to `skills-manager-cli` and `.skills-manager`
  from frontend/backend source.

## Real Machine Evidence

Native discovery returned:

- 72 logical capabilities.
- 88 discovered copies.
- 12 duplicate capability groups.
- 0 invalid copies in the current real roots.
- 53 copies from global Agent Skills.
- 6 from global Codex, 12 from Claude Code, and 5 from Gemini CLI.
- 12 project-local Trellis Skills from `.agents/skills`.

Snapshot: `/Users/qsh/.agent-memory-manager/skill-inventory.json`.

## Automated Evidence

```bash
pnpm verify
```

Result: passed.

- Vitest: 5 files, 35 tests passed.
- Rust: 59 tests passed, including 5 native Skill tests.
- TypeScript/Vite production build passed.
- Cargo check passed.
- Profile cache, Loop references, and `git diff --check` passed.

Native fixtures cover real directories, symlink copies, global/project roots,
duplicate grouping, invalid/unclosed frontmatter, snapshot writing, snapshot
failure, and real-machine discovery without a competitor CLI.

## Live Desktop Evidence

`Agent Memory Manager Dev` was opened at 1180x760 and the real Skills view was
selected through the macOS accessibility tree.

- The four summary cards showed `72 / 88 / 12 / 0`.
- Global and project scan-root chips were visible.
- Search, tool filter, read-only boundary, and AMM snapshot path were visible.
- Capability list and detail pane rendered long multilingual descriptions
  without overlap.
- The memory-specific evidence pane was absent in Skills mode.

Screenshot captured at `/tmp/amm-native-skills-final.png` for this verification
run.

## Scope Review

The task did not copy, modify, link, or delete any discovered Skill. Existing
unrelated worktree changes were preserved; no files were staged or committed.
