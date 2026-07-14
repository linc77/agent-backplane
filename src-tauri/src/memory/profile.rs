use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use super::codex_audit::{build_curated_memory_bundle, CodexExecRunner, CodexExecSpec};
use super::parser::{MemoryEntry, MemoryTopic};
use super::risk::RiskFlag;
use super::scanner::{MemorySource, MemorySourceKind};

const CODEX_PROFILE_GENERATOR: &str = "codex-profile-v1";
const DETERMINISTIC_PROFILE_GENERATOR: &str = "deterministic-profile-v3";
const FALLBACK_PROFILE_GENERATOR: &str = "deterministic-profile-v3-fallback";
const PROFILE_SCHEMA_RELATIVE_PATH: &str = "schemas/memory-profile.schema.json";
const PROFILE_SCHEMA_JSON: &str = include_str!("../../../schemas/memory-profile.schema.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProfile {
    pub schema_version: String,
    pub generated_at: String,
    pub source_hash: String,
    pub generator: String,
    pub cache_path: String,
    pub sections: Vec<MemoryProfileSection>,
    pub metadata: MemoryProfileMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProfileSection {
    pub id: String,
    pub title: String,
    pub body: String,
    pub evidence: Vec<MemoryProfileEvidence>,
    pub confidence: MemoryProfileConfidence,
    pub stability: MemoryProfileStability,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProfileEvidence {
    pub source_path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MemoryProfileConfidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MemoryProfileStability {
    Stable,
    Recent,
    Uncertain,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProfileMetadata {
    pub memory_root: String,
    pub input_entries: usize,
    pub current_entries: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemoryProfileBundle {
    schema_version: String,
    memory_root: String,
    generated_at: String,
    source_hash: String,
    current_entry_ids: Vec<String>,
    risks: Vec<RiskFlag>,
    entries: Vec<super::codex_audit::CuratedMemoryBundleEntry>,
}

const MAX_DETERMINISTIC_SECTIONS: usize = 6;
const MAX_EVIDENCE_PER_SECTION: usize = 4;

const TEMPLATE_SECTION_IDS: &[&str] = &[
    "overview",
    "agent-research",
    "developer-tools",
    "learning-style",
    "content-creation",
    "career",
    "other-interests",
    "memory-details",
];

const TEMPLATE_SECTION_TITLES: &[&str] = &[
    "概览",
    "AI Agent 与长期研究方向",
    "开发工具与技术兴趣",
    "学习方式偏好",
    "内容创作与 X",
    "工作与职业发展",
    "其他兴趣",
    "记忆细节",
];

pub fn generate_memory_profile_for_root(
    root: &Path,
    sources: &[MemorySource],
    entries: &[MemoryEntry],
    risks: &[RiskFlag],
    runner: &dyn CodexExecRunner,
) -> Result<MemoryProfile, String> {
    match generate_codex_memory_profile_for_root(root, sources, entries, risks, runner) {
        Ok(profile) => Ok(profile),
        Err(err) if err.contains("cancelled") => Err(err),
        Err(_) => {
            let mut profile = build_memory_profile(root, sources, entries, risks)?;
            profile.generator = FALLBACK_PROFILE_GENERATOR.to_string();
            cache_memory_profile(root, &profile)
                .map_err(|err| format!("failed to cache fallback memory profile: {err}"))?;
            Ok(profile)
        }
    }
}

pub fn generate_codex_memory_profile_for_root(
    root: &Path,
    sources: &[MemorySource],
    entries: &[MemoryEntry],
    risks: &[RiskFlag],
    runner: &dyn CodexExecRunner,
) -> Result<MemoryProfile, String> {
    let current = current_entries(sources, entries, risks);
    let source_hash = source_hash(sources);
    let schema_path = resolve_profile_schema_path()?;
    let bundle = build_profile_bundle(root, sources, entries, risks, &current, &source_hash);
    let spec = build_codex_profile_spec(&schema_path, &bundle)?;
    run_codex_profile(
        root,
        sources,
        entries,
        &current,
        risks,
        &source_hash,
        runner,
        spec,
    )
}

pub fn load_memory_profile_for_root(
    root: &Path,
    sources: &[MemorySource],
    entries: &[MemoryEntry],
    risks: &[RiskFlag],
) -> Result<MemoryProfile, String> {
    let current = current_entries(sources, entries, risks);
    let source_hash = source_hash(sources);
    if let Some(mut profile) =
        read_cached_memory_profile(root, sources, entries, &current, &source_hash)
    {
        normalize_cached_profile(root, entries, &current, &source_hash, &mut profile);
        return Ok(profile);
    }

    build_memory_profile(root, sources, entries, risks)
}

pub fn build_memory_profile(
    root: &Path,
    sources: &[MemorySource],
    entries: &[MemoryEntry],
    risks: &[RiskFlag],
) -> Result<MemoryProfile, String> {
    let current = current_entries(sources, entries, risks);
    let source_hash = source_hash(sources);
    let cache_path = root.join(".amm/profile.json");
    let sections = build_sections(&current);
    let profile = MemoryProfile {
        schema_version: "1".to_string(),
        generated_at: Utc::now().to_rfc3339(),
        source_hash,
        generator: DETERMINISTIC_PROFILE_GENERATOR.to_string(),
        cache_path: cache_path.to_string_lossy().to_string(),
        sections,
        metadata: MemoryProfileMetadata {
            memory_root: root.to_string_lossy().to_string(),
            input_entries: entries.len(),
            current_entries: current.len(),
        },
    };

    cache_memory_profile(root, &profile)
        .map_err(|err| format!("failed to cache deterministic memory profile: {err}"))?;

    Ok(profile)
}

fn read_cached_memory_profile(
    root: &Path,
    sources: &[MemorySource],
    entries: &[MemoryEntry],
    current: &[&MemoryEntry],
    source_hash: &str,
) -> Option<MemoryProfile> {
    let cache_path = profile_cache_path(root);
    let content = fs::read_to_string(cache_path).ok()?;
    let mut profile = serde_json::from_str::<MemoryProfile>(&content).ok()?;
    if !is_supported_cached_profile_generator(&profile.generator) {
        return None;
    }
    if profile.source_hash != source_hash {
        return None;
    }
    normalize_cached_profile(root, entries, current, source_hash, &mut profile);
    validate_profile(&profile, sources).ok()?;
    Some(profile)
}

fn normalize_cached_profile(
    root: &Path,
    entries: &[MemoryEntry],
    current: &[&MemoryEntry],
    source_hash: &str,
    profile: &mut MemoryProfile,
) {
    profile.cache_path = profile_cache_path(root).to_string_lossy().to_string();
    profile.source_hash = source_hash.to_string();
    profile.metadata = MemoryProfileMetadata {
        memory_root: root.to_string_lossy().to_string(),
        input_entries: entries.len(),
        current_entries: current.len(),
    };
}

fn is_supported_cached_profile_generator(generator: &str) -> bool {
    matches!(
        generator,
        CODEX_PROFILE_GENERATOR | DETERMINISTIC_PROFILE_GENERATOR | FALLBACK_PROFILE_GENERATOR
    )
}

fn run_codex_profile(
    root: &Path,
    sources: &[MemorySource],
    entries: &[MemoryEntry],
    current: &[&MemoryEntry],
    risks: &[RiskFlag],
    source_hash: &str,
    runner: &dyn CodexExecRunner,
    spec: CodexExecSpec,
) -> Result<MemoryProfile, String> {
    let output = runner.run(&spec)?;
    if output.status_code != 0 {
        return Err(format!(
            "codex exec failed with status {}: {}",
            output.status_code,
            output.stderr.trim()
        ));
    }

    let mut profile: MemoryProfile = serde_json::from_str(output.stdout.trim())
        .map_err(|err| format!("codex exec returned invalid memory profile JSON: {err}"))?;
    normalize_codex_profile(root, entries, current, source_hash, &mut profile);
    validate_profile(&profile, sources)?;
    cache_memory_profile(root, &profile)
        .map_err(|err| format!("failed to cache codex memory profile: {err}"))?;

    let _ = risks;
    Ok(profile)
}

fn normalize_codex_profile(
    root: &Path,
    entries: &[MemoryEntry],
    current: &[&MemoryEntry],
    source_hash: &str,
    profile: &mut MemoryProfile,
) {
    profile.schema_version = "1".to_string();
    profile.generated_at = Utc::now().to_rfc3339();
    profile.source_hash = source_hash.to_string();
    profile.generator = CODEX_PROFILE_GENERATOR.to_string();
    profile.cache_path = profile_cache_path(root).to_string_lossy().to_string();
    profile.metadata = MemoryProfileMetadata {
        memory_root: root.to_string_lossy().to_string(),
        input_entries: entries.len(),
        current_entries: current.len(),
    };
}

fn build_profile_bundle(
    root: &Path,
    sources: &[MemorySource],
    entries: &[MemoryEntry],
    risks: &[RiskFlag],
    current: &[&MemoryEntry],
    source_hash: &str,
) -> MemoryProfileBundle {
    let curated = build_curated_memory_bundle(&root.to_string_lossy(), sources, entries);
    MemoryProfileBundle {
        schema_version: "1".to_string(),
        memory_root: root.to_string_lossy().to_string(),
        generated_at: Utc::now().to_rfc3339(),
        source_hash: source_hash.to_string(),
        current_entry_ids: current.iter().map(|entry| entry.id.clone()).collect(),
        risks: risks.to_vec(),
        entries: curated.entries,
    }
}

fn build_codex_profile_spec(
    schema_path: &Path,
    bundle: &MemoryProfileBundle,
) -> Result<CodexExecSpec, String> {
    let stdin = serde_json::to_string(bundle)
        .map_err(|err| format!("failed to serialize memory profile bundle: {err}"))?;
    let current_dir = std::env::temp_dir();
    let prompt = concat!(
        "Analyze this Agent Memory Manager memory bundle from stdin and return only the required Memory Profile JSON. ",
        "Write in natural Chinese, like ChatGPT Memory Summary, with coherent paragraphs rather than bullet lists or copied entry text. ",
        "First discover 4-8 durable themes from the local evidence itself; fewer sections are acceptable when evidence is sparse. ",
        "Do not use predefined category buckets or generic section titles such as 概览, AI Agent 与长期研究方向, 开发工具与技术兴趣, 学习方式偏好, 内容创作与 X, 工作与职业发展, 其他兴趣, or 记忆细节. ",
        "Each section id must be a stable kebab-case English slug derived from the discovered theme, not from a fixed template. ",
        "Each title must be a specific observation about 你, for example 你把 Codex 当成本机工程系统使用; not a taxonomy label like 开发工具与技术兴趣. ",
        "Titles must be unique, concise, and should usually fit within 28 Chinese characters. ",
        "Prefer currentEntryIds as truth. Use non-current entries only as context when not contradicted by current entries or risks. ",
        "Every section must include at least one evidence item copied from bundle sourcePath/startLine/endLine. ",
        "Do not invent facts, salaries, tools, interests, or projects that are not supported by evidence. ",
        "Do not include raw registry markers such as [Task 1], scope:, applies_to:, rollout_summaries, thread_id, or source-path metadata in titles, bodies, or evidence summaries. ",
        "Section bodies should synthesize multiple related memories into 1-2 fluent paragraphs using 你/你的, not 'the user'. ",
        "Set stability=stable for durable patterns supported by current or repeated evidence, recent for mostly recent activity, and uncertain for sparse or conflicting evidence. ",
        "If a section has weak evidence, either omit it or mark confidence low and stability uncertain. "
    );
    let args = vec![
        "exec".to_string(),
        "--cd".to_string(),
        current_dir.to_string_lossy().to_string(),
        "--skip-git-repo-check".to_string(),
        "--sandbox".to_string(),
        "read-only".to_string(),
        "--ephemeral".to_string(),
        "--output-schema".to_string(),
        schema_path.to_string_lossy().to_string(),
        prompt.to_string(),
    ];

    Ok(CodexExecSpec {
        args,
        stdin: Some(stdin),
        current_dir: Some(current_dir),
    })
}

fn validate_profile(profile: &MemoryProfile, sources: &[MemorySource]) -> Result<(), String> {
    if profile.schema_version != "1" {
        return Err("unsupported memory profile schema version".to_string());
    }

    let sources_by_path = sources
        .iter()
        .map(|source| (source.relative_path.as_str(), source))
        .collect::<HashMap<_, _>>();
    let mut ids = HashSet::new();
    let mut titles = HashSet::new();

    for section in &profile.sections {
        if section.id.trim().is_empty()
            || section.title.trim().is_empty()
            || section.body.trim().is_empty()
        {
            return Err("memory profile sections must include id, title, and body".to_string());
        }
        if contains_machine_profile_text(&section.title)
            || contains_machine_profile_text(&section.body)
        {
            return Err(format!(
                "memory profile section contains machine metadata: {}",
                section.id
            ));
        }
        if !ids.insert(section.id.clone()) {
            return Err(format!(
                "duplicate memory profile section id: {}",
                section.id
            ));
        }
        if !titles.insert(section.title.clone()) {
            return Err(format!(
                "duplicate memory profile section title: {}",
                section.title
            ));
        }
        if !is_profile_section_slug(&section.id) {
            return Err(format!("invalid memory profile section id: {}", section.id));
        }
        validate_dynamic_section(section)?;
        if section.evidence.is_empty() {
            return Err(format!(
                "memory profile section must include evidence: {}",
                section.id
            ));
        }
        for evidence in &section.evidence {
            if contains_machine_profile_text(&evidence.summary) {
                return Err(format!(
                    "memory profile evidence contains machine metadata: {}",
                    evidence.source_path
                ));
            }
            validate_profile_evidence(evidence, &sources_by_path)?;
        }
    }

    Ok(())
}

fn contains_machine_profile_text(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("scope:")
        || lower.contains("applies_to:")
        || lower.contains("rollout_summaries/")
        || lower.contains("rollout_path=")
        || lower.contains("thread_id=")
        || lower.contains("[task ")
        || lower.contains("when the user")
        || lower.contains("answer by")
        || lower.contains("rather than")
        || text.starts_with("Task ")
        || text.contains("：Task ")
        || text.contains("Symptom:")
        || text.contains("你当前被记住的是：")
        || text.contains("相关记忆显示：")
}

fn is_profile_section_slug(id: &str) -> bool {
    let bytes = id.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 80
        && bytes[0].is_ascii_alphanumeric()
        && bytes[bytes.len() - 1].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
}

fn validate_dynamic_section(section: &MemoryProfileSection) -> Result<(), String> {
    if TEMPLATE_SECTION_IDS.contains(&section.id.as_str())
        || TEMPLATE_SECTION_TITLES.contains(&section.title.as_str())
    {
        return Err(format!(
            "memory profile used a template section instead of a discovered theme: {}",
            section.title
        ));
    }

    Ok(())
}

fn validate_profile_evidence(
    evidence: &MemoryProfileEvidence,
    sources_by_path: &HashMap<&str, &MemorySource>,
) -> Result<(), String> {
    if evidence.source_path.trim().is_empty()
        || evidence.start_line == 0
        || evidence.end_line == 0
        || evidence.end_line < evidence.start_line
    {
        return Err("memory profile evidence must include source path and line range".to_string());
    }
    let Some(source) = sources_by_path.get(evidence.source_path.as_str()) else {
        return Err(format!(
            "memory profile evidence references unknown source: {}",
            evidence.source_path
        ));
    };
    if evidence.end_line > source.lines {
        return Err(format!(
            "memory profile evidence line range exceeds source length: {}",
            evidence.source_path
        ));
    }

    Ok(())
}

fn cache_memory_profile(root: &Path, profile: &MemoryProfile) -> std::io::Result<PathBuf> {
    let cache_path = profile_cache_path(root);
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_vec_pretty(profile)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;
    fs::write(&cache_path, json)?;
    Ok(cache_path)
}

pub fn invalidate_memory_profile_cache(root: &Path) -> std::io::Result<()> {
    let cache_path = profile_cache_path(root);
    match fs::remove_file(cache_path) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(err),
    }
}

fn profile_cache_path(root: &Path) -> PathBuf {
    root.join(".amm/profile.json")
}

fn resolve_profile_schema_path() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|err| err.to_string())?;
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        current_dir.join(PROFILE_SCHEMA_RELATIVE_PATH),
        current_dir.join("..").join(PROFILE_SCHEMA_RELATIVE_PATH),
        manifest_dir.join("..").join(PROFILE_SCHEMA_RELATIVE_PATH),
    ];

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(Ok)
        .unwrap_or_else(materialize_embedded_profile_schema)
}

fn materialize_embedded_profile_schema() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!(
        "amm-memory-profile-{}.schema.json",
        std::process::id()
    ));
    fs::write(&path, PROFILE_SCHEMA_JSON)
        .map_err(|err| format!("failed to materialize memory profile schema: {err}"))?;
    Ok(path)
}

