use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum MemoryTopic {
    Profile,
    Projects,
    Rules,
    Tools,
    Writing,
    ActivityLog,
    Overrides,
    Sources,
    StaleRisks,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    pub id: String,
    pub topic: MemoryTopic,
    pub related_topics: Vec<MemoryTopic>,
    pub title: String,
    pub summary: String,
    pub search_text: String,
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
        if should_split_heading(relative_path, line) {
            flush_entry(
                relative_path,
                &current_title,
                current_start,
                line_no.saturating_sub(1),
                &current_lines,
                &mut entries,
            );
            current_title = line.trim_start_matches('#').trim().to_string();
            current_start = line_no;
            current_lines.clear();
        }
        current_lines.push(line.to_string());
    }

    flush_entry(
        relative_path,
        &current_title,
        current_start,
        text.lines().count().max(current_start),
        &current_lines,
        &mut entries,
    );
    entries
}

fn should_split_heading(relative_path: &str, line: &str) -> bool {
    line.starts_with("# ")
        || line.starts_with("## ")
        || (relative_path == "memory_summary.md"
            && (line.starts_with("### ") || line.starts_with("#### ")))
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
    let has_content = body
        .lines()
        .map(str::trim)
        .any(|line| !line.is_empty() && !line.starts_with('#'));
    if !has_content {
        return;
    }
    let Some(summary_source) = select_summary_line(&body).or_else(|| {
        if is_metadata_only_entry(&body) {
            None
        } else {
            Some(title.to_string())
        }
    }) else {
        return;
    };
    let summary = summary_source.chars().take(220).collect::<String>();
    if summary.trim().is_empty() {
        return;
    }
    if is_version_preamble(title, &summary) {
        return;
    }

    let topic = infer_topic(relative_path, title, &body);
    let related_topics = infer_related_topics(&topic, title, &body);

    out.push(MemoryEntry {
        id: format!("{}:{}-{}", relative_path, start_line, end_line),
        topic,
        related_topics,
        title: title.to_string(),
        summary,
        search_text: body,
        source_path: relative_path.to_string(),
        start_line,
        end_line,
    });
}

fn select_summary_line(body: &str) -> Option<String> {
    let mut in_metadata_block = false;
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("### ") {
            in_metadata_block = is_metadata_heading(trimmed);
            continue;
        }
        if in_metadata_block {
            continue;
        }

        let normalized = normalize_summary_line(trimmed);
        if is_usable_summary_line(&normalized) {
            return Some(normalized);
        }
    }

    None
}

fn is_metadata_only_entry(body: &str) -> bool {
    let mut in_metadata_block = false;
    let mut saw_non_heading = false;
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("### ") {
            in_metadata_block = is_metadata_heading(trimmed);
            continue;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        saw_non_heading = true;
        if in_metadata_block {
            continue;
        }
        let normalized = normalize_summary_line(trimmed);
        if !is_registry_metadata_line(&normalized) {
            return false;
        }
    }

    saw_non_heading
}

fn normalize_summary_line(line: &str) -> String {
    line.trim()
        .trim_start_matches("- ")
        .trim_start_matches("desc:")
        .trim_start_matches("learnings:")
        .trim()
        .to_string()
}

fn is_usable_summary_line(line: &str) -> bool {
    !line.is_empty()
        && !line.starts_with('#')
        && !line.eq_ignore_ascii_case("memory update request:")
        && !is_registry_metadata_line(line)
}

fn is_metadata_heading(line: &str) -> bool {
    let heading = line.trim_start_matches('#').trim().to_lowercase();
    matches!(heading.as_str(), "rollout_summary_files" | "keywords")
}

fn is_registry_metadata_line(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.starts_with("scope:")
        || lower.starts_with("applies_to:")
        || lower.starts_with("rollout_summaries/")
        || lower.contains("rollout_path=")
        || lower.contains("thread_id=")
}

fn is_version_preamble(title: &str, summary: &str) -> bool {
    title == "Document"
        && summary
            .strip_prefix('v')
            .is_some_and(|version| version.chars().all(|ch| ch.is_ascii_digit()))
}

fn infer_related_topics(primary_topic: &MemoryTopic, title: &str, body: &str) -> Vec<MemoryTopic> {
    if primary_topic != &MemoryTopic::Overrides {
        return Vec::new();
    }

    infer_content_topics(title, body)
}

fn infer_topic(path: &str, title: &str, body: &str) -> MemoryTopic {
    let text = format!("{} {} {}", path, title, body).to_lowercase();
    if path == "raw_memories.md"
        || path.contains("extensions/chronicle/resources")
        || path.contains("rollout_summaries/")
    {
        MemoryTopic::ActivityLog
    } else if path.contains("ad_hoc/notes") || text.contains("memory update request") {
        MemoryTopic::Overrides
    } else {
        infer_content_topics(title, body)
            .into_iter()
            .next()
            .unwrap_or(MemoryTopic::Sources)
    }
}

