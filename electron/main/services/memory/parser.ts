import type { MemoryEntry, MemoryTopic } from "../../../../src/lib/types";
import { textLines } from "../shared";

export function parseEntries(relativePath: string, text: string) {
  const entries: MemoryEntry[] = [];
  const lines = textLines(text);
  let currentTitle = "Document";
  let currentStart = 1;
  let currentLines: string[] = [];

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (shouldSplitHeading(relativePath, line)) {
      flushEntry(relativePath, currentTitle, currentStart, Math.max(0, lineNumber - 1), currentLines, entries);
      currentTitle = line.replace(/^#+/, "").trim();
      currentStart = lineNumber;
      currentLines = [];
    }
    currentLines.push(line);
  }
  flushEntry(
    relativePath,
    currentTitle,
    currentStart,
    Math.max(lines.length, currentStart),
    currentLines,
    entries,
  );
  return entries;
}

function shouldSplitHeading(relativePath: string, line: string) {
  return (
    line.startsWith("# ") ||
    line.startsWith("## ") ||
    (relativePath === "memory_summary.md" && (line.startsWith("### ") || line.startsWith("#### ")))
  );
}

function flushEntry(
  relativePath: string,
  title: string,
  startLine: number,
  endLine: number,
  lines: string[],
  output: MemoryEntry[],
) {
  const body = lines.join("\n");
  if (!lines.some((line) => line.trim() && !line.trim().startsWith("#"))) {
    return;
  }
  const summarySource = selectSummaryLine(body) ?? (isMetadataOnlyEntry(body) ? null : title);
  if (!summarySource) {
    return;
  }
  const summary = [...summarySource].slice(0, 220).join("");
  if (!summary.trim() || (title === "Document" && /^v\d+$/.test(summary))) {
    return;
  }
  const topic = inferTopic(relativePath, title, body);
  output.push({
    id: `${relativePath}:${startLine}-${endLine}`,
    topic,
    relatedTopics: topic === "overrides" ? inferContentTopics(title, body) : [],
    title,
    summary,
    searchText: body,
    sourcePath: relativePath,
    startLine,
    endLine,
  });
}

function selectSummaryLine(body: string) {
  let inMetadataBlock = false;
  for (const line of textLines(body)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) {
      inMetadataBlock = isMetadataHeading(trimmed);
      continue;
    }
    if (inMetadataBlock) {
      continue;
    }
    const normalized = normalizeSummaryLine(trimmed);
    if (isUsableSummaryLine(normalized)) {
      return normalized;
    }
  }
  return null;
}

function isMetadataOnlyEntry(body: string) {
  let inMetadataBlock = false;
  let sawNonHeading = false;
  for (const line of textLines(body)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) {
      inMetadataBlock = isMetadataHeading(trimmed);
      continue;
    }
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    sawNonHeading = true;
    if (!inMetadataBlock && !isRegistryMetadataLine(normalizeSummaryLine(trimmed))) {
      return false;
    }
  }
  return sawNonHeading;
}

function normalizeSummaryLine(line: string) {
  let value = line.trim();
  for (const prefix of ["- ", "desc:", "learnings:"]) {
    if (value.startsWith(prefix)) {
      value = value.slice(prefix.length).trim();
    }
  }
  return value;
}

function isUsableSummaryLine(line: string) {
  return Boolean(
    line &&
      !line.startsWith("#") &&
      line.toLowerCase() !== "memory update request:" &&
      !isRegistryMetadataLine(line),
  );
}

function isMetadataHeading(line: string) {
  const heading = line.replace(/^#+/, "").trim().toLowerCase();
  return heading === "rollout_summary_files" || heading === "keywords";
}

function isRegistryMetadataLine(line: string) {
  const lower = line.toLowerCase();
  return (
    lower.startsWith("scope:") ||
    lower.startsWith("applies_to:") ||
    lower.startsWith("rollout_summaries/") ||
    lower.includes("rollout_path=") ||
    lower.includes("thread_id=")
  );
}

function inferTopic(path: string, title: string, body: string): MemoryTopic {
  const text = `${path} ${title} ${body}`.toLowerCase();
  if (
    path === "raw_memories.md" ||
    path.includes("extensions/chronicle/resources") ||
    path.includes("rollout_summaries/")
  ) {
    return "activityLog";
  }
  if (path.includes("ad_hoc/notes") || text.includes("memory update request")) {
    return "overrides";
  }
  return inferContentTopics(title, body)[0] ?? "sources";
}

function inferContentTopics(title: string, body: string) {
  const text = `${title} ${body}`.toLowerCase();
  const topics: MemoryTopic[] = [];
  if (text.includes("user profile") || text.includes("技术栈") || text.includes("primary technical stack")) {
    topics.push("profile");
  }
  if (
    text.includes("project") ||
    text.includes("agent-backplane") ||
    text.includes("beebotos") ||
    text.includes("sub2api") ||
    text.includes("dilidili")
  ) {
    topics.push("projects");
  }
  if (text.includes("preference") || text.includes("规则") || text.includes("中文输出") || text.includes("tool")) {
    topics.push("rules");
  }
  if (text.includes("codex") || text.includes("mcp") || text.includes("skills") || text.includes("openai")) {
    topics.push("tools");
  }
  if (text.includes("writing") || text.includes("公众号") || text.includes("写作")) {
    topics.push("writing");
  }
  return topics;
}
