use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::State;

use super::codex_audit::{
    run_codex_audit_for_root, CancellableCodexExecRunner, CodexAuditMode, CodexAuditRun,
    RealCodexExecRunner,
};
use super::correction::{
    draft_correction as build_correction_draft,
    draft_correction_from_content as build_correction_draft_from_content, write_correction_note,
    CorrectionDraft,
};
use super::parser::{parse_entries, MemoryEntry};
use super::paths::resolve_memory_root;
use super::profile::{
    generate_memory_profile_for_root, invalidate_memory_profile_cache,
    load_memory_profile_for_root, MemoryProfile,
};
use super::risk::{detect_risks, RiskFlag};
use super::scanner::{scan_sources, MemorySource};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub root: String,
    pub sources: Vec<MemorySource>,
    pub entries: Vec<MemoryEntry>,
    pub risks: Vec<RiskFlag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MemoryProfileGenerationStatus {
    Idle,
    Running,
    Cancelling,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProfileGenerationTask {
    pub id: Option<String>,
    pub status: MemoryProfileGenerationStatus,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub error: Option<String>,
    pub profile: Option<MemoryProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CodexAuditTaskStatus {
    Idle,
    Running,
    Cancelling,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAuditTask {
    pub id: Option<String>,
    pub mode: Option<CodexAuditMode>,
    pub status: CodexAuditTaskStatus,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub error: Option<String>,
    pub run: Option<CodexAuditRun>,
}

#[derive(Clone)]
pub struct MemoryProfileGenerationState {
    inner: Arc<Mutex<MemoryProfileGenerationInner>>,
}

struct MemoryProfileGenerationInner {
    task: MemoryProfileGenerationTask,
    cancel: Option<Arc<AtomicBool>>,
}

#[derive(Clone)]
pub struct CodexAuditState {
    inner: Arc<Mutex<CodexAuditInner>>,
}

struct CodexAuditInner {
    task: CodexAuditTask,
    cancel: Option<Arc<AtomicBool>>,
}

impl Default for MemoryProfileGenerationState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(MemoryProfileGenerationInner {
                task: idle_profile_generation_task(),
                cancel: None,
            })),
        }
    }
}

impl Default for CodexAuditState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(CodexAuditInner {
                task: idle_codex_audit_task(),
                cancel: None,
            })),
        }
    }
}

#[tauri::command]
pub fn scan_memories(root_override: Option<String>) -> Result<ScanResult, String> {
    let root = resolve_memory_root(root_override);
    scan_memory_root(&root)
}

fn scan_memory_root(root: &Path) -> Result<ScanResult, String> {
    let sources = scan_sources(root).map_err(|err| err.to_string())?;
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
pub fn start_memory_profile_generation(
    root_override: Option<String>,
    state: State<'_, MemoryProfileGenerationState>,
) -> Result<MemoryProfileGenerationTask, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    let task_id = format!("profile-{}", Utc::now().timestamp_millis());
    let task = running_profile_generation_task(task_id.clone());

    let started = begin_profile_generation_task(&state, task.clone(), cancel.clone())?;
    if started.id.as_deref() != Some(task_id.as_str()) {
        return Ok(started);
    }

    let task_state = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = run_profile_generation(root_override, cancel.clone());
        finish_profile_generation_task(&task_state, &task_id, &cancel, result);
    });

    Ok(task)
}

#[tauri::command]
pub fn get_memory_profile_generation(
    state: State<'_, MemoryProfileGenerationState>,
) -> Result<MemoryProfileGenerationTask, String> {
    let inner = state
        .inner
        .lock()
        .map_err(|_| "failed to lock memory profile generation state".to_string())?;
    Ok(inner.task.clone())
}

#[tauri::command]
pub fn cancel_memory_profile_generation(
    state: State<'_, MemoryProfileGenerationState>,
) -> Result<MemoryProfileGenerationTask, String> {
    cancel_profile_generation_task(&state)
}

#[tauri::command]
pub fn start_codex_audit(
    root_override: Option<String>,
    mode: CodexAuditMode,
    state: State<'_, CodexAuditState>,
) -> Result<CodexAuditTask, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    let task_id = format!("audit-{}", Utc::now().timestamp_millis());
    let task = running_codex_audit_task(task_id.clone(), mode.clone());

    let started = begin_codex_audit_task(&state, task.clone(), cancel.clone())?;
    if started.id.as_deref() != Some(task_id.as_str()) {
        return Ok(started);
    }

    let task_state = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = run_audit_task(root_override, mode, cancel.clone());
        finish_codex_audit_task(&task_state, &task_id, &cancel, result);
    });

    Ok(task)
}