fn build_sections(current: &[&MemoryEntry]) -> Vec<MemoryProfileSection> {
    let mut sections = Vec::new();
    if current.is_empty() {
        return sections;
    }
    let mut used_entry_ids = HashSet::new();

    for anchor in current.iter().copied() {
        if sections.len() >= MAX_DETERMINISTIC_SECTIONS || used_entry_ids.contains(&anchor.id) {
            continue;
        }
        let matches = related_entries(anchor, current, &used_entry_ids);
        for entry in &matches {
            used_entry_ids.insert(entry.id.clone());
        }
        let title = section_title_for_matches(&matches, &sections);
        sections.push(MemoryProfileSection {
            id: unique_section_id(anchor, &sections),
            title,
            body: section_body(matches.clone()),
            evidence: evidence_for(matches.clone()),
            confidence: confidence_for(matches.clone()),
            stability: stability_for(matches),
        });
    }

    sections
}

fn related_entries<'a>(
    anchor: &'a MemoryEntry,
    current: &'a [&'a MemoryEntry],
    used_entry_ids: &HashSet<String>,
) -> Vec<&'a MemoryEntry> {
    let anchor_terms = profile_terms(anchor);
    let mut matches = vec![anchor];
    matches.extend(
        current
            .iter()
            .copied()
            .filter(|entry| {
                entry.id != anchor.id
                    && !used_entry_ids.contains(&entry.id)
                    && shares_profile_terms(&anchor_terms, entry)
            })
            .take(MAX_EVIDENCE_PER_SECTION.saturating_sub(1)),
    );
    matches
}

