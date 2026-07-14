use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const MAX_DISCOVERY_DEPTH: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SkillScope {
    Global,
    Project,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SkillFilesystemKind {
    Directory,
    Symlink,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SkillHealth {
    Ready,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillRootStatus {
    pub id: String,
    pub label: String,
    pub path: String,
    pub tool: String,
    pub scope: SkillScope,
    pub exists: bool,
    pub copy_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillCopy {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub manifest_path: String,
    pub tool: String,
    pub scope: SkillScope,
    pub filesystem_kind: SkillFilesystemKind,
    pub resolved_path: String,
    pub valid: bool,
    pub issue: Option<String>,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillCapability {
    pub id: String,
    pub name: String,
    pub description: String,
    pub content_hash: String,
    pub health: SkillHealth,
    pub copy_count: usize,
    pub tools: Vec<String>,
    pub copies: Vec<SkillCopy>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInventory {
    pub generated_at: String,
    pub provider: String,
    pub snapshot_path: String,
    pub snapshot_error: Option<String>,
    pub capability_count: usize,
    pub copy_count: usize,
    pub duplicate_group_count: usize,
    pub invalid_count: usize,
    pub roots: Vec<SkillRootStatus>,
    pub capabilities: Vec<SkillCapability>,
}

#[derive(Debug, Clone)]
struct SkillRoot {
    id: String,
    label: String,
    path: PathBuf,
    tool: String,
    scope: SkillScope,
}

#[derive(Debug)]
struct ProviderDiscovery {
    roots: Vec<SkillRootStatus>,
    copies: Vec<SkillCopy>,
}

trait SkillProvider {
    fn discover(&self) -> Result<ProviderDiscovery, String>;
}

struct FilesystemSkillProvider {
    roots: Vec<SkillRoot>,
}

impl SkillProvider for FilesystemSkillProvider {
    fn discover(&self) -> Result<ProviderDiscovery, String> {
        let mut copies = Vec::new();
        let mut statuses = Vec::new();

        for root in &self.roots {
            let start = copies.len();
            let exists = root.path.is_dir();
            if exists {
                scan_root(root, &mut copies)?;
            }
            statuses.push(SkillRootStatus {
                id: root.id.clone(),
                label: root.label.clone(),
                path: path_string(&root.path),
                tool: root.tool.clone(),
                scope: root.scope.clone(),
                exists,
                copy_count: copies.len() - start,
            });
        }

        Ok(ProviderDiscovery {
            roots: statuses,
            copies,
        })
    }
}

#[tauri::command]
pub fn load_skill_inventory(
    project_root_override: Option<String>,
) -> Result<SkillInventory, String> {
    let roots = default_skill_roots(project_root_override)?;
    let snapshot_path = default_snapshot_path()?;
    build_inventory(FilesystemSkillProvider { roots }, snapshot_path)
}

fn build_inventory<P: SkillProvider>(
    provider: P,
    snapshot_path: PathBuf,
) -> Result<SkillInventory, String> {
    let discovery = provider.discover()?;
    let copy_count = discovery.copies.len();
    let invalid_count = discovery.copies.iter().filter(|copy| !copy.valid).count();
    let capabilities = group_capabilities(discovery.copies);
    let duplicate_group_count = capabilities
        .iter()
        .filter(|capability| capability.copy_count > 1)
        .count();
    let mut inventory = SkillInventory {
        generated_at: Utc::now().to_rfc3339(),
        provider: "native-filesystem".to_string(),
        snapshot_path: path_string(&snapshot_path),
        snapshot_error: None,
        capability_count: capabilities.len(),
        copy_count,
        duplicate_group_count,
        invalid_count,
        roots: discovery.roots,
        capabilities,
    };

    if let Err(error) = write_snapshot(&snapshot_path, &inventory) {
        inventory.snapshot_error = Some(error);
    }
    Ok(inventory)
}

fn default_skill_roots(project_root_override: Option<String>) -> Result<Vec<SkillRoot>, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    let mut roots = vec![
        global_root(
            "agents",
            "Agent Skills",
            &home.join(".agents/skills"),
            "Agents",
        ),
        global_root("codex", "Codex", &home.join(".codex/skills"), "Codex"),
        global_root(
            "claude",
            "Claude Code",
            &home.join(".claude/skills"),
            "Claude Code",
        ),
        global_root(
            "gemini",
            "Gemini CLI",
            &home.join(".gemini/skills"),
            "Gemini CLI",
        ),
        global_root("cursor", "Cursor", &home.join(".cursor/skills"), "Cursor"),
        global_root(
            "opencode",
            "OpenCode",
            &home.join(".config/opencode/skills"),
            "OpenCode",
        ),
    ];

    let project_root = project_root_override
        .map(|path| PathBuf::from(path.trim()))
        .filter(|path| !path.as_os_str().is_empty())
        .or_else(detect_current_project_root);
    if let Some(project_root) = project_root {
        roots.extend([
            project_root_entry("project-agents", &project_root, ".agents/skills", "Agents"),
            project_root_entry("project-codex", &project_root, ".codex/skills", "Codex"),
            project_root_entry(
                "project-claude",
                &project_root,
                ".claude/skills",
                "Claude Code",
            ),
        ]);
    }

    let mut seen = HashSet::new();
    roots.retain(|root| seen.insert(root.path.clone()));
    Ok(roots)
}

fn global_root(id: &str, label: &str, path: &Path, tool: &str) -> SkillRoot {
    SkillRoot {
        id: id.to_string(),
        label: label.to_string(),
        path: path.to_path_buf(),
        tool: tool.to_string(),
        scope: SkillScope::Global,
    }
}

fn project_root_entry(id: &str, project_root: &Path, relative: &str, tool: &str) -> SkillRoot {
    SkillRoot {
        id: id.to_string(),
        label: format!("Project · {tool}"),
        path: project_root.join(relative),
        tool: tool.to_string(),
        scope: SkillScope::Project,
    }
}

fn detect_current_project_root() -> Option<PathBuf> {
    let current = std::env::current_dir().ok()?;
    current
        .ancestors()
        .find(|candidate| {
            [".git", "AGENTS.md", "package.json"]
                .iter()
                .any(|marker| candidate.join(marker).exists())
        })
        .map(Path::to_path_buf)
}

fn scan_root(root: &SkillRoot, copies: &mut Vec<SkillCopy>) -> Result<(), String> {
    let mut manifests = Vec::new();
    collect_manifests(&root.path, 0, &mut manifests)
        .map_err(|error| format!("failed to scan Skill root {}: {error}", root.path.display()))?;
    manifests.sort();
    manifests.dedup();

    for manifest_path in manifests {
        copies.push(read_skill_copy(root, &manifest_path));
    }
    Ok(())
}

fn collect_manifests(
    directory: &Path,
    depth: usize,
    manifests: &mut Vec<PathBuf>,
) -> std::io::Result<()> {
    if depth > MAX_DISCOVERY_DEPTH {
        return Ok(());
    }

    let direct_manifest = directory.join("SKILL.md");
    if direct_manifest.is_file() {
        manifests.push(direct_manifest);
        return Ok(());
    }

    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let path = entry.path();
        if file_type.is_dir() {
            collect_manifests(&path, depth + 1, manifests)?;
        } else if file_type.is_symlink() && path.is_dir() {
            let manifest = path.join("SKILL.md");
            if manifest.is_file() {
                manifests.push(manifest);
            }
        }
    }
    Ok(())
}

fn read_skill_copy(root: &SkillRoot, manifest_path: &Path) -> SkillCopy {
    let skill_path = manifest_path.parent().unwrap_or(manifest_path);
    let filesystem_kind = fs::symlink_metadata(skill_path)
        .map(|metadata| {
            if metadata.file_type().is_symlink() {
                SkillFilesystemKind::Symlink
            } else {
                SkillFilesystemKind::Directory
            }
        })
        .unwrap_or(SkillFilesystemKind::Directory);
    let resolved_path = fs::canonicalize(skill_path).unwrap_or_else(|_| skill_path.to_path_buf());

    let mut bytes = Vec::new();
    let read_error = File::open(manifest_path)
        .and_then(|mut file| file.read_to_end(&mut bytes))
        .err();
    let content_hash = sha256_hex(&bytes);
    let text = String::from_utf8(bytes).map_err(|error| error.to_string());
    let manifest = text
        .as_deref()
        .map_err(String::from)
        .and_then(parse_manifest);
    let fallback_name = skill_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("unnamed-skill")
        .to_string();
    let (name, description, valid, issue) = match (read_error, manifest) {
        (Some(error), _) => (
            fallback_name,
            String::new(),
            false,
            Some(format!("Cannot read SKILL.md: {error}")),
        ),
        (_, Ok(manifest)) => (manifest.name, manifest.description, true, None),
        (_, Err(error)) => (fallback_name, String::new(), false, Some(error)),
    };
    let path = path_string(skill_path);

    SkillCopy {
        id: sha256_hex(path.as_bytes()),
        name,
        description,
        path,
        manifest_path: path_string(manifest_path),
        tool: root.tool.clone(),
        scope: root.scope.clone(),
        filesystem_kind,
        resolved_path: path_string(&resolved_path),
        valid,
        issue,
        content_hash,
    }
}

#[derive(Debug, PartialEq, Eq)]
struct ParsedManifest {
    name: String,
    description: String,
}

fn parse_manifest(text: &str) -> Result<ParsedManifest, String> {
    let normalized = text.trim_start_matches('\u{feff}');
    let lines: Vec<&str> = normalized.lines().collect();
    if lines.first().map(|line| line.trim()) != Some("---") {
        return Err("Missing YAML frontmatter".to_string());
    }
    let Some(end) = lines
        .iter()
        .enumerate()
        .skip(1)
        .find_map(|(index, line)| (line.trim() == "---").then_some(index))
    else {
        return Err("Unclosed YAML frontmatter".to_string());
    };
    let frontmatter = &lines[1..end];
    if frontmatter.is_empty() {
        return Err("Empty YAML frontmatter".to_string());
    }

    let name = scalar_value(&frontmatter, "name").unwrap_or_default();
    let description = scalar_value(&frontmatter, "description").unwrap_or_default();
    if name.trim().is_empty() {
        return Err("Missing frontmatter name".to_string());
    }
    if description.trim().is_empty() {
        return Err("Missing frontmatter description".to_string());
    }

    Ok(ParsedManifest { name, description })
}

fn scalar_value(lines: &[&str], key: &str) -> Option<String> {
    let prefix = format!("{key}:");
    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        let Some(value) = trimmed.strip_prefix(&prefix) else {
            continue;
        };
        let value = value.trim();
        if matches!(value, ">" | ">-" | ">+" | "|" | "|-" | "|+") {
            let folded = value.starts_with('>');
            let mut block = Vec::new();
            for continuation in lines.iter().skip(index + 1) {
                if !continuation.trim().is_empty()
                    && !continuation.starts_with(' ')
                    && !continuation.starts_with('\t')
                {
                    break;
                }
                if !continuation.trim().is_empty() {
                    block.push(continuation.trim());
                }
            }
            return Some(if folded {
                block.join(" ")
            } else {
                block.join("\n")
            });
        }
        return Some(unquote(value));
    }
    None
}

fn unquote(value: &str) -> String {
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        value[1..value.len() - 1].to_string()
    } else {
        value.to_string()
    }
}

fn group_capabilities(copies: Vec<SkillCopy>) -> Vec<SkillCapability> {
    let mut groups: BTreeMap<String, Vec<SkillCopy>> = BTreeMap::new();
    for copy in copies {
        let group_id = if copy.valid {
            copy.content_hash.clone()
        } else {
            format!("invalid-{}", copy.id)
        };
        groups.entry(group_id).or_default().push(copy);
    }

    let mut capabilities: Vec<_> = groups
        .into_iter()
        .map(|(id, mut copies)| {
            copies.sort_by(|left, right| left.path.cmp(&right.path));
            let representative = &copies[0];
            let tools: BTreeSet<_> = copies.iter().map(|copy| copy.tool.clone()).collect();
            let health = if copies.iter().all(|copy| copy.valid) {
                SkillHealth::Ready
            } else {
                SkillHealth::Invalid
            };
            SkillCapability {
                id,
                name: representative.name.clone(),
                description: representative.description.clone(),
                content_hash: representative.content_hash.clone(),
                health,
                copy_count: copies.len(),
                tools: tools.into_iter().collect(),
                copies,
            }
        })
        .collect();
    capabilities.sort_by(|left, right| left.name.cmp(&right.name).then(left.id.cmp(&right.id)));
    capabilities
}

fn default_snapshot_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory is unavailable".to_string())?;
    Ok(home.join(".agent-memory-manager/skill-inventory.json"))
}

fn write_snapshot(path: &Path, inventory: &SkillInventory) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Skill inventory snapshot has no parent directory".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    serde_json::to_writer_pretty(temporary.as_file_mut(), inventory)
        .map_err(|error| error.to_string())?;
    temporary
        .as_file_mut()
        .write_all(b"\n")
        .map_err(|error| error.to_string())?;
    temporary
        .persist(path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn path_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn parses_scalar_and_folded_frontmatter() {
        let scalar =
            parse_manifest("---\nname: demo\ndescription: \"A useful skill\"\n---\n# Demo\n")
                .unwrap();
        let folded = parse_manifest(
            "---\nname: folded\ndescription: >\n  First line.\n  Second line.\n---\n",
        )
        .unwrap();

        assert_eq!(scalar.name, "demo");
        assert_eq!(scalar.description, "A useful skill");
        assert_eq!(folded.description, "First line. Second line.");
    }

    #[test]
    fn rejects_missing_required_frontmatter() {
        assert_eq!(
            parse_manifest("# Demo").unwrap_err(),
            "Missing YAML frontmatter"
        );
        assert_eq!(
            parse_manifest("---\nname: demo\ndescription: demo\n").unwrap_err(),
            "Unclosed YAML frontmatter"
        );
        assert_eq!(
            parse_manifest("---\nname: demo\n---\n").unwrap_err(),
            "Missing frontmatter description"
        );
    }

    #[cfg(unix)]
    #[test]
    fn discovers_groups_and_snapshots_native_skills() {
        use std::os::unix::fs::symlink;

        let temp = tempdir().unwrap();
        let global = temp.path().join("global");
        let project = temp.path().join("project");
        let managed = temp.path().join("managed/demo");
        fs::create_dir_all(&managed).unwrap();
        fs::create_dir_all(project.join("demo-copy")).unwrap();
        fs::create_dir_all(global.join("broken")).unwrap();
        let manifest = "---\nname: demo\ndescription: Demo capability\n---\n";
        fs::write(managed.join("SKILL.md"), manifest).unwrap();
        fs::write(project.join("demo-copy/SKILL.md"), manifest).unwrap();
        fs::write(global.join("broken/SKILL.md"), "# broken").unwrap();
        fs::create_dir_all(&global).unwrap();
        symlink(&managed, global.join("demo-link")).unwrap();

        let provider = FilesystemSkillProvider {
            roots: vec![
                global_root("global", "Global", &global, "Agents"),
                SkillRoot {
                    id: "project".to_string(),
                    label: "Project".to_string(),
                    path: project,
                    tool: "Codex".to_string(),
                    scope: SkillScope::Project,
                },
            ],
        };
        let snapshot_path = temp.path().join("amm/skill-inventory.json");
        let inventory = build_inventory(provider, snapshot_path.clone()).unwrap();

        assert_eq!(inventory.copy_count, 3);
        assert_eq!(inventory.capability_count, 2);
        assert_eq!(inventory.duplicate_group_count, 1);
        assert_eq!(inventory.invalid_count, 1);
        let demo = inventory
            .capabilities
            .iter()
            .find(|capability| capability.name == "demo")
            .unwrap();
        assert_eq!(demo.copy_count, 2);
        assert!(demo
            .copies
            .iter()
            .any(|copy| copy.filesystem_kind == SkillFilesystemKind::Symlink));
        assert!(demo
            .copies
            .iter()
            .any(|copy| copy.scope == SkillScope::Project));
        assert!(snapshot_path.is_file());
    }

    #[test]
    fn snapshot_failure_does_not_hide_live_inventory() {
        let temp = tempdir().unwrap();
        let blocking_file = temp.path().join("not-a-directory");
        fs::write(&blocking_file, "blocked").unwrap();
        let provider = FilesystemSkillProvider { roots: Vec::new() };

        let inventory = build_inventory(provider, blocking_file.join("snapshot.json")).unwrap();

        assert_eq!(inventory.capability_count, 0);
        assert!(inventory.snapshot_error.is_some());
    }

    #[test]
    fn loads_real_inventory_without_competitor_cli() {
        let inventory = load_skill_inventory(None).unwrap();

        assert_eq!(inventory.provider, "native-filesystem");
        assert!(inventory.capability_count > 0);
        assert!(inventory.copy_count >= inventory.capability_count);
        assert!(Path::new(&inventory.snapshot_path).is_file());
    }
}
