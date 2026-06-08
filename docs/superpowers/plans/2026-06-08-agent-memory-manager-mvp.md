# Agent Memory Manager MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-first Tauri desktop app that scans local Codex memory files, shows them as a Knowledge Board, and safely writes correction notes.

**Architecture:** Tauri 2 hosts a React/Vite/TypeScript frontend and a Rust backend. Rust owns local filesystem access, memory scanning, markdown parsing, risk detection, and safe correction-note writes. The frontend calls Tauri commands through `@tauri-apps/api/core`, renders topic cards, source excerpts, stale-risk signals, and a correction-note draft flow.

**Tech Stack:** Tauri 2, Rust 2021, React 18, TypeScript, Vite, Tailwind CSS, lucide-react, React Query, CodeMirror, rusqlite, serde, chrono, sha2, tempfile.

---

## File Structure

- `package.json`: frontend and Tauri scripts.
- `src-tauri/Cargo.toml`: Rust backend dependencies.
- `src-tauri/tauri.conf.json`: app identity, window, build commands.
- `src-tauri/src/lib.rs`: Tauri builder and command registration.
- `src-tauri/src/main.rs`: desktop entrypoint.
- `src-tauri/src/memory/mod.rs`: memory module exports.
- `src-tauri/src/memory/paths.rs`: default and override memory path resolution.
- `src-tauri/src/memory/scanner.rs`: source file discovery and metadata.
- `src-tauri/src/memory/parser.rs`: markdown section extraction and topic assignment.
- `src-tauri/src/memory/risk.rs`: deterministic stale/conflict risk flags.
- `src-tauri/src/memory/correction.rs`: draft and atomic write for ad-hoc notes.
- `src-tauri/src/memory/commands.rs`: Tauri command DTOs and command functions.
- `src/lib/api.ts`: typed frontend wrappers around Tauri commands.
- `src/lib/types.ts`: frontend data types.
- `src/App.tsx`: app shell, query wiring, selected topic/source state.
- `src/components/Sidebar.tsx`: topic navigation.
- `src/components/KnowledgeBoard.tsx`: topic cards and risk preview.
- `src/components/Inspector.tsx`: selected entry/source detail and correction draft actions.
- `src/components/CorrectionDialog.tsx`: preview and confirm safe write.
- `src/index.css`: macOS-style layout, Tailwind layers.
- `docs/superpowers/specs/2026-06-08-agent-memory-manager-design.md`: product design spec.

## Task 1: Scaffold Tauri App

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`

- [ ] **Step 1: Scaffold the app shell**

Run:

```bash
cd /Users/qsh/Documents/work/agent-memory-manager
pnpm create tauri-app@2 . --template react-ts --manager pnpm
```

Expected: project contains `src/`, `src-tauri/`, `package.json`, `vite.config.ts`, and Tauri config.

- [ ] **Step 2: Install MVP UI/runtime dependencies**

Run:

```bash
pnpm add @tauri-apps/api @tanstack/react-query lucide-react @codemirror/lang-markdown @codemirror/view @codemirror/state codemirror
pnpm add -D tailwindcss postcss autoprefixer vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
pnpm dlx tailwindcss init -p
```

Expected: dependencies appear in `package.json`; `tailwind.config.js` and `postcss.config.js` exist.

- [ ] **Step 3: Configure app identity**

Modify `src-tauri/tauri.conf.json` so the app identity matches the project:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Agent Memory Manager",
  "version": "0.1.0",
  "identifier": "com.linc.agent-memory-manager",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "Agent Memory Manager",
        "width": 1180,
        "height": 760,
        "minWidth": 980,
        "minHeight": 640,
        "center": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "macOS": {
      "minimumSystemVersion": "12.0"
    }
  }
}
```

- [ ] **Step 4: Verify scaffold builds**

Run:

```bash
pnpm typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: both commands pass before feature code starts.

- [ ] **Step 5: Commit scaffold**

Run:

```bash
git add package.json pnpm-lock.yaml index.html vite.config.ts tsconfig*.json src src-tauri tailwind.config.js postcss.config.js
git commit -m "chore: scaffold agent memory manager"
```

## Task 2: Rust Memory Source Scanner

**Files:**
- Create: `src-tauri/src/memory/mod.rs`
- Create: `src-tauri/src/memory/paths.rs`
- Create: `src-tauri/src/memory/scanner.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add Rust dependencies**

