#![allow(dead_code)]

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use chrono::Utc;
use serde::{Deserialize, Serialize};

use super::parser::{parse_entries, MemoryEntry, MemoryTopic};
use super::scanner::{scan_sources, MemorySource, MemorySourceKind};

const BUNDLE_SCHEMA_VERSION: &str = "1";
const BUNDLE_TEXT_LIMIT: usize = 4_000;
const CODEX_EXEC_TIMEOUT: Duration = Duration::from_secs(120);
const REPORT_SCHEMA_RELATIVE_PATH: &str = "schemas/current-memory-report.schema.json";
const REPORT_SCHEMA_JSON: &str = include_str!("../../../schemas/current-memory-report.schema.json");

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexAuditReport {
    pub schema_version: String,
    pub mode: CodexAuditMode,
    pub generated_at: String,
    pub summary: String,
    pub current_claims: Vec<MemoryClaim>,
    pub stale_claims: Vec<MemoryClaim>,
    pub conflicts: Vec<MemoryConflict>,
    pub uncertain_claims: Vec<MemoryClaim>,
    pub suggested_corrections: Vec<SuggestedCorrection>,
    pub metadata: CodexAuditMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum CodexAuditMode {
    Curated,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryClaim {
    pub id: String,
    pub subject: String,
    pub field: String,
    pub value: String,
    pub scope: ClaimScope,
    pub status: ClaimStatus,
    pub confidence: f64,
    pub rationale: String,
    pub evidence: Vec<EvidenceRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum ClaimScope {
    Global,
    Project,
    Tool,
    Writing,
    Rule,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub enum ClaimStatus {
    Current,
    Stale,
    Historical,
    Uncertain,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryConflict {
    pub id: String,
    pub title: String,
    pub detail: String,
    pub confidence: f64,
    #[serde(default)]
    pub claim_ids: Vec<String>,
    pub evidence: Vec<EvidenceRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SuggestedCorrection {
    pub id: String,
    pub title: String,
    pub reason: String,
    pub content: String,
    pub confidence: f64,
    #[serde(default)]
    pub affected_claim_ids: Vec<String>,
    pub evidence: Vec<EvidenceRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceRef {
    pub source_path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexAuditMetadata {
    pub memory_root: String,
    pub input_entries: usize,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CuratedMemoryBundle {
    pub schema_version: String,
    pub memory_root: String,
    pub generated_at: String,
    pub entries: Vec<CuratedMemoryBundleEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CuratedMemoryBundleEntry {
    pub id: String,
    pub topic: MemoryTopic,
    pub title: String,
    pub summary: String,
    pub bounded_text: String,
    pub text_truncated: bool,
    pub source_path: String,
    pub source_kind: MemorySourceKind,
    pub source_modified_ms: u128,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexAuditRun {
    pub report: CodexAuditReport,
    pub cache_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexExecSpec {
    pub args: Vec<String>,
    pub stdin: Option<String>,
    pub current_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexExecOutput {
    pub status_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub trait CodexExecRunner {
    fn run(&self, spec: &CodexExecSpec) -> Result<CodexExecOutput, String>;
}

pub struct RealCodexExecRunner;

impl CodexExecRunner for RealCodexExecRunner {
    fn run(&self, spec: &CodexExecSpec) -> Result<CodexExecOutput, String> {
        run_codex_exec(spec, None)
    }
}

pub struct CancellableCodexExecRunner {
    cancelled: Arc<AtomicBool>,
}

impl CancellableCodexExecRunner {
    pub fn new(cancelled: Arc<AtomicBool>) -> Self {
        Self { cancelled }
    }
}

impl CodexExecRunner for CancellableCodexExecRunner {
    fn run(&self, spec: &CodexExecSpec) -> Result<CodexExecOutput, String> {
        run_codex_exec(spec, Some(self.cancelled.clone()))
    }
}

fn run_codex_exec(
    spec: &CodexExecSpec,
    cancelled: Option<Arc<AtomicBool>>,
) -> Result<CodexExecOutput, String> {
    let (stdout_path, stderr_path) = codex_output_paths();
    let stdout_file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&stdout_path)
        .map_err(|err| format!("failed to create codex stdout capture: {err}"))?;
    let stderr_file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&stderr_path)
        .map_err(|err| format!("failed to create codex stderr capture: {err}"))?;
    let mut command = Command::new("codex");
    command.args(&spec.args);
    if let Some(current_dir) = &spec.current_dir {
        command.current_dir(current_dir);
    }
    if spec.stdin.is_some() {
        command.stdin(Stdio::piped());
    }
    command
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file));

    let mut child = command
        .spawn()
        .map_err(|err| format!("failed to start codex exec: {err}"))?;

    if let Some(stdin) = &spec.stdin {
        let mut child_stdin = child
            .stdin
            .take()
            .ok_or_else(|| "failed to open codex exec stdin".to_string())?;
        child_stdin
            .write_all(stdin.as_bytes())
            .map_err(|err| format!("failed to write codex exec stdin: {err}"))?;
    }

    let deadline = Instant::now() + CODEX_EXEC_TIMEOUT;
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|err| format!("failed to wait for codex exec: {err}"))?
        {
            break status;
        }
        if cancelled
            .as_ref()
            .is_some_and(|flag| flag.load(Ordering::SeqCst))
        {
            let _ = child.kill();
            let _ = child.wait();
            let _ = read_and_remove_capture(&stderr_path);
            let _ = read_and_remove_capture(&stdout_path);
            return Err("codex exec cancelled".to_string());
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            let stderr = read_and_remove_capture(&stderr_path);
            let stdout = read_and_remove_capture(&stdout_path);
            return Ok(CodexExecOutput {
                status_code: -1,
                stdout,
                stderr: format!(
                    "codex exec timed out after {} seconds. {}",
                    CODEX_EXEC_TIMEOUT.as_secs(),
                    stderr.trim()
                ),
            });
        }
        thread::sleep(Duration::from_millis(100));
    };

    Ok(CodexExecOutput {
        status_code: status.code().unwrap_or(-1),
        stdout: read_and_remove_capture(&stdout_path),
        stderr: read_and_remove_capture(&stderr_path),
    })
}

fn codex_output_paths() -> (PathBuf, PathBuf) {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let base = std::env::temp_dir().join(format!("amm-codex-{}-{nonce}", std::process::id()));
    (
        base.with_extension("stdout.log"),
        base.with_extension("stderr.log"),
    )
}

fn read_and_remove_capture(path: &Path) -> String {
    let content = fs::read_to_string(path).unwrap_or_default();
    let _ = fs::remove_file(path);
    content
}

pub fn build_curated_memory_bundle(
    memory_root: &str,
    sources: &[MemorySource],
    entries: &[MemoryEntry],
) -> CuratedMemoryBundle {
    let sources_by_path = sources
        .iter()
        .map(|source| (source.relative_path.as_str(), source))
        .collect::<HashMap<_, _>>();

    let entries = entries
        .iter()
        .filter_map(|entry| {
            let source = sources_by_path.get(entry.source_path.as_str())?;
            let (bounded_text, text_truncated) = bound_text(&entry.search_text);
            Some(CuratedMemoryBundleEntry {
                id: entry.id.clone(),
                topic: entry.topic.clone(),
                title: entry.title.clone(),
                summary: entry.summary.clone(),
                bounded_text,
                text_truncated,
                source_path: entry.source_path.clone(),
                source_kind: source.kind.clone(),
                source_modified_ms: source.modified_ms,
                start_line: entry.start_line,
                end_line: entry.end_line,
            })
        })
        .collect();

    CuratedMemoryBundle {
        schema_version: BUNDLE_SCHEMA_VERSION.to_string(),
        memory_root: memory_root.to_string(),
        generated_at: Utc::now().to_rfc3339(),
        entries,
    }
}

fn bound_text(text: &str) -> (String, bool) {
    let bounded = text.chars().take(BUNDLE_TEXT_LIMIT).collect::<String>();
    let text_truncated = text.chars().count() > BUNDLE_TEXT_LIMIT;
    (bounded, text_truncated)
}

pub fn run_codex_audit_for_root(
    memory_root: &Path,
    mode: CodexAuditMode,
    runner: &dyn CodexExecRunner,
) -> Result<CodexAuditRun, String> {
    if !memory_root.is_dir() {
        return Err("selected memory root does not exist".to_string());
    }

    let schema_path = resolve_report_schema_path()?;
    let sources = scan_sources(memory_root).map_err(|err| err.to_string())?;
    let spec = match mode {
        CodexAuditMode::Curated => {
            let bundle = build_bundle_from_sources(memory_root, &sources)?;
            build_curated_codex_spec(&schema_path, &bundle)?
        }
        CodexAuditMode::Full => build_full_codex_spec(memory_root, &schema_path),
    };
    let output = runner.run(&spec)?;
    if output.status_code != 0 {
        return Err(format!(
            "codex exec failed with status {}: {}",
            output.status_code,
            output.stderr.trim()
        ));
    }

    let report: CodexAuditReport = serde_json::from_str(output.stdout.trim())
        .map_err(|err| format!("codex exec returned invalid audit JSON: {err}"))?;
    validate_report(&report, &sources, memory_root, &mode)?;
    let cache_path = cache_codex_audit_report(memory_root, &mode, &report)
        .map_err(|err| format!("failed to cache codex audit report: {err}"))?;

    Ok(CodexAuditRun {
        report,
        cache_path: cache_path.to_string_lossy().to_string(),
    })
}

fn build_bundle_from_sources(
    memory_root: &Path,
    sources: &[MemorySource],
) -> Result<CuratedMemoryBundle, String> {
    let mut entries = Vec::new();
    for source in sources {
        let text = fs::read_to_string(&source.path).map_err(|err| err.to_string())?;
        entries.extend(parse_entries(&source.relative_path, &text));
    }

    Ok(build_curated_memory_bundle(
        &memory_root.to_string_lossy(),
        sources,
        &entries,
    ))
}

fn build_curated_codex_spec(
    schema_path: &Path,
    bundle: &CuratedMemoryBundle,
) -> Result<CodexExecSpec, String> {
    let stdin = serde_json::to_string(bundle)
        .map_err(|err| format!("failed to serialize curated memory bundle: {err}"))?;
    let current_dir = std::env::temp_dir();
    let mut args = base_codex_args(
        schema_path,
        "Analyze this AMM curated memory bundle from stdin. Return only the required current-memory report. Set mode exactly to curated. Set metadata.memoryRoot exactly to the bundle memoryRoot value. Use evidence references from the bundle and do not invent sources.",
    );
    scope_codex_args_to_dir(&mut args, &current_dir);

    Ok(CodexExecSpec {
        args,
        stdin: Some(stdin),
        current_dir: Some(current_dir),
    })
}

fn build_full_codex_spec(memory_root: &Path, schema_path: &Path) -> CodexExecSpec {
    let prompt = format!(
        "Analyze the Codex memory root in the current working directory. Return only the required current-memory report. Set mode exactly to full. Set metadata.memoryRoot exactly to {}. Cite source paths and line ranges from files you inspect. Do not write files.",
        memory_root.to_string_lossy()
    );
    let mut args = base_codex_args(schema_path, &prompt);
    scope_codex_args_to_dir(&mut args, memory_root);

    CodexExecSpec {
        args,
        stdin: None,
        current_dir: Some(memory_root.to_path_buf()),
    }
}

fn base_codex_args(schema_path: &Path, prompt: &str) -> Vec<String> {
    vec![
        "exec".to_string(),
        "--sandbox".to_string(),
        "read-only".to_string(),
        "--ephemeral".to_string(),
        "--output-schema".to_string(),
        schema_path.to_string_lossy().to_string(),
        prompt.to_string(),
    ]
}

fn scope_codex_args_to_dir(args: &mut Vec<String>, dir: &Path) {
    args.splice(
        1..1,
        ["--cd".to_string(), dir.to_string_lossy().to_string()],
    );
    args.insert(3, "--skip-git-repo-check".to_string());
}

fn resolve_report_schema_path() -> Result<PathBuf, String> {
    let current_dir = std::env::current_dir().map_err(|err| err.to_string())?;
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        current_dir.join(REPORT_SCHEMA_RELATIVE_PATH),
        current_dir.join("..").join(REPORT_SCHEMA_RELATIVE_PATH),
        manifest_dir.join("..").join(REPORT_SCHEMA_RELATIVE_PATH),
    ];

    candidates
        .into_iter()
        .find(|path| path.is_file())
        .map(Ok)
        .unwrap_or_else(materialize_embedded_report_schema)
}

fn materialize_embedded_report_schema() -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!(
        "amm-current-memory-report-{}.schema.json",
        std::process::id()
    ));
    fs::write(&path, REPORT_SCHEMA_JSON)
        .map_err(|err| format!("failed to materialize current memory report schema: {err}"))?;
    Ok(path)
}

fn validate_report(
    report: &CodexAuditReport,
    sources: &[MemorySource],
    memory_root: &Path,
    expected_mode: &CodexAuditMode,
) -> Result<(), String> {
    if report.schema_version != "1" {
        return Err("unsupported codex audit report schema version".to_string());
    }
    if &report.mode != expected_mode {
        return Err("codex audit report mode does not match requested mode".to_string());
    }
    let expected_memory_root = memory_root.to_string_lossy();
    if report.metadata.memory_root != expected_memory_root.as_ref() {
        return Err("codex audit report memory root does not match selected root".to_string());
    }
    let sources_by_path = sources
        .iter()
        .map(|source| (source.relative_path.as_str(), source))
        .collect::<HashMap<_, _>>();

    for claim in report
        .current_claims
        .iter()
        .chain(report.stale_claims.iter())
        .chain(report.uncertain_claims.iter())
    {
        validate_confidence(claim.confidence)?;
        validate_evidence(&claim.evidence, &sources_by_path)?;
    }
    for conflict in &report.conflicts {
        validate_confidence(conflict.confidence)?;
        validate_evidence(&conflict.evidence, &sources_by_path)?;
    }
    for correction in &report.suggested_corrections {
        validate_confidence(correction.confidence)?;
        validate_evidence(&correction.evidence, &sources_by_path)?;
    }

    Ok(())
}

fn validate_confidence(confidence: f64) -> Result<(), String> {
    if (0.0..=1.0).contains(&confidence) {
        Ok(())
    } else {
        Err("codex audit confidence must be between 0 and 1".to_string())
    }
}

fn validate_evidence(
    evidence: &[EvidenceRef],
    sources_by_path: &HashMap<&str, &MemorySource>,
) -> Result<(), String> {
    if evidence.is_empty() {
        return Err("codex audit report entries must include evidence".to_string());
    }
    for item in evidence {
        if item.source_path.trim().is_empty()
            || item.start_line == 0
            || item.end_line == 0
            || item.end_line < item.start_line
        {
            return Err("codex audit evidence must include source path and line range".to_string());
        }
        let Some(source) = sources_by_path.get(item.source_path.as_str()) else {
            return Err(format!(
                "codex audit evidence references unknown source: {}",
                item.source_path
            ));
        };
        if item.end_line > source.lines {
            return Err(format!(
                "codex audit evidence line range exceeds source length: {}",
                item.source_path
            ));
        }
    }

    Ok(())
}

pub fn cache_codex_audit_report(
    memory_root: &Path,
    mode: &CodexAuditMode,
    report: &CodexAuditReport,
) -> std::io::Result<PathBuf> {
    let cache_dir = memory_root.join(".amm/codex-runs");
    fs::create_dir_all(&cache_dir)?;
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S%.3f").to_string();
    let mode_label = match mode {
        CodexAuditMode::Curated => "curated",
        CodexAuditMode::Full => "full",
    };
    let target = cache_dir.join(format!("{timestamp}-{mode_label}.json"));
    let tmp = target.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        let content = serde_json::to_vec_pretty(report)
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;
        file.write_all(&content)?;
        file.sync_all()?;
    }
    fs::rename(tmp, &target)?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::parser::parse_entries;
    use crate::memory::scanner::scan_sources;
    use std::fs;

    struct FakeRunner {
        output: CodexExecOutput,
    }

    impl CodexExecRunner for FakeRunner {
        fn run(&self, spec: &CodexExecSpec) -> Result<CodexExecOutput, String> {
            assert!(spec.args.contains(&"--sandbox".to_string()));
            assert!(spec.args.contains(&"read-only".to_string()));
            assert!(spec.args.contains(&"--ephemeral".to_string()));
            assert!(spec.args.contains(&"--output-schema".to_string()));
            assert!(spec.args.contains(&"--skip-git-repo-check".to_string()));
            assert!(spec.args.contains(&"--cd".to_string()));
            Ok(self.output.clone())
        }
    }

    fn write_sample_report_sources(root: &Path) {
        fs::write(
            root.join("memory_summary.md"),
            (1..=24)
                .map(|line| format!("summary line {line}"))
                .collect::<Vec<_>>()
                .join("\n"),
        )
        .unwrap();
        fs::create_dir_all(root.join("extensions/ad_hoc/notes")).unwrap();
        fs::write(
            root.join("extensions/ad_hoc/notes/20260608-103659-profile-stack-update.md"),
            "Memory update request:\n\n- The user's primary technical stack has shifted to Python/Rust.\n",
        )
        .unwrap();
        fs::create_dir_all(root.join("extensions/chronicle/resources")).unwrap();
        fs::write(
            root.join(
                "extensions/chronicle/resources/2026-06-04T08-01-00-gPye-10min-memory-summary.md",
            ),
            (1..=20)
                .map(|line| format!("activity line {line}"))
                .collect::<Vec<_>>()
                .join("\n"),
        )
        .unwrap();
    }

    fn sample_report_for_root(root: &Path) -> CodexAuditReport {
        let mut report: CodexAuditReport = serde_json::from_str(include_str!(
            "../../fixtures/current-memory-report.sample.json"
        ))
        .unwrap();
        report.metadata.memory_root = root.to_string_lossy().to_string();
        report
    }

    #[test]
    fn parses_fixture_report() {
        let report: CodexAuditReport = serde_json::from_str(include_str!(
            "../../fixtures/current-memory-report.sample.json"
        ))
        .expect("fixture should match codex audit report type");

        assert_eq!(report.schema_version, "1");
        assert_eq!(report.mode, CodexAuditMode::Curated);
        assert_eq!(report.current_claims[0].status, ClaimStatus::Current);
        assert_eq!(report.stale_claims[0].status, ClaimStatus::Stale);
        assert!(!report.conflicts[0].evidence.is_empty());
        assert!(!report.suggested_corrections[0].evidence.is_empty());
    }

    #[test]
    fn builds_curated_bundle_with_source_metadata_and_bounded_text() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(
            root.join("MEMORY.md"),
            "# User Profile\n\nThe user's primary technical stack is Python/Rust.\n",
        )
        .unwrap();
        fs::create_dir_all(root.join("extensions/ad_hoc/notes")).unwrap();
        fs::write(
            root.join("extensions/ad_hoc/notes/profile.md"),
            "Memory update request:\n\n- The user's primary technical stack has shifted to Python/Rust.\n",
        )
        .unwrap();
        fs::create_dir_all(root.join("extensions/chronicle/resources")).unwrap();
        fs::write(
            root.join("extensions/chronicle/resources/activity.md"),
            "## Memory summary\n\nThe user reviewed BeeBotOS in a 10 minute recording.\n",
        )
        .unwrap();
        fs::create_dir_all(root.join("rollout_summaries")).unwrap();
        fs::write(
            root.join("rollout_summaries/run.md"),
            "## Task Group\n\nThe user reviewed the BeeBotOS project during this run.\n",
        )
        .unwrap();

        let sources = scan_sources(root).unwrap();
        let mut entries = Vec::new();
        for source in &sources {
            let text = fs::read_to_string(&source.path).unwrap();
            entries.extend(parse_entries(&source.relative_path, &text));
        }
        entries.push(MemoryEntry {
            id: "long".to_string(),
            topic: MemoryTopic::Profile,
            related_topics: Vec::new(),
            title: "Long profile".to_string(),
            summary: "Long profile summary".to_string(),
            search_text: "x".repeat(BUNDLE_TEXT_LIMIT + 12),
            source_path: "MEMORY.md".to_string(),
            start_line: 1,
            end_line: 2,
        });

        let bundle = build_curated_memory_bundle("/tmp/memory-root", &sources, &entries);

        assert_eq!(bundle.schema_version, "1");
        assert_eq!(bundle.memory_root, "/tmp/memory-root");
        assert!(bundle.entries.iter().any(|entry| {
            entry.topic == MemoryTopic::Profile
                && entry.source_kind == MemorySourceKind::Registry
                && entry.source_path == "MEMORY.md"
                && entry.start_line == 1
                && entry.end_line >= entry.start_line
        }));
        assert!(bundle.entries.iter().any(|entry| {
            entry.topic == MemoryTopic::Overrides
                && entry.source_kind == MemorySourceKind::AdHocNote
                && entry.source_path == "extensions/ad_hoc/notes/profile.md"
        }));
        assert!(bundle.entries.iter().any(|entry| {
            entry.topic == MemoryTopic::ActivityLog
                && entry.source_kind == MemorySourceKind::Chronicle
                && entry.source_path == "extensions/chronicle/resources/activity.md"
        }));
        assert!(bundle.entries.iter().any(|entry| {
            entry.topic == MemoryTopic::ActivityLog
                && entry.source_kind == MemorySourceKind::RolloutSummary
                && entry.source_path == "rollout_summaries/run.md"
        }));

        let long_entry = bundle
            .entries
            .iter()
            .find(|entry| entry.id == "long")
            .expect("long entry should be included");
        assert_eq!(long_entry.bounded_text.chars().count(), BUNDLE_TEXT_LIMIT);
        assert!(long_entry.text_truncated);
        assert!(long_entry.source_modified_ms > 0);
    }

    #[test]
    fn runs_curated_audit_with_fake_runner_and_caches_report() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(
            root.join("MEMORY.md"),
            "# User Profile\n\nThe user's primary technical stack is Python/Rust.\n",
        )
        .unwrap();
        write_sample_report_sources(root);
        let report_json = serde_json::to_string(&sample_report_for_root(root)).unwrap();
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: report_json,
                stderr: String::new(),
            },
        };

        let run = run_codex_audit_for_root(root, CodexAuditMode::Curated, &runner).unwrap();

        assert_eq!(run.report.mode, CodexAuditMode::Curated);
        assert!(Path::new(&run.cache_path).starts_with(root.join(".amm/codex-runs")));
        assert!(Path::new(&run.cache_path).is_file());
    }

    #[test]
    fn rejects_audit_evidence_outside_scanned_sources() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(root.join("MEMORY.md"), "# User Profile\n\nPython/Rust.\n").unwrap();
        let report_json = serde_json::to_string(&sample_report_for_root(root)).unwrap();
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: report_json,
                stderr: String::new(),
            },
        };

        let err = run_codex_audit_for_root(root, CodexAuditMode::Curated, &runner).unwrap_err();

        assert!(err.contains("unknown source"));
    }

    #[test]
    fn rejects_audit_evidence_line_ranges_outside_source() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(root.join("MEMORY.md"), "# User Profile\n\nPython/Rust.\n").unwrap();
        write_sample_report_sources(root);
        let mut report = sample_report_for_root(root);
        report.current_claims[0].evidence[0].end_line = 99;
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: serde_json::to_string(&report).unwrap(),
                stderr: String::new(),
            },
        };

        let err = run_codex_audit_for_root(root, CodexAuditMode::Curated, &runner).unwrap_err();

        assert!(err.contains("line range exceeds source length"));
    }

    #[test]
    fn rejects_audit_report_for_different_memory_root() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(root.join("MEMORY.md"), "# User Profile\n\nPython/Rust.\n").unwrap();
        write_sample_report_sources(root);
        let mut report = sample_report_for_root(root);
        report.metadata.memory_root = "/tmp/other-memory-root".to_string();
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: serde_json::to_string(&report).unwrap(),
                stderr: String::new(),
            },
        };

        let err = run_codex_audit_for_root(root, CodexAuditMode::Curated, &runner).unwrap_err();

        assert!(err.contains("memory root does not match"));
    }

    #[test]
    fn rejects_audit_report_for_wrong_mode() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(root.join("MEMORY.md"), "# User Profile\n\nPython/Rust.\n").unwrap();
        write_sample_report_sources(root);
        let mut report = sample_report_for_root(root);
        report.mode = CodexAuditMode::Full;
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: serde_json::to_string(&report).unwrap(),
                stderr: String::new(),
            },
        };

        let err = run_codex_audit_for_root(root, CodexAuditMode::Curated, &runner).unwrap_err();

        assert!(err.contains("mode does not match"));
    }

    #[test]
    fn full_audit_spec_is_read_only_and_scoped_to_memory_root() {
        let temp = tempfile::tempdir().unwrap();
        let schema = temp.path().join("schema.json");
        fs::write(&schema, "{}").unwrap();

        let spec = build_full_codex_spec(temp.path(), &schema);

        assert!(spec.args.contains(&"--sandbox".to_string()));
        assert!(spec.args.contains(&"read-only".to_string()));
        assert!(spec.args.contains(&"--skip-git-repo-check".to_string()));
        assert!(spec.args.contains(&"--cd".to_string()));
        assert!(spec
            .args
            .contains(&temp.path().to_string_lossy().to_string()));
        assert_eq!(spec.current_dir.as_deref(), Some(temp.path()));
        assert!(spec.stdin.is_none());
    }

    #[test]
    fn rejects_invalid_codex_report_json() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(root.join("MEMORY.md"), "# User Profile\n\nPython/Rust.\n").unwrap();
        let runner = FakeRunner {
            output: CodexExecOutput {
                status_code: 0,
                stdout: "{\"schemaVersion\":\"1\"}".to_string(),
                stderr: String::new(),
            },
        };

        let err = run_codex_audit_for_root(root, CodexAuditMode::Curated, &runner).unwrap_err();

        assert!(err.contains("invalid audit JSON"));
    }

    #[test]
    fn scanner_ignores_codex_run_cache_files() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        fs::write(root.join("MEMORY.md"), "# User Profile\n\nPython/Rust.\n").unwrap();
        let report: CodexAuditReport = serde_json::from_str(include_str!(
            "../../fixtures/current-memory-report.sample.json"
        ))
        .unwrap();
        let cache_path = cache_codex_audit_report(root, &CodexAuditMode::Curated, &report).unwrap();

        let sources = scan_sources(root).unwrap();

        assert!(cache_path.is_file());
        assert!(sources
            .iter()
            .all(|source| !source.relative_path.starts_with(".amm/")));
    }

    #[test]
    fn materializes_embedded_report_schema_for_packaged_runs() {
        let path = materialize_embedded_report_schema().unwrap();
        let text = fs::read_to_string(&path).unwrap();
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();

        assert!(path.is_file());
        assert_eq!(value["title"], "Current Memory Report");
        assert_eq!(
            value["$id"],
            "https://agent-memory-manager.local/schemas/current-memory-report.schema.json"
        );
    }
}