fn infer_content_topics(title: &str, body: &str) -> Vec<MemoryTopic> {
    let text = format!("{} {}", title, body).to_lowercase();
    let mut topics = Vec::new();

    if text.contains("user profile")
        || text.contains("技术栈")
        || text.contains("primary technical stack")
    {
        topics.push(MemoryTopic::Profile);
    }
    if text.contains("project")
        || text.contains("agent-memory-manager")
        || text.contains("beebotos")
        || text.contains("sub2api")
        || text.contains("dilidili")
    {
        topics.push(MemoryTopic::Projects);
    }
    if text.contains("preference")
        || text.contains("规则")
        || text.contains("中文输出")
        || text.contains("tool")
    {
        topics.push(MemoryTopic::Rules);
    }
    if text.contains("codex")
        || text.contains("mcp")
        || text.contains("skills")
        || text.contains("openai")
    {
        topics.push(MemoryTopic::Tools);
    }
    if text.contains("writing") || text.contains("公众号") || text.contains("写作") {
        topics.push(MemoryTopic::Writing);
    }

    topics
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_profile_stack_entries() {
        let entries = parse_entries(
            "extensions/ad_hoc/notes/profile.md",
            "Memory update request:\n\n- The user's primary technical stack has shifted to Python/Rust.\n",
        );

        assert!(entries
            .iter()
            .any(|entry| entry.topic == MemoryTopic::Overrides));
        assert!(entries
            .iter()
            .any(|entry| entry.summary.contains("Python/Rust")));
        assert!(entries
            .iter()
            .any(|entry| entry.related_topics.contains(&MemoryTopic::Profile)));
    }

    #[test]
    fn keeps_full_search_text_for_multi_bullet_notes() {
        let entries = parse_entries(
            "extensions/ad_hoc/notes/profile.md",
            "Memory update request:\n\n- `dilidili` is no longer active.\n- The user's primary technical stack has shifted to Python/Rust.\n",
        );

        let entry = entries.first().expect("expected one note entry");

        assert!(entry.summary.contains("dilidili"));
        assert!(entry.search_text.contains("Python/Rust"));
        assert!(entry.related_topics.contains(&MemoryTopic::Projects));
        assert!(entry.related_topics.contains(&MemoryTopic::Profile));
    }

    #[test]
    fn keeps_chronicle_activity_out_of_profile() {
        let entries = parse_entries(
            "extensions/chronicle/resources/2026-06-02T09-09-00-10min-memory-summary.md",
            "## Memory summary\n\nThe user is reviewing BeeBotOS and current 技术栈 context in a 10 minute recording.\n",
        );

        assert!(entries
            .iter()
            .all(|entry| entry.topic == MemoryTopic::ActivityLog));
    }

    #[test]
    fn keeps_rollout_history_out_of_projects() {
        let entries = parse_entries(
            "rollout_summaries/2026-06-02T09-09-00-example.md",
            "## Task Group\n\nThe user reviewed the BeeBotOS project during this past session.\n",
        );

        assert!(entries
            .iter()
            .all(|entry| entry.topic == MemoryTopic::ActivityLog));
    }

    #[test]
    fn keeps_raw_memories_out_of_current_topics() {
        let entries = parse_entries(
            "raw_memories.md",
            "# Raw Memories\n\n## Thread `example`\n\n### Task 1: Review BeeBotOS and Codex memory\n\nThe user discussed project preferences and 技术栈 history.\n",
        );

        assert!(entries
            .iter()
            .all(|entry| entry.topic == MemoryTopic::ActivityLog));
    }

    #[test]
    fn keeps_historical_memory_update_text_out_of_corrections() {
        let entries = parse_entries(
            "raw_memories.md",
            "# Raw Memories\n\n## Thread `example`\n\nMemory update request:\n\n- The user discussed a past correction workflow.\n",
        );

        assert!(entries
            .iter()
            .all(|entry| entry.topic == MemoryTopic::ActivityLog));
    }

    #[test]
    fn skips_memory_summary_version_preamble() {
        let entries = parse_entries(
            "memory_summary.md",
            "v1\n\n## User Profile\n\nThe user's current technical stack is Python/Rust.\n",
        );

        assert!(entries.iter().all(|entry| entry.summary != "v1"));
        assert!(entries.iter().any(|entry| entry.title == "User Profile"));
    }

    #[test]
    fn splits_memory_summary_project_sections() {
        let entries = parse_entries(
            "memory_summary.md",
            "## What's in Memory\n\n### /Users/qsh/Documents/work/agent-memory-manager\n\n#### 2026-06-08\n\n- Codex memory manager MVP: agent-memory-manager, Knowledge Board, safe write\n  - desc: Iterate the memory manager UI.\n",
        );

        assert!(!entries
            .iter()
            .any(|entry| entry.title == "What's in Memory"));
        assert!(!entries
            .iter()
            .any(|entry| entry.title == "/Users/qsh/Documents/work/agent-memory-manager"));
        assert!(entries.iter().any(|entry| {
            entry.title == "2026-06-08"
                && entry.summary.contains("Codex memory manager MVP")
                && entry.topic == MemoryTopic::Projects
        }));
    }

    #[test]
    fn skips_memory_registry_metadata_when_choosing_summaries() {
        let entries = parse_entries(
            "MEMORY.md",
            "# Task Group: local skills-manager layout\nscope: Machine-local inspection metadata.\napplies_to: cwd=/Users/qsh.\n\n## Task 1: Inspect local skills management\n\n### rollout_summary_files\n\n- rollout_summaries/2026-example.md (rollout_path=/tmp/example.jsonl, thread_id=abc)\n\n### keywords\n\n- skills, symlink, sqlite3\n\n## User preferences\n\n- when the user asks about local skills, answer by auditing real filesystem objects [Task 1]\n\n## Reusable knowledge\n\n- `skills-manager` is the authoritative manager on this machine [Task 1]\n",
        );

        assert!(!entries.iter().any(|entry| entry.summary.contains("scope:")
            || entry.summary.contains("rollout_summaries/")
            || entry.summary == "skills, symlink, sqlite3"));
        assert!(entries
            .iter()
            .any(|entry| entry.summary.starts_with("when the user asks")));
        assert!(entries
            .iter()
            .any(|entry| entry.summary.starts_with("`skills-manager`")));
    }
}