fn shares_profile_terms(anchor_terms: &HashSet<String>, entry: &MemoryEntry) -> bool {
    if anchor_terms.is_empty() {
        return false;
    }

    profile_terms(entry)
        .iter()
        .any(|term| anchor_terms.contains(term.as_str()))
}

fn profile_terms(entry: &MemoryEntry) -> HashSet<String> {
    let text = format!("{} {} {}", entry.title, entry.summary, entry.search_text).to_lowercase();
    text.split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|term| is_profile_term(term))
        .map(ToString::to_string)
        .collect()
}

fn is_profile_term(term: &str) -> bool {
    let stopwords = [
        "the", "user", "users", "your", "you", "and", "for", "with", "from", "that", "this",
        "current", "memory", "profile", "summary", "project", "projects", "prefers", "uses",
    ];
    term.len() >= 3 && !stopwords.contains(&term)
}

fn unique_section_id(anchor: &MemoryEntry, sections: &[MemoryProfileSection]) -> String {
    let raw = format!("{} {}", anchor.title, anchor.summary);
    let mut base =
        section_slug(&raw).unwrap_or_else(|| section_slug(&anchor.id).unwrap_or_default());
    if base.is_empty() || TEMPLATE_SECTION_IDS.contains(&base.as_str()) {
        base = format!("observed-{}", anchor.id);
    }
    base = section_slug(&base).unwrap_or_else(|| "observed-memory".to_string());

    let existing = sections
        .iter()
        .map(|section| section.id.as_str())
        .collect::<HashSet<_>>();
    let mut candidate = base.clone();
    let mut suffix = 2;
    while existing.contains(candidate.as_str())
        || TEMPLATE_SECTION_IDS.contains(&candidate.as_str())
    {
        candidate = format!("{base}-{suffix}");
        suffix += 1;
    }
    candidate
}

fn section_slug(text: &str) -> Option<String> {
    let words = text
        .to_lowercase()
        .split(|character: char| !character.is_ascii_alphanumeric())
        .filter(|term| is_profile_term(term))
        .take(6)
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    (!words.is_empty()).then(|| words.join("-"))
}

fn section_title(anchor: &MemoryEntry) -> String {
    truncate_chars(&observation_title(anchor), 42)
}

fn section_title_for_matches(
    matches: &[&MemoryEntry],
    sections: &[MemoryProfileSection],
) -> String {
    let existing = sections
        .iter()
        .map(|section| section.title.as_str())
        .collect::<HashSet<_>>();

    for entry in matches {
        let candidate = section_title(entry);
        if !existing.contains(candidate.as_str()) {
            return candidate;
        }
    }

    matches
        .first()
        .map(|entry| duplicate_title_fallback(entry))
        .unwrap_or_else(|| "这组记忆需要保留为背景".to_string())
}