#[tauri::command]
pub fn get_codex_audit(state: State<'_, CodexAuditState>) -> Result<CodexAuditTask, String> {
    let inner = state
        .inner
        .lock()
        .map_err(|_| "failed to lock codex audit state".to_string())?;
    Ok(inner.task.clone())
}

#[tauri::command]
pub fn cancel_codex_audit(state: State<'_, CodexAuditState>) -> Result<CodexAuditTask, String> {
    cancel_codex_audit_task(&state)
}

fn begin_profile_generation_task(
    state: &MemoryProfileGenerationState,
    task: MemoryProfileGenerationTask,
    cancel: Arc<AtomicBool>,
) -> Result<MemoryProfileGenerationTask, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "failed to lock memory profile generation state".to_string())?;
    if matches!(
        inner.task.status,
        MemoryProfileGenerationStatus::Running | MemoryProfileGenerationStatus::Cancelling
    ) {
        return Ok(inner.task.clone());
    }
    inner.task = task.clone();
    inner.cancel = Some(cancel);
    Ok(task)
}

fn cancel_profile_generation_task(
    state: &MemoryProfileGenerationState,
) -> Result<MemoryProfileGenerationTask, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "failed to lock memory profile generation state".to_string())?;
    if matches!(
        inner.task.status,
        MemoryProfileGenerationStatus::Running | MemoryProfileGenerationStatus::Cancelling
    ) {
        if let Some(cancel) = &inner.cancel {
            cancel.store(true, Ordering::SeqCst);
        }
        inner.task.status = MemoryProfileGenerationStatus::Cancelling;
    }
    Ok(inner.task.clone())
}

fn finish_profile_generation_task(
    task_state: &Arc<Mutex<MemoryProfileGenerationInner>>,
    task_id: &str,
    cancel: &AtomicBool,
    result: Result<MemoryProfile, String>,
) {
    if let Ok(mut inner) = task_state.lock() {
        if inner.task.id.as_deref() != Some(task_id) {
            return;
        }
        inner.cancel = None;
        inner.task.finished_at = Some(Utc::now().to_rfc3339());
        if cancel.load(Ordering::SeqCst)
            || result
                .as_ref()
                .err()
                .is_some_and(|err| err.contains("cancelled"))
        {
            inner.task.status = MemoryProfileGenerationStatus::Cancelled;
            inner.task.error = None;
            inner.task.profile = None;
            return;
        }

        match result {
            Ok(profile) => {
                inner.task.status = MemoryProfileGenerationStatus::Succeeded;
                inner.task.error = None;
                inner.task.profile = Some(profile);
            }
            Err(err) => {
                inner.task.status = MemoryProfileGenerationStatus::Failed;
                inner.task.error = Some(err);
                inner.task.profile = None;
            }
        }
    }
}

fn begin_codex_audit_task(
    state: &CodexAuditState,
    task: CodexAuditTask,
    cancel: Arc<AtomicBool>,
) -> Result<CodexAuditTask, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "failed to lock codex audit state".to_string())?;
    if matches!(
        inner.task.status,
        CodexAuditTaskStatus::Running | CodexAuditTaskStatus::Cancelling
    ) {
        return Ok(inner.task.clone());
    }
    inner.task = task.clone();
    inner.cancel = Some(cancel);
    Ok(task)
}

fn cancel_codex_audit_task(state: &CodexAuditState) -> Result<CodexAuditTask, String> {
    let mut inner = state
        .inner
        .lock()
        .map_err(|_| "failed to lock codex audit state".to_string())?;
    if matches!(
        inner.task.status,
        CodexAuditTaskStatus::Running | CodexAuditTaskStatus::Cancelling
    ) {
        if let Some(cancel) = &inner.cancel {
            cancel.store(true, Ordering::SeqCst);
        }
        inner.task.status = CodexAuditTaskStatus::Cancelling;
    }
    Ok(inner.task.clone())
}