Modify `src-tauri/Cargo.toml` dependencies:

```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
sha2 = "0.10"
thiserror = "2"
tempfile = "3"
```

- [ ] **Step 2: Create memory module exports**

Create `src-tauri/src/memory/mod.rs`:

```rust
pub mod commands;
pub mod correction;
pub mod parser;
pub mod paths;
pub mod risk;
pub mod scanner;
```

- [ ] **Step 3: Implement path resolution**

Create `src-tauri/src/memory/paths.rs`:

```rust
use std::path::PathBuf;

pub fn default_memory_root() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".codex")
        .join("memories")
}

pub fn resolve_memory_root(override_path: Option<String>) -> PathBuf {
    override_path
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_memory_root)
}
```

- [ ] **Step 4: Implement source scanner**

Create `src-tauri/src/memory/scanner.rs` with:

```rust
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum MemorySourceKind {
    Summary,
    Registry,
    Raw,
    RolloutSummary,
    AdHocNote,
    Chronicle,
    Skill,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySource {
    pub id: String,
    pub path: String,
    pub relative_path: String,
    pub kind: MemorySourceKind,
    pub modified_ms: u128,
    pub bytes: u64,
    pub lines: usize,
    pub sha256: String,
}

pub fn scan_sources(root: &Path) -> std::io::Result<Vec<MemorySource>> {
    let mut sources = Vec::new();
    collect_if_file(root, root, "memory_summary.md", MemorySourceKind::Summary, &mut sources)?;
    collect_if_file(root, root, "MEMORY.md", MemorySourceKind::Registry, &mut sources)?;
    collect_if_file(root, root, "raw_memories.md", MemorySourceKind::Raw, &mut sources)?;
    collect_dir(root, &root.join("rollout_summaries"), MemorySourceKind::RolloutSummary, &mut sources)?;
    collect_dir(root, &root.join("extensions/ad_hoc/notes"), MemorySourceKind::AdHocNote, &mut sources)?;
    collect_dir(root, &root.join("extensions/chronicle/resources"), MemorySourceKind::Chronicle, &mut sources)?;
    collect_skill_files(root, &root.join("skills"), &mut sources)?;
    sources.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(sources)
}

fn collect_if_file(
    root: &Path,
    base: &Path,
    name: &str,
    kind: MemorySourceKind,
    out: &mut Vec<MemorySource>,
) -> std::io::Result<()> {
    let path = base.join(name);
    if path.is_file() {
        out.push(read_source(root, &path, kind)?);
    }
    Ok(())
}

fn collect_dir(
    root: &Path,
    dir: &Path,
    kind: MemorySourceKind,
    out: &mut Vec<MemorySource>,
) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
            out.push(read_source(root, &path, kind.clone())?);
        }
    }
    Ok(())
}

fn collect_skill_files(root: &Path, dir: &Path, out: &mut Vec<MemorySource>) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path().join("SKILL.md");
        if path.is_file() {
            out.push(read_source(root, &path, MemorySourceKind::Skill)?);
        }
    }
    Ok(())
}

fn read_source(root: &Path, path: &Path, kind: MemorySourceKind) -> std::io::Result<MemorySource> {
    let text = fs::read_to_string(path)?;
    let metadata = fs::metadata(path)?;
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let sha256 = format!("{:x}", Sha256::digest(text.as_bytes()));
    let relative_path = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    Ok(MemorySource {
        id: sha256.chars().take(16).collect(),
        path: path.to_string_lossy().to_string(),
        relative_path,
        kind,
        modified_ms,
        bytes: metadata.len(),
        lines: text.lines().count(),
        sha256,
    })
}
```

- [ ] **Step 5: Add scanner tests**

Add tests in `scanner.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_known_memory_sources() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(root.join("MEMORY.md"), "# Task Group: Example\n").unwrap();
        fs::create_dir_all(root.join("extensions/ad_hoc/notes")).unwrap();
        fs::write(root.join("extensions/ad_hoc/notes/one.md"), "Memory update request:\n").unwrap();

        let sources = scan_sources(root).unwrap();

        assert_eq!(sources.len(), 2);
        assert!(sources.iter().any(|source| source.kind == MemorySourceKind::Registry));
        assert!(sources.iter().any(|source| source.kind == MemorySourceKind::AdHocNote));
    }
}
```