fn duplicate_title_fallback(entry: &MemoryEntry) -> String {
    match entry.topic {
        MemoryTopic::Profile => "你还有一组画像事实需要保留",
        MemoryTopic::Projects => "你还有一组项目边界记忆需要保留",
        MemoryTopic::Rules => "你还有一组协作规则需要保留",
        MemoryTopic::Tools => "你还有一组工具排查偏好需要保留",
        MemoryTopic::Writing => "你还有一组表达偏好需要保留",
        MemoryTopic::ActivityLog => "你还有一组历史背景需要保留",
        MemoryTopic::Overrides => "你还有一组修正记忆需要保留",
        MemoryTopic::Sources => "你还有一组来源线索需要保留",
        MemoryTopic::StaleRisks => "你还有一组待谨慎处理的记忆",
    }
    .to_string()
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    let limit = max_chars.saturating_sub(3);
    let mut chars = text.chars();
    let truncated = chars.by_ref().take(limit).collect::<String>();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn section_body(entries: Vec<&MemoryEntry>) -> String {
    let observations = entries
        .into_iter()
        .map(observation_for_entry)
        .filter(|observation| !observation.is_empty())
        .fold(Vec::<String>::new(), |mut unique, observation| {
            if !unique.iter().any(|existing| existing == &observation) {
                unique.push(observation);
            }
            unique
        })
        .into_iter()
        .take(3)
        .collect::<Vec<_>>();

    if observations.is_empty() {
        return String::new();
    }

    if observations.len() == 1 {
        return format!(
            "这段画像来自当前记忆里的一个稳定信号：{}。",
            trim_sentence_end(&observations[0])
        );
    }

    format!(
        "这些记忆共同指向一个模式：{}。",
        observations
            .iter()
            .map(|observation| trim_sentence_end(observation))
            .collect::<Vec<_>>()
            .join("；")
    )
}

fn observation_title(entry: &MemoryEntry) -> String {
    let text = clean_profile_text(&format!("{} {}", entry.title, entry.summary));
    let lower = text.to_lowercase();

    if lower.contains("python/rust") || text.contains("主技术栈") {
        return "你把 Python/Rust 作为当前主栈".to_string();
    }
    if lower.contains("codex") && lower.contains("local engineering") {
        return "你把 Codex 当成本机工程系统使用".to_string();
    }
    if lower.contains("skills-manager")
        || lower.contains("local skills")
        || lower.contains(".agents/skills")
        || lower.contains(".codex/skills")
    {
        return "你会核对本机技能系统的真实结构".to_string();
    }
    if lower.contains("maka-agent")
        || lower.contains("upstream")
        || lower.contains("origin")
        || lower.contains("reset --hard")
        || text.contains("更新项目")
    {
        return "你要求项目更新先确认分支安全".to_string();
    }
    if lower.contains("codex.app")
        || lower.contains("taskgated")
        || lower.contains("amfid")
        || text.contains("启动不了了")
    {
        return "你偏好用系统日志定位 Codex 启动问题".to_string();
    }
    if lower.contains("prompt residency")
        || lower.contains("evidence retention")
        || text.contains("证据留存")
    {
        return "你会区分上下文裁剪和证据留存".to_string();
    }
    if lower.contains("github connector") || lower.contains("github rest") {
        return "你希望工具失败时快速切到可用路径".to_string();
    }
    if lower.contains("interview") || text.contains("面试") || lower.contains("glossary") {
        return "你需要把 Agent 术语讲成系统链路".to_string();
    }
    if lower.contains("loop engineering") || lower.contains("harness") || text.contains("知识库")
    {
        return "你会追踪知识库里的相邻主题".to_string();
    }
    if lower.contains("release-notes") || lower.contains("changelog") || text.contains("大版本")
    {
        return "你关注版本演进背后的升级影响".to_string();
    }
    if lower.contains("computer use") || lower.contains("mcp__computer_use") {
        return "你会用低风险方式验证本机工具状态".to_string();
    }
    if lower.contains("rag") || text.contains("向量库") || text.contains("长期记忆") {
        return "你把记忆看成带状态的长期系统".to_string();
    }
    if lower.contains("x posts") || text.contains("写作") || text.contains("风格") {
        return "你希望内容表达具体而不模板".to_string();
    }

    match entry.topic {
        MemoryTopic::Profile => "你希望画像围绕真实偏好持续更新",
        MemoryTopic::Projects => "你处理项目时重视边界和可回滚路径",
        MemoryTopic::Rules => "你希望协作规则落到可执行行为",
        MemoryTopic::Tools => "你偏好用真实日志和命令判断工具问题",
        MemoryTopic::Writing => "你要的是具体批评和结构修正",
        MemoryTopic::ActivityLog => "这条活动记录更适合作为历史背景",
        MemoryTopic::Overrides => "你会用修正笔记覆盖过时记忆",
        MemoryTopic::Sources => "你需要能追溯资料来源",
        MemoryTopic::StaleRisks => "这条记忆存在过期或冲突风险",
    }
    .to_string()
}

fn observation_for_entry(entry: &MemoryEntry) -> String {
    let text = clean_profile_text(&entry.summary);
    let lower = text.to_lowercase();

    if lower.contains("python/rust") || text.contains("主技术栈") {
        return "你当前更认可 Python/Rust 作为主技术栈，旧说法需要被修正覆盖".to_string();
    }
    if lower.contains("codex") && lower.contains("local engineering") {
        return "你把 Codex 当成本机工程系统使用，并希望它的判断基于仓库、命令、日志和验证结果"
            .to_string();
    }
    if lower.contains("skills-manager")
        || lower.contains("local skills")
        || lower.contains(".agents/skills")
        || lower.contains(".codex/skills")
    {
        return "遇到本机技能系统问题时，你希望我检查真实文件系统对象，并区分软链接、真实目录和管理器数据库"
            .to_string();
    }
    if lower.contains("maka-agent")
        || lower.contains("upstream")
        || lower.contains("origin")
        || lower.contains("reset --hard")
        || text.contains("更新项目")
    {
        return "处理项目更新时，你更看重先确认 origin、upstream、分支关系和工作区状态，再选择安全刷新路径"
            .to_string();
    }
    if lower.contains("prompt residency")
        || lower.contains("evidence retention")
        || text.contains("证据留存")
    {
        return "讨论记忆裁剪时，你关心提示上下文里还能放什么，也关心原始证据是否仍可审计和追溯"
            .to_string();
    }
    if lower.contains("codex.app")
        || lower.contains("taskgated")
        || lower.contains("amfid")
        || text.contains("启动不了了")
    {
        return "排查 Codex 本机启动问题时，你要明确根因和可执行修复路径，关键证据通常来自 taskgated-helper、amfid 等系统日志"
            .to_string();
    }
    if lower.contains("github connector") || lower.contains("github rest") {
        return "当连接器或工具链失败时，你希望我及时切换到仍可验证的替代路径，而不是停在失败状态"
            .to_string();
    }
    if lower.contains("interview") || text.contains("面试") || lower.contains("glossary") {
        return "准备面试时，你需要把零散术语放回 LLM 推理、Agent 循环、工具执行、上下文记忆和评测这些系统层级里"
            .to_string();
    }
    if lower.contains("loop engineering") || lower.contains("harness") || text.contains("知识库")
    {
        return "查询知识库时，你希望先给数量和具体内容摘要；如果精确词没有命中，也要继续追踪相邻概念"
            .to_string();
    }
    if lower.contains("release-notes") || lower.contains("changelog") || text.contains("大版本")
    {
        return "分析版本变化时，你更需要大版本综合、升级影响和权威来源，而不是按时间顺序堆 changelog"
            .to_string();
    }
    if lower.contains("computer use") || lower.contains("mcp__computer_use") {
        return "验证本机工具时，你偏好先做快速、低风险的冒烟测试，并把插件注册和真实运行状态分开判断"
            .to_string();
    }
    if lower.contains("rag") || text.contains("向量库") || text.contains("长期记忆") {
        return "你会把 RAG 和记忆区分开：RAG 负责检索知识，记忆还要维护状态、范围、冲突、遗忘和证据"
            .to_string();
    }
    if lower.contains("x posts") || text.contains("写作") || text.contains("风格") {
        return "做内容表达时，你要具体结构、真实判断和可修改的论点，而不是泛泛的模板建议"
            .to_string();
    }

    topic_observation(entry)
}

fn topic_observation(entry: &MemoryEntry) -> String {
    match entry.topic {
        MemoryTopic::Profile => "这条记忆保留的是你的长期偏好或当前状态，画像需要随新证据持续更新",
        MemoryTopic::Projects => "这条记忆提醒我处理项目时要先确认边界、来源和可回滚路径",
        MemoryTopic::Rules => "这条记忆提醒我把你的偏好落实成具体协作行为，而不是停在原则描述",
        MemoryTopic::Tools => "这条记忆提醒我用真实文件、命令输出和日志来判断工具问题",
        MemoryTopic::Writing => "这条记忆提醒我给你具体批评、结构修正和表达边界，而不是机械总结",
        MemoryTopic::ActivityLog => "这条记忆更适合作为历史背景，需要避免覆盖当前事实",
        MemoryTopic::Overrides => "这条修正记忆拥有更高优先级，可以覆盖旧的画像判断",
        MemoryTopic::Sources => "这条记忆强调资料来源需要能被打开和追溯",
        MemoryTopic::StaleRisks => "这条记忆提示相关事实可能过期或互相冲突，需要谨慎呈现",
    }
    .to_string()
}

fn clean_profile_text(summary: &str) -> String {
    let without_tasks = strip_task_markers(summary);
    without_tasks
        .trim()
        .trim_start_matches("- ")
        .trim_start_matches("Memory update request:")
        .trim()
        .replace('`', "")
        .replace("The user's", "你的")
        .replace("the user's", "你的")
        .replace("The user", "你")
        .replace("the user", "你")
        .replace("when 你 asks", "当你问")
        .replace("when 你 says", "当你说")
        .replace("Symptom:", "遇到这种情况：")
        .replace(" -> ", "，要")
        .replace("answer by", "应该")
        .replace("not by", "而不是")
        .replace("do not", "不要")
        .replace("current primary stack is", "当前主技术栈是")
        .replace("primary stack is", "主技术栈是")
        .replace("prefers", "偏好")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn strip_task_markers(summary: &str) -> String {
    let mut text = summary.to_string();
    while let Some(start) = text.find("[Task ") {
        let Some(end) = text[start..].find(']') else {
            break;
        };
        text.replace_range(start..start + end + 1, "");
    }
    text
}

fn trim_sentence_end(text: &str) -> &str {
    text.trim()
        .trim_end_matches(['.', '。', '!', '！', '?', '？'])
}

fn evidence_for(entries: Vec<&MemoryEntry>) -> Vec<MemoryProfileEvidence> {
    entries
        .into_iter()
        .map(|entry| MemoryProfileEvidence {
            source_path: entry.source_path.clone(),
            start_line: entry.start_line,
            end_line: entry.end_line,
            summary: observation_for_entry(entry),
        })
        .collect()
}

fn confidence_for(entries: Vec<&MemoryEntry>) -> MemoryProfileConfidence {
    if entries.iter().any(|entry| {
        entry.topic == MemoryTopic::Overrides || entry.source_path.contains("ad_hoc/notes")
    }) {
        MemoryProfileConfidence::High
    } else if entries.len() >= 2 {
        MemoryProfileConfidence::Medium
    } else {
        MemoryProfileConfidence::Low
    }
}

fn stability_for(entries: Vec<&MemoryEntry>) -> MemoryProfileStability {
    if entries.len() >= 2
        || entries.iter().any(|entry| {
            entry.topic == MemoryTopic::Overrides || entry.source_path.contains("ad_hoc/notes")
        })
    {
        MemoryProfileStability::Stable
    } else {
        MemoryProfileStability::Uncertain
    }
}

fn current_entries<'a>(
    sources: &'a [MemorySource],
    entries: &'a [MemoryEntry],
    risks: &[RiskFlag],
) -> Vec<&'a MemoryEntry> {
    let durable = entries
        .iter()
        .filter(|entry| is_durable_current_candidate(entry, sources))
        .collect::<Vec<_>>();
    let correction_entries = durable
        .iter()
        .copied()
        .filter(|entry| has_correction_authority(entry, sources))
        .collect::<Vec<_>>();
    let risk_ids = risks
        .iter()
        .map(|risk| risk.entry_id.clone())
        .collect::<HashSet<_>>();
    let mut stale_ids = HashSet::new();

    for correction in correction_entries {
        let correction_topic = truth_topic(correction);
        for entry in &durable {
            if entry.id != correction.id
                && truth_topic(entry) == correction_topic
                && source_rank(entry, sources) > source_rank(correction, sources)
            {
                stale_ids.insert(entry.id.clone());
            }
        }
    }

    let mut current = durable
        .into_iter()
        .filter(|entry| !stale_ids.contains(&entry.id) && !risk_ids.contains(&entry.id))
        .collect::<Vec<_>>();
    current.sort_by(|left, right| {
        source_rank(left, sources)
            .cmp(&source_rank(right, sources))
            .then(left.start_line.cmp(&right.start_line))
            .then(left.id.cmp(&right.id))
    });
    current
}

