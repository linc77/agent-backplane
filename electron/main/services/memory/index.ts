import type {
  AgentKind,
  MemoryProfileLocale,
  ScanResult,
} from "../../../../src/lib/types";
import { loadMemoryCatalog } from "./catalog";
import { defaultAgentMemoryRoot, resolveMemoryRoot } from "./paths";
import { loadMemoryProfileForRoot } from "./profile";

async function buildScan(root: string, agent?: AgentKind): Promise<ScanResult> {
  return loadMemoryCatalog(agent ?? "codex", root);
}

export function scanMemories(rootOverride?: string | null) {
  return buildScan(resolveMemoryRoot(rootOverride));
}

export async function loadAgentMemorySnapshot(agent: AgentKind, locale: MemoryProfileLocale) {
  const root = defaultAgentMemoryRoot(agent);
  const scan = await buildScan(root, agent);
  const profileState = await loadMemoryProfileForRoot(
    root,
    locale,
    scan.sources,
    scan.entries,
    scan.risks,
  );
  return {
    agent,
    writable: true,
    scan,
    ...profileState,
  };
}
