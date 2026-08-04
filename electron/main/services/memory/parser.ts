import type {
  MemoryChangeMetadata,
  MemoryEntry,
  MemorySourceKind,
  MemoryTopic,
} from "../../../../src/lib/types";
import { sha256, textLines } from "../shared";

interface LegacyBlock {
  title: string;
  startLine: number;
  endLine: number;
  lines: string[];
  body: string;
  legacyId: string;
  blockIndex: number;
}

interface ClaimSegment {
  kind: "paragraph" | "listItem";
  sectionTitle: string;
  structuralKey: string;
  startLine: number;
  endLine: number;
  lines: string[];
}

interface SegmentBuffer {
  kind: ClaimSegment["kind"];
  sectionTitle: string;
  structuralKey: string;
  startLine: number;
  lines: Array<{ line: string; lineNumber: number }>;
}

export function parseEntries(
  relativePath: string,
  text: string,
  sourceKind: MemorySourceKind = inferSourceKind(relativePath),
): MemoryEntry[] {
  return parseLegacyBlocks(relativePath, text).flatMap((block) =>
    entriesForBlock(relativePath, sourceKind, block),
  );
}

function parseLegacyBlocks(relativePath: string, text: string): LegacyBlock[] {
  const blocks: LegacyBlock[] = [];
  const lines = textLines(text);
  let currentTitle = "Document";
  let currentStart = 1;
  let currentLines: string[] = [];

  const flush = (endLine: number) => {
    if (!currentLines.length) return;
    const body = currentLines.join("\n");
    blocks.push({
      title: currentTitle,
      startLine: currentStart,
      endLine: Math.max(currentStart, endLine),
      lines: currentLines,
      body,
      legacyId: legacyBlockId(relativePath, currentTitle, body),
      blockIndex: blocks.length,
    });
  };

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    if (shouldSplitLegacyHeading(relativePath, line)) {
      flush(lineNumber - 1);
      currentTitle = headingText(line);
      currentStart = lineNumber;
      currentLines = [];
    }
    currentLines.push(line);
  }
  flush(lines.length);
  return blocks;
}

function entriesForBlock(
  relativePath: string,
  sourceKind: MemorySourceKind,
  block: LegacyBlock,
): MemoryEntry[] {
  if (!hasUsableContent(block.body)) return [];
  const change = parseChangeMetadata(block.body);
  if (change || !shouldAtomize(sourceKind)) {
    const entry = blockEntry(relativePath, block, change);
    return entry ? [entry] : [];
  }

  const segments = splitAtomicClaims(block);
  if (!segments.length) {
    const fallback = blockEntry(relativePath, block);
    return fallback ? [fallback] : [];
  }
  const canonicalOccurrences = new Map<string, number>();

  const atomicEntries = segments.flatMap((segment) => {
    const body = segment.lines.join("\n");
    const summarySource = selectSummaryLine(body);
    if (!summarySource) return [];
    const summary = truncate(summarySource, 220);
    const canonical = canonicalClaimText(body);
    if (!canonical) return [];
    const occurrence = canonicalOccurrences.get(canonical) ?? 0;
    canonicalOccurrences.set(canonical, occurrence + 1);
    const revisionId = `${relativePath}:${sha256(`${block.blockIndex}\0${canonical}\0${occurrence}`).slice(0, 16)}`;
    const id = segments.length === 1 ? block.legacyId : revisionId;
    const topic = inferTopic(relativePath, segment.sectionTitle, body);
    return [{
      id,
      revisionHash: sha256(canonical),
      aliasIds: [...new Set([block.legacyId, revisionId])].filter((alias) => alias !== id),
      structuralKey: segment.structuralKey,
      claimKind: segment.kind,
      topic,
      relatedTopics: topic === "overrides"
        ? inferContentTopics(segment.sectionTitle, body)
        : [],
      title: segment.sectionTitle === "Document" ? summary : segment.sectionTitle,
      summary,
      searchText: body,
      sourcePath: relativePath,
      startLine: segment.startLine,
      endLine: segment.endLine,
    } satisfies MemoryEntry];
  });
  if (atomicEntries.length) return atomicEntries;
  const fallback = blockEntry(relativePath, block);
  return fallback ? [fallback] : [];
}

function blockEntry(
  relativePath: string,
  block: LegacyBlock,
  change?: MemoryChangeMetadata,
): MemoryEntry | null {
  const summarySource = selectSummaryLine(block.body)
    ?? (isMetadataOnlyEntry(block.body) ? null : block.title);
  if (!summarySource) return null;
  const summary = truncate(summarySource, 220);
  if (!summary.trim() || (block.title === "Document" && /^v\d+$/.test(summary))) return null;
  const canonical = canonicalClaimText(block.body);
  const topic = inferTopic(relativePath, block.title, block.body);
  return {
    id: block.legacyId,
    revisionHash: sha256(canonical),
    aliasIds: [] as string[],
    structuralKey: `block:${block.blockIndex}`,
    claimKind: "block",
    topic,
    relatedTopics: topic === "overrides" ? inferContentTopics(block.title, block.body) : [],
    title: block.title,
    summary,
    searchText: block.body,
    sourcePath: relativePath,
    startLine: block.startLine,
    endLine: block.endLine,
    ...(change ? { change } : {}),
  } satisfies MemoryEntry;
}

