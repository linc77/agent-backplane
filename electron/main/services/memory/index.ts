import { readFile } from "node:fs/promises";
import type { AgentKind, ScanResult } from "../../../../src/lib/types";
import { defaultAgentMemoryRoot, resolveMemoryRoot } from "./paths";
import { parseEntries } from "./parser";
import { buildMemoryProfileWithoutCache, loadMemoryProfileForRoot } from "./profile";
import { detectRisks } from "./risk";
import { scanAgentSources, scanSources } from "./scanner";

async function buildScan(root: string, agent?: AgentKind): Promise<ScanResult> {
  const sources = agent ? await scanAgentSources(agent, root) : await scanSources(root);
  const entries = [];
  for (const source of sources) {
    entries.push(...parseEntries(source.relativePath, await readFile(source.path, "utf8")));
  }
  return { root, sources, entries, risks: detectRisks(entries) };
}

export function scanMemories(rootOverride?: string | null) {
  return buildScan(resolveMemoryRoot(rootOverride));
}

export async function loadAgentMemorySnapshot(agent: AgentKind) {
  const root = defaultAgentMemoryRoot(agent);
  const scan = await buildScan(root, agent);
  return {
    agent,
    writable: agent === "codex",
    scan,
    profile: buildMemoryProfileWithoutCache(root, scan.sources, scan.entries, scan.risks),
  };
}

export async function loadMemoryProfile(rootOverride?: string | null) {
  const root = resolveMemoryRoot(rootOverride);
  const scan = await buildScan(root);
  return loadMemoryProfileForRoot(root, scan.sources, scan.entries, scan.risks);
}