fn finish_codex_audit_task(
    task_state: &Arc<Mutex<CodexAuditInner>>,
    task_id: &str,
    cancel: &AtomicBool,
    result: Result<CodexAuditRun, String>,
) {
    if let Ok(mut inner) = task_state.lock() {
        if inner.task.id.as_deref() != Some(task_id) {
            return;
        }
        inner.cancel = None;
        inner.task.finished_at = Some(Utc::now().to_rfc3339());
        if cancel.load(Ordering::SeqCst)
            || result
                .as_ref()
                .err()
                .is_some_and(|err| err.contains("cancelled"))
        {
            inner.task.status = CodexAuditTaskStatus::Cancelled;
            inner.task.error = None;
            inner.task.run = None;
            return;
        }

        match result {
            Ok(run) => {
                inner.task.status = CodexAuditTaskStatus::Succeeded;
                inner.task.error = None;
                inner.task.run = Some(run);
            }
            Err(err) => {
                inner.task.status = CodexAuditTaskStatus::Failed;
                inner.task.error = Some(err);
                inner.task.run = None;
            }
        }
    }
}

#[tauri::command]
pub fn load_memory_profile(root_override: Option<String>) -> Result<MemoryProfile, String> {
    let root = resolve_memory_root(root_override);
    let scan = scan_memory_root(&root)?;
    load_memory_profile_for_root(&root, &scan.sources, &scan.entries, &scan.risks)
}

#[tauri::command]
pub async fn generate_memory_profile(
    root_override: Option<String>,
) -> Result<MemoryProfile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cancel = Arc::new(AtomicBool::new(false));
        run_profile_generation(root_override, cancel)
    })
    .await
    .map_err(|err| format!("failed to join memory profile generation task: {err}"))?
}

#[tauri::command]
pub fn get_source_excerpt(
    root_override: Option<String>,
    path: String,
    start_line: usize,
    end_line: usize,
) -> Result<String, String> {
    let root = resolve_memory_root(root_override);
    let path = PathBuf::from(path);
    ensure_inside_root(&path, &root)?;
    let text = fs::read_to_string(&path).map_err(|err| err.to_string())?;
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
pub fn draft_correction(
    root_override: Option<String>,
    slug: String,
    bullet_lines: Vec<String>,
) -> Result<CorrectionDraft, String> {
    let root = resolve_memory_root(root_override);
    Ok(build_correction_draft(&root, &slug, &bullet_lines))
}

#[tauri::command]
pub fn draft_correction_from_content(
    root_override: Option<String>,
    slug: String,
    content: String,
) -> Result<CorrectionDraft, String> {
    let root = resolve_memory_root(root_override);
    Ok(build_correction_draft_from_content(&root, &slug, &content))
}

#[tauri::command]
pub fn write_correction(
    root_override: Option<String>,
    draft: CorrectionDraft,
) -> Result<String, String> {
    let root = resolve_memory_root(root_override);
    invalidate_memory_profile_cache(&root)
        .map_err(|err| format!("failed to invalidate memory profile cache: {err}"))?;
    let path = write_correction_note(&draft, &root).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn run_codex_audit(
    root_override: Option<String>,
    mode: CodexAuditMode,
) -> Result<CodexAuditRun, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = resolve_memory_root(root_override);
        run_codex_audit_for_root(&root, mode, &RealCodexExecRunner)
    })
    .await
    .map_err(|err| format!("failed to join codex audit task: {err}"))?
}

fn ensure_inside_root(path: &Path, root: &Path) -> Result<(), String> {
    let root = fs::canonicalize(root).map_err(|err| err.to_string())?;
    let path = fs::canonicalize(path).map_err(|err| err.to_string())?;
    if path.starts_with(root) {
        Ok(())
    } else {
        Err("source path must stay inside the selected memory root".to_string())
    }
}

fn run_profile_generation(
    root_override: Option<String>,
    cancel: Arc<AtomicBool>,
) -> Result<MemoryProfile, String> {
    let root = resolve_memory_root(root_override);
    let scan = scan_memory_root(&root)?;
    let runner = CancellableCodexExecRunner::new(cancel);
    generate_memory_profile_for_root(&root, &scan.sources, &scan.entries, &scan.risks, &runner)
}

fn run_audit_task(
    root_override: Option<String>,
    mode: CodexAuditMode,
    cancel: Arc<AtomicBool>,
) -> Result<CodexAuditRun, String> {
    let root = resolve_memory_root(root_override);
    let runner = CancellableCodexExecRunner::new(cancel);
    run_codex_audit_for_root(&root, mode, &runner)
}

fn idle_profile_generation_task() -> MemoryProfileGenerationTask {
    MemoryProfileGenerationTask {
        id: None,
        status: MemoryProfileGenerationStatus::Idle,
        started_at: None,
        finished_at: None,
        error: None,
        profile: None,
    }
}

fn idle_codex_audit_task() -> CodexAuditTask {
    CodexAuditTask {
        id: None,
        mode: None,
        status: CodexAuditTaskStatus::Idle,
        started_at: None,
        finished_at: None,
        error: None,
        run: None,
    }
}