fn is_durable_current_candidate(entry: &MemoryEntry, sources: &[MemorySource]) -> bool {
    let source = source_for_entry(sources, entry);
    let has_current_topic =
        is_current_topic(&entry.topic) || entry.related_topics.iter().any(is_current_topic);
    let durable_source = source
        .map(|item| is_durable_source_kind(&item.kind))
        .unwrap_or(true);

    has_current_topic && durable_source
}

fn has_correction_authority(entry: &MemoryEntry, sources: &[MemorySource]) -> bool {
    entry.topic == MemoryTopic::Overrides
        || source_for_entry(sources, entry)
            .map(|source| source.kind == MemorySourceKind::AdHocNote)
            .unwrap_or(false)
}

fn truth_topic(entry: &MemoryEntry) -> MemoryTopic {
    if entry.topic == MemoryTopic::Overrides {
        return entry
            .related_topics
            .iter()
            .find(|topic| is_current_topic(topic))
            .cloned()
            .unwrap_or(MemoryTopic::Overrides);
    }

    entry.topic.clone()
}

fn source_for_entry<'a>(
    sources: &'a [MemorySource],
    entry: &MemoryEntry,
) -> Option<&'a MemorySource> {
    sources
        .iter()
        .find(|source| source.relative_path == entry.source_path)
}

fn source_rank(entry: &MemoryEntry, sources: &[MemorySource]) -> usize {
    source_for_entry(sources, entry)
        .map(|source| source_kind_rank(&source.kind))
        .unwrap_or(usize::MAX)
}

fn source_kind_rank(kind: &MemorySourceKind) -> usize {
    match kind {
        MemorySourceKind::AdHocNote => 0,
        MemorySourceKind::Registry => 1,
        MemorySourceKind::Summary => 2,
        MemorySourceKind::Skill => 3,
        MemorySourceKind::RolloutSummary => 4,
        MemorySourceKind::Raw => 5,
        MemorySourceKind::Chronicle => 6,
    }
}

