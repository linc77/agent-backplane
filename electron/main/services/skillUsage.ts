import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import type {
  AgentKind,
  SkillUsageInventory,
  SkillUsageSummary,
  SkillUsageTarget,
} from "../../../src/lib/types";

interface UsageEvent {
  at: string | null;
  manifestPath?: string;
  rawInput?: string;
  skillName?: string;
}

interface ParsedSession {
  agent: AgentKind;
  sessionKey: string;
  events: UsageEvent[];
}

interface CachedSession extends ParsedSession {
  mtimeMs: number;
  size: number;
}

export interface SkillUsageRoots {
  codex: string[];
  claudeCode: string[];
  hermes: string[];
}

const sessionCache = new Map<string, CachedSession>();

export function defaultSkillUsageRoots(): SkillUsageRoots {
  const home = homedir();
  return {
    codex: [join(home, ".codex/sessions"), join(home, ".codex/archived_sessions")],
    claudeCode: [join(home, ".claude/projects")],
    hermes: [join(home, ".hermes/sessions")],
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
  } else {
    const record = objectValue(value);
    if (record) Object.values(record).forEach((item) => collectStrings(item, output));
  }
  return output;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseCodexLine(line: string): UsageEvent[] {
  if (!line.includes("SKILL.md") || !line.includes("function_call")) return [];
  const entry = objectValue(parseJson(line));
  const payload = objectValue(entry?.payload);
  if (entry?.type !== "response_item" || payload?.type !== "function_call") return [];
  const toolName = stringValue(payload.name);
  if (!toolName || !["exec_command", "read_file", "view_file"].includes(toolName)) return [];
  const argumentsText = stringValue(payload.arguments);
  if (!argumentsText) return [];
  const input = parseJson(argumentsText) ?? argumentsText;
  return collectStrings(input)
    .filter((value) => value.includes("SKILL.md"))
    .map((rawInput) => ({ at: stringValue(entry.timestamp) ?? null, rawInput }));
}

function parseClaudeLine(line: string): UsageEvent[] {
  if (!line.includes("tool_use")) return [];
  const entry = objectValue(parseJson(line));
  const message = objectValue(entry?.message);
  if (!Array.isArray(message?.content)) return [];
  const at = stringValue(entry?.timestamp) ?? null;
  const events: UsageEvent[] = [];
  for (const value of message.content) {
    const block = objectValue(value);
    if (block?.type !== "tool_use") continue;
    const name = stringValue(block.name);
    const input = objectValue(block.input);
    if (name === "Skill") {
      const skillName = stringValue(input?.skill);
      if (skillName) events.push({ at, skillName });
    } else if (name === "Read") {
      const manifestPath = stringValue(input?.file_path);
      if (manifestPath?.endsWith("SKILL.md")) events.push({ at, manifestPath });
    } else if (name === "Bash") {
      const rawInput = stringValue(input?.command);
      if (rawInput?.includes("SKILL.md")) events.push({ at, rawInput });
    }
  }
  return events;
}

function parseHermesLine(line: string): UsageEvent[] {
  if (!line.includes("skill_view")) return [];
  const entry = objectValue(parseJson(line));
  if (entry?.role !== "tool" || entry?.name !== "skill_view") return [];
  const content = stringValue(entry.content);
  const result = content ? objectValue(parseJson(content)) : undefined;
  const skillName = result?.success === true ? stringValue(result.name) : undefined;
  return skillName ? [{ at: stringValue(entry.timestamp) ?? null, skillName }] : [];
}

function parseLine(agent: AgentKind, line: string) {
  if (agent === "codex") return parseCodexLine(line);
  if (agent === "claudeCode") return parseClaudeLine(line);
  return parseHermesLine(line);
}

async function parseSessionFile(path: string, agent: AgentKind, start = 0) {
  const events: UsageEvent[] = [];
  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf8", start }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    events.push(...parseLine(agent, line));
  }
  return events;
}

async function listJsonlFiles(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listJsonlFiles(path);
    return entry.isFile() && entry.name.endsWith(".jsonl") ? [path] : [];
  }));
  return nested.flat();
}

async function loadSession(path: string, agent: AgentKind): Promise<ParsedSession> {
  const metadata = await stat(path);
  const cached = sessionCache.get(path);
  if (cached?.size === metadata.size && cached.mtimeMs === metadata.mtimeMs) return cached;

  const canAppend = cached && metadata.size > cached.size && metadata.mtimeMs >= cached.mtimeMs;
  const events = canAppend
    ? [...cached.events, ...await parseSessionFile(path, agent, cached.size)]
    : await parseSessionFile(path, agent);
  const normalized = normalizePath(path);
  const claudeParent = agent === "claudeCode"
    ? normalized.match(/\/([0-9a-f-]{36})\/subagents\//i)?.[1]
    : undefined;
  const uuid = basename(path).match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
  const sessionKey = `${agent}:${claudeParent ?? uuid ?? basename(path, ".jsonl")}`;
  const next = { agent, sessionKey, events, size: metadata.size, mtimeMs: metadata.mtimeMs };
  sessionCache.set(path, next);
  return next;
}

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/$/, "");
}

function eventMatches(event: UsageEvent, target: SkillUsageTarget) {
  if (event.skillName && event.skillName === target.name) return true;
  const paths = target.manifestPaths.map(normalizePath);
  if (event.manifestPath) return paths.includes(normalizePath(event.manifestPath));
  const rawInput = event.rawInput ? normalizePath(event.rawInput) : "";
  return paths.some((path) => rawInput.includes(path));
}

function latestTimestamp(current: string | null, candidate: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

export async function loadSkillUsage(
  targets: SkillUsageTarget[],
  roots: SkillUsageRoots = defaultSkillUsageRoots(),
): Promise<SkillUsageInventory> {
  const filesByAgent = await Promise.all((Object.keys(roots) as AgentKind[]).map(async (agent) => ({
    agent,
    files: (await Promise.all(roots[agent].map(listJsonlFiles))).flat(),
  })));
  const sessions = (await Promise.all(filesByAgent.flatMap(({ agent, files }) =>
    files.map((path) => loadSession(path, agent)))));

  const summaries: SkillUsageSummary[] = targets.map((target) => {
    const agentCounts: Record<AgentKind, number> = { codex: 0, claudeCode: 0, hermes: 0 };
    const countedSessions = new Set<string>();
    let lastUsedAt: string | null = null;
    for (const session of sessions) {
      const matchingEvents = session.events.filter((event) => eventMatches(event, target));
      if (!matchingEvents.length) continue;
      if (!countedSessions.has(session.sessionKey)) {
        countedSessions.add(session.sessionKey);
        agentCounts[session.agent] += 1;
      }
      for (const event of matchingEvents) {
        lastUsedAt = latestTimestamp(lastUsedAt, event.at);
      }
    }
    return {
      capabilityId: target.capabilityId,
      totalCount: agentCounts.codex + agentCounts.claudeCode + agentCounts.hermes,
      lastUsedAt,
      agentCounts,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scannedSessions: new Set(sessions.map((session) => session.sessionKey)).size,
    summaries,
  };
}