fn running_profile_generation_task(task_id: String) -> MemoryProfileGenerationTask {
    MemoryProfileGenerationTask {
        id: Some(task_id),
        status: MemoryProfileGenerationStatus::Running,
        started_at: Some(Utc::now().to_rfc3339()),
        finished_at: None,
        error: None,
        profile: None,
    }
}

fn running_codex_audit_task(task_id: String, mode: CodexAuditMode) -> CodexAuditTask {
    CodexAuditTask {
        id: Some(task_id),
        mode: Some(mode),
        status: CodexAuditTaskStatus::Running,
        started_at: Some(Utc::now().to_rfc3339()),
        finished_at: None,
        error: None,
        run: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_excerpt_path_traversal_outside_root() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("memory");
        fs::create_dir_all(&root).unwrap();
        fs::write(temp.path().join("outside.md"), "outside").unwrap();

        let err = get_source_excerpt(
            Some(root.to_string_lossy().to_string()),
            root.join("../outside.md").to_string_lossy().to_string(),
            1,
            1,
        )
        .unwrap_err();

        assert_eq!(err, "source path must stay inside the selected memory root");
    }

    #[test]
    fn profile_generation_keeps_single_running_task() {
        let state = MemoryProfileGenerationState::default();
        let first_cancel = Arc::new(AtomicBool::new(false));
        let second_cancel = Arc::new(AtomicBool::new(false));

        let first = begin_profile_generation_task(
            &state,
            running_profile_generation_task("task-1".to_string()),
            first_cancel.clone(),
        )
        .unwrap();
        let second = begin_profile_generation_task(
            &state,
            running_profile_generation_task("task-2".to_string()),
            second_cancel.clone(),
        )
        .unwrap();

        assert_eq!(first.id.as_deref(), Some("task-1"));
        assert_eq!(second.id.as_deref(), Some("task-1"));

        let cancelling = cancel_profile_generation_task(&state).unwrap();
        assert_eq!(cancelling.status, MemoryProfileGenerationStatus::Cancelling);
        assert!(first_cancel.load(Ordering::SeqCst));
        assert!(!second_cancel.load(Ordering::SeqCst));
    }

    #[test]
    fn profile_generation_allows_retry_after_failed_or_cancelled_task() {
        let state = MemoryProfileGenerationState::default();
        let first_cancel = Arc::new(AtomicBool::new(false));

        begin_profile_generation_task(
            &state,
            running_profile_generation_task("task-1".to_string()),
            first_cancel.clone(),
        )
        .unwrap();
        finish_profile_generation_task(&state.inner, "task-1", &first_cancel, Err("boom".into()));

        let failed = state.inner.lock().unwrap().task.clone();
        assert_eq!(failed.status, MemoryProfileGenerationStatus::Failed);
        assert_eq!(failed.error.as_deref(), Some("boom"));

        let second_cancel = Arc::new(AtomicBool::new(false));
        let second = begin_profile_generation_task(
            &state,
            running_profile_generation_task("task-2".to_string()),
            second_cancel.clone(),
        )
        .unwrap();
        assert_eq!(second.id.as_deref(), Some("task-2"));
        assert_eq!(second.status, MemoryProfileGenerationStatus::Running);

        cancel_profile_generation_task(&state).unwrap();
        finish_profile_generation_task(
            &state.inner,
            "task-2",
            &second_cancel,
            Err("codex exec cancelled".into()),
        );

        let cancelled = state.inner.lock().unwrap().task.clone();
        assert_eq!(cancelled.status, MemoryProfileGenerationStatus::Cancelled);
        assert_eq!(cancelled.error, None);
        assert!(cancelled.profile.is_none());

        let third_cancel = Arc::new(AtomicBool::new(false));
        let third = begin_profile_generation_task(
            &state,
            running_profile_generation_task("task-3".to_string()),
            third_cancel,
        )
        .unwrap();
        assert_eq!(third.id.as_deref(), Some("task-3"));
        assert_eq!(third.status, MemoryProfileGenerationStatus::Running);
    }

    #[test]
    fn stale_profile_generation_completion_cannot_overwrite_current_task() {
        let state = MemoryProfileGenerationState::default();
        let stale_cancel = Arc::new(AtomicBool::new(false));

        begin_profile_generation_task(
            &state,
            running_profile_generation_task("task-1".to_string()),
            stale_cancel.clone(),
        )
        .unwrap();
        {
            let mut inner = state.inner.lock().unwrap();
            inner.task = running_profile_generation_task("task-2".to_string());
        }

        finish_profile_generation_task(&state.inner, "task-1", &stale_cancel, Err("boom".into()));

        let current = state.inner.lock().unwrap().task.clone();
        assert_eq!(current.id.as_deref(), Some("task-2"));
        assert_eq!(current.status, MemoryProfileGenerationStatus::Running);
        assert_eq!(current.error, None);
    }

    #[test]
    fn codex_audit_keeps_single_running_task() {
        let state = CodexAuditState::default();
        let first_cancel = Arc::new(AtomicBool::new(false));
        let second_cancel = Arc::new(AtomicBool::new(false));

        let first = begin_codex_audit_task(
            &state,
            running_codex_audit_task("task-1".to_string(), CodexAuditMode::Curated),
            first_cancel.clone(),
        )
        .unwrap();
        let second = begin_codex_audit_task(
            &state,
            running_codex_audit_task("task-2".to_string(), CodexAuditMode::Full),
            second_cancel.clone(),
        )
        .unwrap();

        assert_eq!(first.id.as_deref(), Some("task-1"));
        assert_eq!(second.id.as_deref(), Some("task-1"));
        assert_eq!(second.mode, Some(CodexAuditMode::Curated));

        let cancelling = cancel_codex_audit_task(&state).unwrap();
        assert_eq!(cancelling.status, CodexAuditTaskStatus::Cancelling);
        assert!(first_cancel.load(Ordering::SeqCst));
        assert!(!second_cancel.load(Ordering::SeqCst));
    }

    #[test]
    fn codex_audit_allows_retry_after_failed_or_cancelled_task() {
        let state = CodexAuditState::default();
        let first_cancel = Arc::new(AtomicBool::new(false));

        begin_codex_audit_task(
            &state,
            running_codex_audit_task("task-1".to_string(), CodexAuditMode::Curated),
            first_cancel.clone(),
        )
        .unwrap();
        finish_codex_audit_task(&state.inner, "task-1", &first_cancel, Err("boom".into()));

        let failed = state.inner.lock().unwrap().task.clone();
        assert_eq!(failed.status, CodexAuditTaskStatus::Failed);
        assert_eq!(failed.error.as_deref(), Some("boom"));

        let second_cancel = Arc::new(AtomicBool::new(false));
        let second = begin_codex_audit_task(
            &state,
            running_codex_audit_task("task-2".to_string(), CodexAuditMode::Full),
            second_cancel.clone(),
        )
        .unwrap();
        assert_eq!(second.id.as_deref(), Some("task-2"));
        assert_eq!(second.status, CodexAuditTaskStatus::Running);

        cancel_codex_audit_task(&state).unwrap();
        finish_codex_audit_task(
            &state.inner,
            "task-2",
            &second_cancel,
            Err("codex exec cancelled".into()),
        );

        let cancelled = state.inner.lock().unwrap().task.clone();
        assert_eq!(cancelled.status, CodexAuditTaskStatus::Cancelled);
        assert_eq!(cancelled.error, None);
        assert!(cancelled.run.is_none());

        let third_cancel = Arc::new(AtomicBool::new(false));
        let third = begin_codex_audit_task(
            &state,
            running_codex_audit_task("task-3".to_string(), CodexAuditMode::Curated),
            third_cancel,
        )
        .unwrap();
        assert_eq!(third.id.as_deref(), Some("task-3"));
        assert_eq!(third.status, CodexAuditTaskStatus::Running);
    }

    #[test]
    fn stale_codex_audit_completion_cannot_overwrite_current_task() {
        let state = CodexAuditState::default();
        let stale_cancel = Arc::new(AtomicBool::new(false));

        begin_codex_audit_task(
            &state,
            running_codex_audit_task("task-1".to_string(), CodexAuditMode::Curated),
            stale_cancel.clone(),
        )
        .unwrap();
        {
            let mut inner = state.inner.lock().unwrap();
            inner.task = running_codex_audit_task("task-2".to_string(), CodexAuditMode::Full);
        }

        finish_codex_audit_task(&state.inner, "task-1", &stale_cancel, Err("boom".into()));

        let current = state.inner.lock().unwrap().task.clone();
        assert_eq!(current.id.as_deref(), Some("task-2"));
        assert_eq!(current.status, CodexAuditTaskStatus::Running);
        assert_eq!(current.error, None);
        assert_eq!(current.mode, Some(CodexAuditMode::Full));
    }
}