- [ ] **Step 6: Run scanner tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml memory::scanner -- --nocapture
```

Expected: scanner tests pass.

## Task 3: Parser and Risk Flags

**Files:**
- Create: `src-tauri/src/memory/parser.rs`
- Create: `src-tauri/src/memory/risk.rs`

- [ ] **Step 1: Implement parser types and section extraction**

Create `src-tauri/src/memory/parser.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum MemoryTopic {
    Profile,
    Projects,
    Rules,
    Tools,
    Writing,
    Overrides,
    Sources,
    StaleRisks,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub id: String,
    pub topic: MemoryTopic,
    pub title: String,
    pub summary: String,
    pub source_path: String,
    pub start_line: usize,
    pub end_line: usize,
}

pub fn parse_entries(relative_path: &str, text: &str) -> Vec<MemoryEntry> {
    let mut entries = Vec::new();
    let mut current_title = String::from("Document");
    let mut current_start = 1usize;
    let mut current_lines = Vec::new();

    for (idx, line) in text.lines().enumerate() {
        let line_no = idx + 1;
        if line.starts_with("# ") || line.starts_with("## ") {
            flush_entry(relative_path, &current_title, current_start, line_no.saturating_sub(1), &current_lines, &mut entries);
            current_title = line.trim_start_matches('#').trim().to_string();
            current_start = line_no;
            current_lines.clear();
        }
        current_lines.push(line.to_string());
    }
    flush_entry(relative_path, &current_title, current_start, text.lines().count().max(current_start), &current_lines, &mut entries);
    entries
}

fn flush_entry(
    relative_path: &str,
    title: &str,
    start_line: usize,
    end_line: usize,
    lines: &[String],
    out: &mut Vec<MemoryEntry>,
) {
    let body = lines.join("\n");
    let summary = body
        .lines()
        .find(|line| !line.trim().is_empty() && !line.starts_with('#'))
        .unwrap_or(title)
        .trim()
        .chars()
        .take(220)
        .collect::<String>();
    if summary.trim().is_empty() {
        return;
    }
    let topic = infer_topic(relative_path, title, &body);
    let id = format!("{}:{}-{}", relative_path, start_line, end_line);
    out.push(MemoryEntry {
        id,
        topic,
        title: title.to_string(),
        summary,
        source_path: relative_path.to_string(),
        start_line,
        end_line,
    });
}

fn infer_topic(path: &str, title: &str, body: &str) -> MemoryTopic {
    let text = format!("{} {} {}", path, title, body).to_lowercase();
    if path.contains("ad_hoc/notes") || text.contains("memory update request") {
        MemoryTopic::Overrides
    } else if text.contains("user profile") || text.contains("技术栈") || text.contains("primary technical stack") {
        MemoryTopic::Profile
    } else if text.contains("project") || text.contains("beebotos") || text.contains("sub2api") || text.contains("dilidili") {
        MemoryTopic::Projects
    } else if text.contains("preference") || text.contains("规则") || text.contains("中文输出") {
        MemoryTopic::Rules
    } else if text.contains("codex") || text.contains("mcp") || text.contains("skills") || text.contains("openai") {
        MemoryTopic::Tools
    } else if text.contains("writing") || text.contains("公众号") || text.contains("写作") {
        MemoryTopic::Writing
    } else {
        MemoryTopic::Sources
    }
}
```

- [ ] **Step 2: Implement deterministic risk flags**

Create `src-tauri/src/memory/risk.rs`:

```rust
use serde::{Deserialize, Serialize};

