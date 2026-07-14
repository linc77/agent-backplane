# Skill Inventory Contract

## 1. Scope / Trigger

Use this contract when changing native Skill roots, manifest parsing, logical
identity, copy evidence, AMM snapshots, or the Tauri/frontend payload. External
providers must adapt into this contract and must not become the source of truth.

## 2. Signatures

```rust
#[tauri::command]
pub fn load_skill_inventory(
    project_root_override: Option<String>,
) -> Result<SkillInventory, String>;

trait SkillProvider {
    fn discover(&self) -> Result<ProviderDiscovery, String>;
}
```

Frontend:

```ts
loadSkillInventory(projectRootOverride: string | null = null): Promise<SkillInventory>
```

## 3. Contracts

- Request: optional project root; blank values behave as absent.
- `SkillRootStatus`: declared path, tool, scope, existence, copy count.
- `SkillCopy`: filesystem exposure path, manifest path, tool, scope, filesystem
  kind, resolved path, validity, issue, and manifest content hash.
- `SkillCapability`: exact-content group with aggregate health, tools, and copy
  evidence.
- `SkillInventory`: generated time, provider id, snapshot metadata, summary
  counts, roots, and capabilities.
- Snapshot: `~/.agent-memory-manager/skill-inventory.json`.
- Serialization: Rust fields cross Tauri as camelCase.

## 4. Validation & Error Matrix

- Home directory unavailable -> command error.
- Declared existing root unreadable -> command error naming that root.
- Missing/unclosed frontmatter -> visible invalid `SkillCopy`, not scan failure.
- Missing `name` or `description` -> visible invalid `SkillCopy`.
- Invalid UTF-8/unreadable manifest -> visible invalid `SkillCopy`.
- Snapshot write failure -> live inventory plus `snapshotError`.
- Missing root -> `exists=false`, zero copies, no command failure.

## 5. Good / Base / Bad Cases

- Good: identical manifests exposed by Agents and Codex -> one capability, two
  copies, both tools preserved.
- Base: one valid real directory -> one capability and one copy.
- Bad: broken manifest -> one invalid capability with issue and path evidence.
- Bad: external manager missing -> no behavior change; native roots still load.

## 6. Tests Required

- Parse scalar, quoted, folded, and literal frontmatter values.
- Reject missing/unclosed frontmatter and missing required fields.
- Discover real directories and directory symlinks without recursive link
  traversal.
- Group identical content across global/project roots.
- Keep invalid manifests separate rather than grouping all broken files.
- Write the AMM snapshot and preserve live results on snapshot failure.
- Exercise real-machine discovery without a competitor CLI.
- Verify TypeScript fixture capability/copy counts and Tauri invocation args.

## 7. Wrong vs Correct

### Wrong

```rust
Command::new("skills-manager-cli").args(["skills", "list"])
```

This makes a competitor schema and installation part of AMM's runtime.

### Correct

```rust
let discovery = FilesystemSkillProvider { roots }.discover()?;
let capabilities = group_capabilities(discovery.copies);
```

AMM owns discovery identity and lets future providers adapt to the same model.