fn is_current_topic(topic: &MemoryTopic) -> bool {
    matches!(
        topic,
        MemoryTopic::Profile
            | MemoryTopic::Projects
            | MemoryTopic::Rules
            | MemoryTopic::Tools
            | MemoryTopic::Writing
            | MemoryTopic::Overrides
    )
}

fn is_durable_source_kind(kind: &MemorySourceKind) -> bool {
    matches!(
        kind,
        MemorySourceKind::Summary
            | MemorySourceKind::Registry
            | MemorySourceKind::AdHocNote
            | MemorySourceKind::Skill
    )
}

fn source_hash(sources: &[MemorySource]) -> String {
    let mut hasher = Sha256::new();
    for source in sources {
        hasher.update(source.relative_path.as_bytes());
        hasher.update(source.sha256.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::codex_audit::{CodexExecOutput, CodexExecRunner, CodexExecSpec};
    use serde_json::json;

    struct FakeRunner {
        output: CodexExecOutput,
    }

    impl CodexExecRunner for FakeRunner {
        fn run(&self, spec: &CodexExecSpec) -> Result<CodexExecOutput, String> {
            assert!(spec.args.contains(&"--sandbox".to_string()));
            assert!(spec.args.contains(&"read-only".to_string()));
            assert!(spec.args.contains(&"--ephemeral".to_string()));
            assert!(spec.args.contains(&"--output-schema".to_string()));
            assert!(spec.stdin.as_ref().is_some_and(|stdin| {
                stdin.contains("currentEntryIds") && stdin.contains("new-profile")
            }));
            Ok(self.output.clone())
        }
    }

    fn source(relative_path: &str, kind: MemorySourceKind) -> MemorySource {
        MemorySource {
            id: relative_path.to_string(),
            path: format!("/memory/{relative_path}"),
            relative_path: relative_path.to_string(),
            kind,
            modified_ms: 1,
            bytes: 128,
            lines: 4,
            sha256: format!("sha-{relative_path}"),
        }
    }

    fn entry(
        id: &str,
        topic: MemoryTopic,
        related_topics: Vec<MemoryTopic>,
        summary: &str,
        source_path: &str,
    ) -> MemoryEntry {
        MemoryEntry {
            id: id.to_string(),
            topic,
            related_topics,
            title: id.to_string(),
            summary: summary.to_string(),
            search_text: summary.to_string(),
            source_path: source_path.to_string(),
            start_line: 1,
            end_line: 3,
        }
    }

    #[test]
    fn builds_profile_from_current_correction_entries() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![
            source("MEMORY.md", MemorySourceKind::Registry),
            source(
                "extensions/ad_hoc/notes/profile.md",
                MemorySourceKind::AdHocNote,
            ),
        ];
        let entries = vec![
            entry(
                "old-profile",
                MemoryTopic::Profile,
                Vec::new(),
                "The user's primary stack is Java/Spring Boot.",
                "MEMORY.md",
            ),
            entry(
                "new-profile",
                MemoryTopic::Overrides,
                vec![MemoryTopic::Profile],
                "The user's primary stack is Python/Rust.",
                "extensions/ad_hoc/notes/profile.md",
            ),
        ];

        let profile = build_memory_profile(temp.path(), &sources, &entries, &[]).unwrap();

        assert_eq!(profile.metadata.current_entries, 1);
        assert!(profile.sections.iter().any(|section| {
            section.title.contains("Python/Rust") && section.body.contains("Python/Rust")
        }));
        assert!(profile.sections.iter().all(|section| {
            !TEMPLATE_SECTION_IDS.contains(&section.id.as_str())
                && !TEMPLATE_SECTION_TITLES.contains(&section.title.as_str())
        }));
        assert!(Path::new(&profile.cache_path).is_file());
    }

    #[test]
    fn deterministic_profile_uses_evidence_derived_sections() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source("MEMORY.md", MemorySourceKind::Registry)];
        let entries = vec![
            entry(
                "codex-local-engineering",
                MemoryTopic::Tools,
                Vec::new(),
                "The user uses Codex as a local engineering system.",
                "MEMORY.md",
            ),
            entry(
                "codex-worktree-flow",
                MemoryTopic::Projects,
                Vec::new(),
                "The user studies Codex worktree and MCP workflows.",
                "MEMORY.md",
            ),
            entry(
                "x-writing-ai",
                MemoryTopic::Writing,
                Vec::new(),
                "The user writes X posts about AI tools.",
                "MEMORY.md",
            ),
        ];

        let profile = build_memory_profile(temp.path(), &sources, &entries, &[]).unwrap();

        assert!(profile.sections.len() >= 2);
        assert!(profile.sections.iter().all(|section| {
            !TEMPLATE_SECTION_IDS.contains(&section.id.as_str())
                && !TEMPLATE_SECTION_TITLES.contains(&section.title.as_str())
                && !section.evidence.is_empty()
        }));
        assert!(profile
            .sections
            .iter()
            .any(|section| section.title.contains("Codex") && section.evidence.len() >= 2));
    }

    #[test]
    fn loads_matching_cached_profile_without_regenerating() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source(
            "extensions/ad_hoc/notes/profile.md",
            MemorySourceKind::AdHocNote,
        )];
        let entries = vec![entry(
            "new-profile",
            MemoryTopic::Overrides,
            vec![MemoryTopic::Profile],
            "The user's primary stack is Python/Rust.",
            "extensions/ad_hoc/notes/profile.md",
        )];
        let hash = source_hash(&sources);
        let cache_path = profile_cache_path(temp.path());
        fs::create_dir_all(cache_path.parent().unwrap()).unwrap();
        fs::write(
            &cache_path,
            json!({
                "schemaVersion": "1",
                "generatedAt": "2026-06-09T00:00:00Z",
                "sourceHash": hash,
                "generator": CODEX_PROFILE_GENERATOR,
                "cachePath": "ignored",
                "sections": [
                    {
                        "id": "python-rust-correction-is-current",
                        "title": "你把 Python/Rust 作为当前主栈",
                        "body": "Cached Codex profile.",
                        "evidence": [
                            {
                                "sourcePath": "extensions/ad_hoc/notes/profile.md",
                                "startLine": 1,
                                "endLine": 3,
                                "summary": "Python/Rust correction"
                            }
                        ],
                        "confidence": "high",
                        "stability": "stable"
                    }
                ],
                "metadata": {
                    "memoryRoot": "ignored",
                    "inputEntries": 0,
                    "currentEntries": 0
                }
            })
            .to_string(),
        )
        .unwrap();

        let profile = load_memory_profile_for_root(temp.path(), &sources, &entries, &[]).unwrap();

        assert_eq!(profile.generator, CODEX_PROFILE_GENERATOR);
        assert_eq!(profile.sections[0].body, "Cached Codex profile.");
        assert_eq!(profile.metadata.input_entries, 1);
        assert_eq!(profile.metadata.current_entries, 1);
    }

    #[test]
    fn invalidates_profile_cache_file() {
        let temp = tempfile::tempdir().unwrap();
        let cache_path = profile_cache_path(temp.path());
        fs::create_dir_all(cache_path.parent().unwrap()).unwrap();
        fs::write(&cache_path, "{}").unwrap();

        invalidate_memory_profile_cache(temp.path()).unwrap();

        assert!(!cache_path.exists());
        invalidate_memory_profile_cache(temp.path()).unwrap();
    }

    #[test]
    fn ignores_stale_cached_profile() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source(
            "extensions/ad_hoc/notes/profile.md",
            MemorySourceKind::AdHocNote,
        )];
        let entries = vec![entry(
            "new-profile",
            MemoryTopic::Overrides,
            vec![MemoryTopic::Profile],
            "The user's primary stack is Python/Rust.",
            "extensions/ad_hoc/notes/profile.md",
        )];
        let cache_path = profile_cache_path(temp.path());
        fs::create_dir_all(cache_path.parent().unwrap()).unwrap();
        fs::write(
            &cache_path,
            json!({
                "schemaVersion": "1",
                "generatedAt": "2026-06-09T00:00:00Z",
                "sourceHash": "stale",
                "generator": CODEX_PROFILE_GENERATOR,
                "cachePath": "ignored",
                "sections": [
                    {
                        "id": "python-rust-correction-is-current",
                        "title": "你把 Python/Rust 作为当前主栈",
                        "body": "Stale cached profile.",
                        "evidence": [
                            {
                                "sourcePath": "extensions/ad_hoc/notes/profile.md",
                                "startLine": 1,
                                "endLine": 3,
                                "summary": "Python/Rust correction"
                            }
                        ],
                        "confidence": "high",
                        "stability": "stable"
                    }
                ],
                "metadata": {
                    "memoryRoot": "ignored",
                    "inputEntries": 0,
                    "currentEntries": 0
                }
            })
            .to_string(),
        )
        .unwrap();

        let profile = load_memory_profile_for_root(temp.path(), &sources, &entries, &[]).unwrap();

        assert_eq!(profile.generator, DETERMINISTIC_PROFILE_GENERATOR);
        assert!(profile.sections[0].body.contains("Python/Rust"));
        assert!(!TEMPLATE_SECTION_IDS.contains(&profile.sections[0].id.as_str()));
        assert!(!TEMPLATE_SECTION_TITLES.contains(&profile.sections[0].title.as_str()));
    }

    #[test]
    fn ignores_cached_profile_with_machine_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source("MEMORY.md", MemorySourceKind::Registry)];
        let entries = vec![entry(
            "user-preference",
            MemoryTopic::Rules,
            Vec::new(),
            "when the user asks about local skills, answer by auditing real filesystem objects.",
            "MEMORY.md",
        )];
        let hash = source_hash(&sources);
        let cache_path = profile_cache_path(temp.path());
        fs::create_dir_all(cache_path.parent().unwrap()).unwrap();
        fs::write(
            &cache_path,
            json!({
                "schemaVersion": "1",
                "generatedAt": "2026-06-09T00:00:00Z",
                "sourceHash": hash,
                "generator": DETERMINISTIC_PROFILE_GENERATOR,
                "cachePath": "ignored",
                "sections": [
                    {
                        "id": "machine-metadata",
                        "title": "你当前被记住的是：scope: Machine-local inspection metadata",
                        "body": "相关记忆显示：rollout_summaries/2026-example.md",
                        "evidence": [
                            {
                                "sourcePath": "MEMORY.md",
                                "startLine": 1,
                                "endLine": 3,
                                "summary": "rollout_summaries/2026-example.md"
                            }
                        ],
                        "confidence": "medium",
                        "stability": "stable"
                    }
                ],
                "metadata": {
                    "memoryRoot": "ignored",
                    "inputEntries": 0,
                    "currentEntries": 0
                }
            })
            .to_string(),
        )
        .unwrap();

        let profile = load_memory_profile_for_root(temp.path(), &sources, &entries, &[]).unwrap();

        assert_eq!(profile.generator, DETERMINISTIC_PROFILE_GENERATOR);
        assert!(profile
            .sections
            .iter()
            .all(|section| !contains_machine_profile_text(&section.title)
                && !contains_machine_profile_text(&section.body)
                && section
                    .evidence
                    .iter()
                    .all(|evidence| !contains_machine_profile_text(&evidence.summary))));
        assert!(profile.sections[0].title.contains("技能系统"));
    }

    #[test]
    fn deterministic_profile_removes_task_markers_and_raw_rule_text() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source("MEMORY.md", MemorySourceKind::Registry)];
        let entries = vec![entry(
            "skill-audit-rule",
            MemoryTopic::Rules,
            Vec::new(),
            "when the user asks about local skills, answer by auditing real filesystem objects. [Task 1][Task 3]",
            "MEMORY.md",
        )];

        let profile = build_memory_profile(temp.path(), &sources, &entries, &[]).unwrap();
        let section = &profile.sections[0];

        assert!(section.title.contains("技能系统"));
        assert!(section.body.contains("真实文件系统"));
        assert!(!contains_machine_profile_text(&section.title));
        assert!(!contains_machine_profile_text(&section.body));
        assert!(section
            .evidence
            .iter()
            .all(|evidence| !contains_machine_profile_text(&evidence.summary)));
        assert!(!section.body.contains("[Task"));
        assert!(!section.body.contains("answer by"));
        assert!(!section.body.contains("when the user"));
    }

    #[test]
    fn generates_codex_profile_and_caches_it() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![
            source("MEMORY.md", MemorySourceKind::Registry),
            source(
                "extensions/ad_hoc/notes/profile.md",
                MemorySourceKind::AdHocNote,
            ),
        ];
        let entries = vec![
            entry(
                "old-profile",
                MemoryTopic::Profile,
                Vec::new(),
                "The user's primary stack is Java/Spring Boot.",
                "MEMORY.md",
            ),
            entry(
                "new-profile",
                MemoryTopic::Overrides,
                vec![MemoryTopic::Profile],
                "The user's primary stack is Python/Rust.",
                "extensions/ad_hoc/notes/profile.md",
            ),
        ];
        let output = json!({
            "schemaVersion": "1",
            "generatedAt": "ignored",
            "sourceHash": "ignored",
            "generator": "ignored",
            "cachePath": "ignored",
            "sections": [
                {
                    "id": "python-rust-overrides-old-stack",
                    "title": "你用修正记忆覆盖了旧技术栈",
                    "body": "你目前的当前记忆显示，Python/Rust 是更可信的主技术栈；旧的 Java/Spring Boot 说法已经被修正覆盖。",
                    "evidence": [
                        {
                            "sourcePath": "extensions/ad_hoc/notes/profile.md",
                            "startLine": 1,
                            "endLine": 3,
                            "summary": "Python/Rust correction"
                        }
                    ],
                    "confidence": "high",
                    "stability": "stable"
                }
            ],
            "metadata": {
                "memoryRoot": "ignored",
                "inputEntries": 0,
                "currentEntries": 0
            }
        });
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: output.to_string(),
                stderr: String::new(),
            },
        };

        let profile =
            generate_memory_profile_for_root(temp.path(), &sources, &entries, &[], &runner)
                .unwrap();

        assert_eq!(profile.generator, CODEX_PROFILE_GENERATOR);
        assert_eq!(profile.metadata.input_entries, 2);
        assert_eq!(profile.metadata.current_entries, 1);
        assert!(profile.sections[0].body.contains("修正覆盖"));
        assert!(Path::new(&profile.cache_path).is_file());
    }

    #[test]
    fn rejects_codex_template_sections_and_falls_back() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source(
            "extensions/ad_hoc/notes/profile.md",
            MemorySourceKind::AdHocNote,
        )];
        let entries = vec![entry(
            "new-profile",
            MemoryTopic::Overrides,
            vec![MemoryTopic::Profile],
            "The user's primary stack is Python/Rust.",
            "extensions/ad_hoc/notes/profile.md",
        )];
        let output = json!({
            "schemaVersion": "1",
            "generatedAt": "ignored",
            "sourceHash": "ignored",
            "generator": "ignored",
            "cachePath": "ignored",
            "sections": [
                {
                    "id": "overview",
                    "title": "概览",
                    "body": "这是模板标题，不应被当作真实画像。",
                    "evidence": [
                        {
                            "sourcePath": "extensions/ad_hoc/notes/profile.md",
                            "startLine": 1,
                            "endLine": 3,
                            "summary": "Python/Rust correction"
                        }
                    ],
                    "confidence": "high",
                    "stability": "stable"
                }
            ],
            "metadata": {
                "memoryRoot": "ignored",
                "inputEntries": 0,
                "currentEntries": 0
            }
        });
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: output.to_string(),
                stderr: String::new(),
            },
        };

        let profile =
            generate_memory_profile_for_root(temp.path(), &sources, &entries, &[], &runner)
                .unwrap();

        assert_eq!(profile.generator, FALLBACK_PROFILE_GENERATOR);
        assert!(profile.sections[0].body.contains("Python/Rust"));
        assert!(!TEMPLATE_SECTION_IDS.contains(&profile.sections[0].id.as_str()));
        assert!(!TEMPLATE_SECTION_TITLES.contains(&profile.sections[0].title.as_str()));
    }

    #[test]
    fn rejects_codex_duplicate_titles_and_falls_back() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source(
            "extensions/ad_hoc/notes/profile.md",
            MemorySourceKind::AdHocNote,
        )];
        let entries = vec![entry(
            "new-profile",
            MemoryTopic::Overrides,
            vec![MemoryTopic::Profile],
            "The user's primary stack is Python/Rust.",
            "extensions/ad_hoc/notes/profile.md",
        )];
        let output = json!({
            "schemaVersion": "1",
            "generatedAt": "ignored",
            "sourceHash": "ignored",
            "generator": "ignored",
            "cachePath": "ignored",
            "sections": [
                {
                    "id": "python-rust-current-stack",
                    "title": "你把 Python/Rust 作为当前主栈",
                    "body": "你当前更认可 Python/Rust 作为主技术栈。",
                    "evidence": [
                        {
                            "sourcePath": "extensions/ad_hoc/notes/profile.md",
                            "startLine": 1,
                            "endLine": 3,
                            "summary": "Python/Rust correction"
                        }
                    ],
                    "confidence": "high",
                    "stability": "stable"
                },
                {
                    "id": "python-rust-correction",
                    "title": "你把 Python/Rust 作为当前主栈",
                    "body": "旧的 Java/Spring Boot 说法已经被修正覆盖。",
                    "evidence": [
                        {
                            "sourcePath": "extensions/ad_hoc/notes/profile.md",
                            "startLine": 1,
                            "endLine": 3,
                            "summary": "Python/Rust correction"
                        }
                    ],
                    "confidence": "high",
                    "stability": "stable"
                }
            ],
            "metadata": {
                "memoryRoot": "ignored",
                "inputEntries": 0,
                "currentEntries": 0
            }
        });
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: output.to_string(),
                stderr: String::new(),
            },
        };

        let profile =
            generate_memory_profile_for_root(temp.path(), &sources, &entries, &[], &runner)
                .unwrap();

        assert_eq!(profile.generator, FALLBACK_PROFILE_GENERATOR);
        assert!(profile.sections[0].title.contains("Python/Rust"));
    }

    #[test]
    fn strict_codex_profile_generation_returns_error_without_fallback() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source(
            "extensions/ad_hoc/notes/profile.md",
            MemorySourceKind::AdHocNote,
        )];
        let entries = vec![entry(
            "new-profile",
            MemoryTopic::Overrides,
            vec![MemoryTopic::Profile],
            "The user's primary stack is Python/Rust.",
            "extensions/ad_hoc/notes/profile.md",
        )];
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 1,
                stdout: String::new(),
                stderr: "codex unavailable".to_string(),
            },
        };

        let err =
            generate_codex_memory_profile_for_root(temp.path(), &sources, &entries, &[], &runner)
                .unwrap_err();

        assert!(err.contains("codex exec failed"));
        assert!(!profile_cache_path(temp.path()).exists());
    }

    #[test]
    fn falls_back_to_deterministic_profile_when_codex_fails() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![
            source("MEMORY.md", MemorySourceKind::Registry),
            source(
                "extensions/ad_hoc/notes/profile.md",
                MemorySourceKind::AdHocNote,
            ),
        ];
        let entries = vec![entry(
            "new-profile",
            MemoryTopic::Overrides,
            vec![MemoryTopic::Profile],
            "The user's primary stack is Python/Rust.",
            "extensions/ad_hoc/notes/profile.md",
        )];
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 1,
                stdout: String::new(),
                stderr: "codex unavailable".to_string(),
            },
        };

        let profile =
            generate_memory_profile_for_root(temp.path(), &sources, &entries, &[], &runner)
                .unwrap();

        assert_eq!(profile.generator, FALLBACK_PROFILE_GENERATOR);
        assert!(profile.sections[0].body.contains("Python/Rust"));
        assert!(!TEMPLATE_SECTION_IDS.contains(&profile.sections[0].id.as_str()));
        assert!(!TEMPLATE_SECTION_TITLES.contains(&profile.sections[0].title.as_str()));
    }

    #[test]
    fn falls_back_to_deterministic_profile_when_codex_times_out() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source(
            "extensions/ad_hoc/notes/profile.md",
            MemorySourceKind::AdHocNote,
        )];
        let entries = vec![entry(
            "new-profile",
            MemoryTopic::Overrides,
            vec![MemoryTopic::Profile],
            "The user's primary stack is Python/Rust.",
            "extensions/ad_hoc/notes/profile.md",
        )];
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: -1,
                stdout: String::new(),
                stderr: "codex exec timed out after 120 seconds".to_string(),
            },
        };

        let profile =
            generate_memory_profile_for_root(temp.path(), &sources, &entries, &[], &runner)
                .unwrap();

        assert_eq!(profile.generator, FALLBACK_PROFILE_GENERATOR);
        assert!(profile.sections[0].title.contains("Python/Rust"));
    }

    #[test]
    fn excludes_risk_entries_from_profile_sections() {
        let temp = tempfile::tempdir().unwrap();
        let sources = vec![source("MEMORY.md", MemorySourceKind::Registry)];
        let entries = vec![entry(
            "old-profile",
            MemoryTopic::Profile,
            Vec::new(),
            "The user's primary stack is Java/Spring Boot.",
            "MEMORY.md",
        )];
        let risks = vec![RiskFlag {
            id: "risk".to_string(),
            kind: super::super::risk::RiskKind::StaleConflict,
            title: "Stack conflict".to_string(),
            detail: "Needs review.".to_string(),
            entry_id: "old-profile".to_string(),
        }];

        let profile = build_memory_profile(temp.path(), &sources, &entries, &risks).unwrap();

        assert!(profile.sections.is_empty());
    }
}