function splitAtomicClaims(block: LegacyBlock): ClaimSegment[] {
  const output: ClaimSegment[] = [];
  const headingOccurrences = new Map<string, number>();
  const claimOrdinals = new Map<string, number>();
  let sectionTitle = block.title;
  let sectionKey = headingIdentity(sectionTitle, headingOccurrences);
  let metadataSection = isMetadataHeading(sectionTitle);
  let buffer: SegmentBuffer | null = null;
  let fence: string | null = null;

  const flush = () => {
    if (!buffer) return;
    while (!buffer.lines.at(-1)?.line.trim()) buffer.lines.pop();
    while (!buffer.lines[0]?.line.trim()) buffer.lines.shift();
    if (!buffer.lines.length) {
      buffer = null;
      return;
    }
    const body = buffer.lines.map((item) => item.line).join("\n");
    if (!selectSummaryLine(body)) {
      buffer = null;
      return;
    }
    output.push({
      kind: buffer.kind,
      sectionTitle: buffer.sectionTitle,
      structuralKey: buffer.structuralKey,
      startLine: buffer.lines[0].lineNumber,
      endLine: buffer.lines.at(-1)!.lineNumber,
      lines: buffer.lines.map((item) => item.line),
    });
    buffer = null;
  };

  const makeBuffer = (
    kind: ClaimSegment["kind"],
    line: string,
    lineNumber: number,
  ): SegmentBuffer => {
    const ordinalKey = `${sectionKey}:${kind}`;
    const ordinal = claimOrdinals.get(ordinalKey) ?? 0;
    claimOrdinals.set(ordinalKey, ordinal + 1);
    return {
      kind,
      sectionTitle,
      structuralKey: `block:${block.blockIndex}:${ordinalKey}:${ordinal}`,
      startLine: lineNumber,
      lines: [{ line, lineNumber }],
    };
  };

  for (const [offset, line] of block.lines.entries()) {
    const lineNumber = block.startLine + offset;
    const trimmed = line.trim();
    const fenceMarker = trimmed.match(/^(```+|~~~+)/)?.[1] ?? null;

    if (!fence && isMarkdownHeading(line)) {
      flush();
      sectionTitle = headingText(line);
      sectionKey = headingIdentity(sectionTitle, headingOccurrences);
      metadataSection = isMetadataHeading(sectionTitle);
      continue;
    }

    if (metadataSection) continue;

    if (fenceMarker) {
      if (!buffer) buffer = makeBuffer("paragraph", line, lineNumber);
      else buffer.lines.push({ line, lineNumber });
      fence = fence ? null : fenceMarker;
      continue;
    }

    if (!fence && isTopLevelListItem(line)) {
      flush();
      buffer = makeBuffer("listItem", line, lineNumber);
      continue;
    }

    if (!trimmed) {
      if (buffer) buffer.lines.push({ line, lineNumber });
      continue;
    }

    if (!fence && shouldSkipClaimLine(trimmed)) continue;

    if (buffer?.kind === "listItem") {
      const previousWasBlank = !buffer.lines.at(-1)?.line.trim();
      const isContinuation = /^\s+/.test(line) || !previousWasBlank;
      if (isContinuation) {
        buffer.lines.push({ line, lineNumber });
        continue;
      }
      flush();
    } else if (buffer?.kind === "paragraph" && !buffer.lines.at(-1)?.line.trim()) {
      flush();
    }

    if (!buffer) buffer = makeBuffer("paragraph", line, lineNumber);
    else buffer.lines.push({ line, lineNumber });
  }
  flush();
  return output;
}

function legacyBlockId(relativePath: string, title: string, body: string) {
  return `${relativePath}:${sha256(`${title}\n${body}`).slice(0, 16)}`;
}

function shouldSplitLegacyHeading(relativePath: string, line: string) {
  return (
    line.startsWith("# ") ||
    line.startsWith("## ") ||
    (relativePath === "memory_summary.md" && (line.startsWith("### ") || line.startsWith("#### ")))
  );
}

function shouldAtomize(sourceKind: MemorySourceKind) {
  return sourceKind === "summary" || sourceKind === "registry" || sourceKind === "adHocNote";
}

function inferSourceKind(relativePath: string): MemorySourceKind {
  if (relativePath === "memory_summary.md") return "summary";
  if (relativePath === "raw_memories.md") return "raw";
  if (relativePath.includes("rollout_summaries/")) return "rolloutSummary";
  if (relativePath.includes("ad_hoc/notes")) return "adHocNote";
  if (relativePath.includes("chronicle/resources")) return "chronicle";
  if (relativePath.endsWith("/SKILL.md")) return "skill";
  return "registry";
}

function parseChangeMetadata(body: string): MemoryChangeMetadata | undefined {
  const match = body.match(/<!--\s*agent-backplane-change\s+({[^\n]*})\s*-->/);
  if (!match) return undefined;
  try {
    const value = JSON.parse(match[1]) as Record<string, unknown>;
    const targetRevisions = value.targetRevisions;
    if (
      typeof value.id !== "string" ||
      !["replace", "append", "revert"].includes(String(value.operation)) ||
      !Array.isArray(value.targetEntryIds) ||
      !value.targetEntryIds.every((item) => typeof item === "string") ||
      !(value.revertsChangeId === null || typeof value.revertsChangeId === "string") ||
      typeof value.createdAt !== "string" ||
      !(value.schemaVersion === undefined || value.schemaVersion === "1" || value.schemaVersion === "2") ||
      !(
        targetRevisions === undefined ||
        (targetRevisions !== null &&
          typeof targetRevisions === "object" &&
          !Array.isArray(targetRevisions) &&
          Object.values(targetRevisions).every((item) => typeof item === "string"))
      )
    ) {
      return undefined;
    }
    return {
      ...(value.schemaVersion ? { schemaVersion: value.schemaVersion as "1" | "2" } : {}),
      id: value.id,
      operation: value.operation as "replace" | "append" | "revert",
      targetEntryIds: value.targetEntryIds as string[],
      revertsChangeId: value.revertsChangeId as string | null,
      createdAt: value.createdAt,
      ...(targetRevisions
        ? { targetRevisions: targetRevisions as Record<string, string> }
        : {}),
    };
  } catch {
    return undefined;
  }
}

function hasUsableContent(body: string) {
  return textLines(body).some((line) => {
    const normalized = normalizeSummaryLine(line.trim());
    return isUsableSummaryLine(normalized);
  });
}

function selectSummaryLine(body: string) {
  let inMetadataBlock = false;
  for (const line of textLines(body)) {
    const trimmed = line.trim();
    if (isMarkdownHeading(trimmed)) {
      inMetadataBlock = isMetadataHeading(trimmed);
      continue;
    }
    if (inMetadataBlock) continue;
    const normalized = normalizeSummaryLine(trimmed);
    if (isUsableSummaryLine(normalized)) return normalized;
  }
  return null;
}

function isMetadataOnlyEntry(body: string) {
  let inMetadataBlock = false;
  let sawNonHeading = false;
  for (const line of textLines(body)) {
    const trimmed = line.trim();
    if (isMarkdownHeading(trimmed)) {
      inMetadataBlock = isMetadataHeading(trimmed);
      continue;
    }
    if (!trimmed) continue;
    sawNonHeading = true;
    if (!inMetadataBlock && !isRegistryMetadataLine(normalizeSummaryLine(trimmed))) return false;
  }
  return sawNonHeading;
}

function normalizeSummaryLine(line: string) {
  let value = line.trim();
  value = value.replace(/^(?:[-+*]|\d+[.)])\s+/, "");
  value = value.replace(/^\[[ xX]\]\s+/, "");
  for (const prefix of ["desc:", "learnings:"]) {
    if (value.startsWith(prefix)) value = value.slice(prefix.length).trim();
  }
  return value;
}

function isUsableSummaryLine(line: string) {
  return Boolean(
    line &&
      !line.startsWith("#") &&
      line.toLowerCase() !== "memory update request:" &&
      line !== "§" &&
      !line.startsWith("<!-- agent-backplane-change") &&
      !isRegistryMetadataLine(line),
  );
}

function shouldSkipClaimLine(line: string) {
  const normalized = normalizeSummaryLine(line);
  return !isUsableSummaryLine(normalized);
}

function canonicalClaimText(body: string) {
  return textLines(body)
    .map((line) => normalizeSummaryLine(line).normalize("NFKC"))
    .filter((line) => line && line !== "§" && !line.startsWith("<!-- agent-backplane-change"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function headingIdentity(title: string, occurrences: Map<string, number>) {
  const normalized = title.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const occurrence = occurrences.get(normalized) ?? 0;
  occurrences.set(normalized, occurrence + 1);
  return `${normalized || "document"}:${occurrence}`;
}

function isMetadataHeading(line: string) {
  const heading = headingText(line).toLowerCase();
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

function isMarkdownHeading(line: string) {
  return /^#{1,6}\s+/.test(line.trimStart());
}

function headingText(line: string) {
  return line.trim().replace(/^#{1,6}\s+/, "").trim();
}

function isTopLevelListItem(line: string) {
  return /^(?:[-+*]|\d+[.)])\s+/.test(line);
}

function truncate(value: string, maxLength: number) {
  return [...value].slice(0, maxLength).join("");
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
