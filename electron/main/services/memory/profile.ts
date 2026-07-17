import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  MemoryEntry,
  MemoryProfile,
  MemoryProfileConfidence,
  MemoryProfileSection,
  MemoryProfileStability,
  MemorySource,
  MemorySourceKind,
  MemoryTopic,
  RiskFlag,
} from "../../../../src/lib/types";
import { isoNow, sha256 } from "../shared";

const supportedGenerators = new Set([
  "codex-profile-v1",
  "deterministic-profile-v3",
  "deterministic-profile-v3-fallback",
]);
const currentTopics = new Set<MemoryTopic>(["profile", "projects", "rules", "tools", "writing", "overrides"]);
const durableKinds = new Set<MemorySourceKind>(["summary", "registry", "adHocNote", "skill"]);
const sourceRanks: Record<MemorySourceKind, number> = {
  adHocNote: 0,
  registry: 1,
  summary: 2,
  skill: 3,
  rolloutSummary: 4,
  raw: 5,
  chronicle: 6,
};
const stopwords = new Set([
  "the", "user", "users", "your", "you", "and", "for", "with", "from", "that", "this",
  "current", "memory", "profile", "summary", "project", "projects", "prefers", "uses",
]);

function sourceForEntry(sources: MemorySource[], entry: MemoryEntry) {
  return sources.find((source) => source.relativePath === entry.sourcePath);
}

function truthTopic(entry: MemoryEntry) {
  if (entry.topic !== "overrides") {
    return entry.topic;
  }
  return entry.relatedTopics.find((topic) => currentTopics.has(topic)) ?? "overrides";
}

function currentEntries(sources: MemorySource[], entries: MemoryEntry[], risks: RiskFlag[]) {
  const durable = entries.filter((entry) => {
    const source = sourceForEntry(sources, entry);
    const hasCurrentTopic = currentTopics.has(entry.topic) || entry.relatedTopics.some((topic) => currentTopics.has(topic));
    return hasCurrentTopic && (!source || durableKinds.has(source.kind));
  });
  const staleIds = new Set<string>();
  for (const correction of durable.filter((entry) => entry.topic === "overrides" || sourceForEntry(sources, entry)?.kind === "adHocNote")) {
    for (const entry of durable) {
      const entryRank = sourceForEntry(sources, entry)?.kind;
      const correctionRank = sourceForEntry(sources, correction)?.kind;
      if (
        entry.id !== correction.id &&
        truthTopic(entry) === truthTopic(correction) &&
        (entryRank ? sourceRanks[entryRank] : Number.MAX_SAFE_INTEGER) >
          (correctionRank ? sourceRanks[correctionRank] : Number.MAX_SAFE_INTEGER)
      ) {
        staleIds.add(entry.id);
      }
    }
  }
  const riskIds = new Set(risks.map((risk) => risk.entryId));
  return durable
    .filter((entry) => !staleIds.has(entry.id) && !riskIds.has(entry.id))
    .sort((left, right) => {
      const leftKind = sourceForEntry(sources, left)?.kind;
      const rightKind = sourceForEntry(sources, right)?.kind;
      return (
        (leftKind ? sourceRanks[leftKind] : Number.MAX_SAFE_INTEGER) -
          (rightKind ? sourceRanks[rightKind] : Number.MAX_SAFE_INTEGER) ||
        left.startLine - right.startLine ||
        left.id.localeCompare(right.id)
      );
    });
}

function sourceHash(sources: MemorySource[]) {
  return sha256(sources.map((source) => `${source.relativePath}${source.sha256}`).join(""));
}