use super::parser::MemoryEntry;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RiskKind {
    StaleConflict,
    CoveredByOverride,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskFlag {
    pub id: String,
    pub kind: RiskKind,
    pub title: String,
    pub detail: String,
    pub entry_id: String,
}

pub fn detect_risks(entries: &[MemoryEntry]) -> Vec<RiskFlag> {
    let text = entries
        .iter()
        .map(|entry| format!("{} {}", entry.title, entry.summary))
        .collect::<Vec<_>>()
        .join("\n")
        .to_lowercase();
    let mut flags = Vec::new();

    if text.contains("java") && text.contains("spring boot") && text.contains("python/rust") {
        if let Some(entry) = entries.iter().find(|entry| {
            let value = format!("{} {}", entry.title, entry.summary).to_lowercase();
            value.contains("java") || value.contains("spring boot")
        }) {
            flags.push(RiskFlag {
                id: "profile-stack-conflict".to_string(),
                kind: RiskKind::StaleConflict,
                title: "Profile stack conflict".to_string(),
                detail: "Old Java/Spring Boot profile conflicts with newer Python/Rust override.".to_string(),
                entry_id: entry.id.clone(),
            });
        }
    }

    if text.contains("dilidili") && text.contains("no longer an active project") {
        if let Some(entry) = entries.iter().find(|entry| entry.summary.to_lowercase().contains("dilidili")) {
            flags.push(RiskFlag {
                id: "dilidili-active-project-conflict".to_string(),
                kind: RiskKind::CoveredByOverride,
                title: "Project activity override".to_string(),
                detail: "`dilidili` appears in older project memory but is covered by a newer inactive-project override.".to_string(),
                entry_id: entry.id.clone(),
            });
        }
    }

    flags
}
```

- [ ] **Step 3: Add parser/risk tests**

Add tests to `parser.rs` and `risk.rs` proving topic inference and stack conflict detection.

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml memory::parser memory::risk -- --nocapture
```

Expected: parser and risk tests pass.

## Task 4: Correction Note Safe Write

**Files:**
- Create: `src-tauri/src/memory/correction.rs`

- [ ] **Step 1: Implement draft and atomic write**

Create `src-tauri/src/memory/correction.rs`:

```rust
use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorrectionDraft {
    pub slug: String,
    pub content: String,
    pub target_path: String,
}

pub fn draft_correction(memory_root: &Path, slug: &str, bullet_lines: &[String]) -> CorrectionDraft {
    let timestamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let safe_slug = slug
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let filename = format!("{}-{}.md", timestamp, safe_slug);
    let target = memory_root.join("extensions/ad_hoc/notes").join(filename);
    let mut content = String::from("Memory update request:\n\n");
    for line in bullet_lines {
        content.push_str("- ");
        content.push_str(line.trim());
        content.push('\n');
    }
    CorrectionDraft {
        slug: safe_slug,
        content,
        target_path: target.to_string_lossy().to_string(),
    }
}

pub fn write_correction_note(draft: &CorrectionDraft, memory_root: &Path) -> std::io::Result<PathBuf> {
    let target = PathBuf::from(&draft.target_path);
    let allowed_dir = memory_root.join("extensions/ad_hoc/notes");
    fs::create_dir_all(&allowed_dir)?;
    if !target.starts_with(&allowed_dir) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "correction notes can only be written under extensions/ad_hoc/notes",
        ));
    }
    let tmp = target.with_extension("md.tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(draft.content.as_bytes())?;
        file.sync_all()?;
    }
    fs::rename(tmp, &target)?;
    Ok(target)
}
```

- [ ] **Step 2: Add safe-write tests**

Add tests proving writes under `extensions/ad_hoc/notes` pass and writes outside it fail.

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml memory::correction -- --nocapture
```

Expected: safe-write tests pass.

## Task 5: Tauri Commands

**Files:**
- Create: `src-tauri/src/memory/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Expose command DTOs**

Create `src-tauri/src/memory/commands.rs` with command functions:

```rust
use serde::{Deserialize, Serialize};
use std::fs;

use super::correction::{draft_correction as build_draft, write_correction_note, CorrectionDraft};
use super::parser::{parse_entries, MemoryEntry, MemoryTopic};
use super::paths::resolve_memory_root;
use super::risk::{detect_risks, RiskFlag};
use super::scanner::{scan_sources, MemorySource};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub root: String,
    pub sources: Vec<MemorySource>,
    pub entries: Vec<MemoryEntry>,
    pub risks: Vec<RiskFlag>,
}

#[tauri::command]
pub fn scan_memories(root_override: Option<String>) -> Result<ScanResult, String> {
    let root = resolve_memory_root(root_override);
    let sources = scan_sources(&root).map_err(|err| err.to_string())?;
    let mut entries = Vec::new();
    for source in &sources {
        let text = fs::read_to_string(&source.path).map_err(|err| err.to_string())?;
        entries.extend(parse_entries(&source.relative_path, &text));
    }
    let risks = detect_risks(&entries);
    Ok(ScanResult {
        root: root.to_string_lossy().to_string(),
        sources,
        entries,
        risks,
    })
}

#[tauri::command]
pub fn get_source_excerpt(path: String, start_line: usize, end_line: usize) -> Result<String, String> {
    let text = fs::read_to_string(path).map_err(|err| err.to_string())?;
    let lines = text
        .lines()
        .enumerate()
        .filter_map(|(idx, line)| {
            let line_no = idx + 1;
            (line_no >= start_line && line_no <= end_line).then(|| line.to_string())
        })
        .collect::<Vec<_>>();
    Ok(lines.join("\n"))
}

#[tauri::command]
pub fn draft_correction(root_override: Option<String>, slug: String, bullet_lines: Vec<String>) -> Result<CorrectionDraft, String> {
    let root = resolve_memory_root(root_override);
    Ok(build_draft(&root, &slug, &bullet_lines))
}

#[tauri::command]
pub fn write_correction(root_override: Option<String>, draft: CorrectionDraft) -> Result<String, String> {
    let root = resolve_memory_root(root_override);
    let path = write_correction_note(&draft, &root).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
```

- [ ] **Step 2: Register commands**

Modify `src-tauri/src/lib.rs`:

```rust
mod memory;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            memory::commands::scan_memories,
            memory::commands::get_source_excerpt,
            memory::commands::draft_correction,
            memory::commands::write_correction,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify commands compile**

Run:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: Rust backend compiles.

## Task 6: Frontend API and UI

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/api.ts`
- Create: `src/components/Sidebar.tsx`
- Create: `src/components/KnowledgeBoard.tsx`
- Create: `src/components/Inspector.tsx`
- Create: `src/components/CorrectionDialog.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add typed API wrapper**

Create `src/lib/api.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { CorrectionDraft, ScanResult } from "./types";

export function scanMemories(rootOverride?: string | null) {
  return invoke<ScanResult>("scan_memories", { rootOverride });
}

export function getSourceExcerpt(path: string, startLine: number, endLine: number) {
  return invoke<string>("get_source_excerpt", { path, startLine, endLine });
}

export function draftCorrection(rootOverride: string | null, slug: string, bulletLines: string[]) {
  return invoke<CorrectionDraft>("draft_correction", { rootOverride, slug, bulletLines });
}

export function writeCorrection(rootOverride: string | null, draft: CorrectionDraft) {
  return invoke<string>("write_correction", { rootOverride, draft });
}
```

- [ ] **Step 2: Add frontend types**

Create `src/lib/types.ts` with the DTOs matching Rust serialize output.

- [ ] **Step 3: Build the app shell**

Replace `src/App.tsx` with a three-column layout: sidebar, knowledge board, inspector.

- [ ] **Step 4: Build topic board and inspector**

Implement topic filtering, search, entry selection, risk badge display, and source excerpt preview.

- [ ] **Step 5: Build correction dialog**

Implement correction draft preview and confirm write. After successful write, re-run `scanMemories`.

- [ ] **Step 6: Verify frontend**

Run:

```bash
pnpm typecheck
pnpm build
```

Expected: frontend compiles and bundles.

## Task 7: Live Verification

**Files:**
- No new files unless fixes are required.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
cargo check --manifest-path src-tauri/Cargo.toml
pnpm typecheck
pnpm build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Start the desktop app**

Run:

```bash
pnpm tauri dev
```

Expected: Agent Memory Manager opens and scans `$HOME/.codex/memories`.

- [ ] **Step 3: Manual MVP verification**

Verify:

- `Profile` topic shows entries related to user profile.
- Search for `dilidili` returns sources and stale-risk context.
- Search for `Python/Rust` returns the latest ad-hoc override.
- Correction draft previews the target path under `extensions/ad_hoc/notes`.
- Confirmed correction writes only under `extensions/ad_hoc/notes`.

- [ ] **Step 4: Commit MVP**

Run:

```bash
git add .
git commit -m "feat: build agent memory manager mvp"
```

## Self-Review

- Spec coverage: the plan covers Tauri app shell, memory source scan, topic parsing, deterministic stale-risk flags, Knowledge Board UI, Inspector, and safe correction-note writes.
- Placeholder scan: no task depends on unspecified external behavior; all write boundaries are explicit.
- Type consistency: Rust command names match frontend `invoke()` wrappers: `scan_memories`, `get_source_excerpt`, `draft_correction`, `write_correction`.