function profileTerms(entry: MemoryEntry) {
  return new Set(
    `${entry.title} ${entry.summary} ${entry.searchText}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3 && !stopwords.has(term)),
  );
}

function relatedEntries(anchor: MemoryEntry, current: MemoryEntry[], used: Set<string>) {
  const terms = profileTerms(anchor);
  const matches = [anchor];
  for (const entry of current) {
    if (
      matches.length >= 4 ||
      entry.id === anchor.id ||
      used.has(entry.id) ||
      ![...profileTerms(entry)].some((term) => terms.has(term))
    ) {
      continue;
    }
    matches.push(entry);
  }
  return matches;
}

function observationTitle(entry: MemoryEntry) {
  const text = `${entry.title} ${entry.summary}`.replaceAll("`", "");
  const lower = text.toLowerCase();
  if (lower.includes("python/rust") || text.includes("主技术栈")) return "你把 Python/Rust 作为当前主栈";
  if (lower.includes("codex") && lower.includes("local engineering")) return "你把 Codex 当成本机工程系统使用";
  if (lower.includes("skills-manager") || lower.includes("local skills") || lower.includes(".agents/skills")) return "你会核对本机技能系统的真实结构";
  if (lower.includes("maka-agent") || lower.includes("upstream") || lower.includes("reset --hard") || text.includes("更新项目")) return "你要求项目更新先确认分支安全";
  if (lower.includes("interview") || text.includes("面试") || lower.includes("glossary")) return "你需要把 Agent 术语讲成系统链路";
  if (lower.includes("rag") || text.includes("向量库") || text.includes("长期记忆")) return "你把记忆看成带状态的长期系统";
  if (lower.includes("x posts") || text.includes("写作") || text.includes("风格")) return "你希望内容表达具体而不模板";
  const fallback: Record<MemoryTopic, string> = {
    profile: "你希望画像围绕真实偏好持续更新",
    projects: "你处理项目时重视边界和可回滚路径",
    rules: "你希望协作规则落到可执行行为",
    tools: "你偏好用真实日志和命令判断工具问题",
    writing: "你要的是具体批评和结构修正",
    activityLog: "这条活动记录更适合作为历史背景",
    audit: "你会审查记忆结论和证据",
    overrides: "你会用修正笔记覆盖过时记忆",
    sources: "你需要能追溯资料来源",
    staleRisks: "这条记忆存在过期或冲突风险",
  };
  return fallback[entry.topic];
}

function observation(entry: MemoryEntry) {
  const text = entry.summary.replaceAll("`", "");
  const lower = text.toLowerCase();
  if (lower.includes("python/rust") || text.includes("主技术栈")) return "你当前更认可 Python/Rust 作为主技术栈，旧说法需要被修正覆盖";
  if (lower.includes("codex") && lower.includes("local engineering")) return "你把 Codex 当成本机工程系统使用，并希望它的判断基于仓库、命令、日志和验证结果";
  if (lower.includes("skills-manager") || lower.includes("local skills") || lower.includes(".agents/skills")) return "遇到本机技能系统问题时，你希望我检查真实文件系统对象，并区分软链接、真实目录和管理器数据库";
  const fallback: Record<MemoryTopic, string> = {
    profile: "这条记忆保留的是你的长期偏好或当前状态，画像需要随新证据持续更新",
    projects: "这条记忆提醒我处理项目时要先确认边界、来源和可回滚路径",
    rules: "这条记忆提醒我把你的偏好落实成具体协作行为，而不是停在原则描述",
    tools: "这条记忆提醒我用真实文件、命令输出和日志来判断工具问题",
    writing: "这条记忆提醒我给你具体批评、结构修正和表达边界，而不是机械总结",
    activityLog: "这条记忆更适合作为历史背景，需要避免覆盖当前事实",
    audit: "这条记忆需要结合审查结论和原始证据",
    overrides: "这条修正记忆拥有更高优先级，可以覆盖旧的画像判断",
    sources: "这条记忆强调资料来源需要能被打开和追溯",
    staleRisks: "这条记忆提示相关事实可能过期或互相冲突，需要谨慎呈现",
  };
  return fallback[entry.topic];
}

function sectionId(entry: MemoryEntry, existing: Set<string>) {
  const words = `${entry.title} ${entry.summary}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !stopwords.has(term))
    .slice(0, 6);
  const base = words.join("-") || `observed-${sha256(entry.id).slice(0, 12)}`;
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function buildSections(current: MemoryEntry[]) {
  const sections: MemoryProfileSection[] = [];
  const used = new Set<string>();
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const anchor of current) {
    if (sections.length >= 6 || used.has(anchor.id)) continue;
    const title = [...observationTitle(anchor)].slice(0, 42).join("");
    if (titles.has(title)) continue;
    const matches = relatedEntries(anchor, current, used);
    matches.forEach((entry) => used.add(entry.id));
    const observations = [...new Set(matches.map(observation))].slice(0, 3);
    const body = observations.length === 1
      ? `这段画像来自当前记忆里的一个稳定信号：${observations[0]}。`
      : `这些记忆共同指向一个模式：${observations.join("；")}。`;
    const confidence: MemoryProfileConfidence = matches.some((entry) => entry.topic === "overrides")
      ? "high"
      : matches.length >= 2 ? "medium" : "low";
    const stability: MemoryProfileStability = matches.length >= 2 || matches.some((entry) => entry.topic === "overrides")
      ? "stable" : "uncertain";
    const id = sectionId(anchor, ids);
    ids.add(id);
    titles.add(title);
    sections.push({
      id,
      title,
      body,
      evidence: matches.map((entry) => ({
        sourcePath: entry.sourcePath,
        startLine: entry.startLine,
        endLine: entry.endLine,
        summary: observation(entry),
      })),
      confidence,
      stability,
    });
  }
  return sections;
}

export function buildMemoryProfileWithoutCache(
  root: string,
  sources: MemorySource[],
  entries: MemoryEntry[],
  risks: RiskFlag[],
): MemoryProfile {
  const current = currentEntries(sources, entries, risks);
  return {
    schemaVersion: "1",
    generatedAt: isoNow(),
    sourceHash: sourceHash(sources),
    generator: "deterministic-profile-v3",
    cachePath: join(root, ".backplane", "profile.json"),
    sections: buildSections(current),
    metadata: { memoryRoot: root, inputEntries: entries.length, currentEntries: current.length },
  };
}

export async function buildMemoryProfile(root: string, sources: MemorySource[], entries: MemoryEntry[], risks: RiskFlag[]) {
  const profile = buildMemoryProfileWithoutCache(root, sources, entries, risks);
  await mkdir(dirname(profile.cachePath), { recursive: true });
  await writeFile(profile.cachePath, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
  return profile;
}

export async function loadMemoryProfileForRoot(root: string, sources: MemorySource[], entries: MemoryEntry[], risks: RiskFlag[]) {
  const current = currentEntries(sources, entries, risks);
  const hash = sourceHash(sources);
  const cachePath = join(root, ".backplane", "profile.json");
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as MemoryProfile;
    const uniqueTitles = new Set(cached.sections?.map((section) => section.title));
    const uniqueIds = new Set(cached.sections?.map((section) => section.id));
    if (
      cached.schemaVersion === "1" &&
      supportedGenerators.has(cached.generator) &&
      cached.sourceHash === hash &&
      Array.isArray(cached.sections) &&
      uniqueTitles.size === cached.sections.length &&
      uniqueIds.size === cached.sections.length
    ) {
      return {
        ...cached,
        cachePath,
        sourceHash: hash,
        metadata: { memoryRoot: root, inputEntries: entries.length, currentEntries: current.length },
      };
    }
  } catch {
    // A missing or stale cache falls back to deterministic generation.
  }
  return buildMemoryProfile(root, sources, entries, risks);
}
