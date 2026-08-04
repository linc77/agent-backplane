import { readFile, stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import type { AgentKind, MemoryEntry, MemorySource, ScanResult } from "../../../../src/lib/types";
import { isoNow, sha256, textLines } from "../shared";
import { memoryAdapter } from "./adapters";
import { parseEntries } from "./parser";
import { detectRisks } from "./risk";
import { stabilizeMemoryEntryIds } from "./identity";

interface CachedDocument {
  modifiedMs: number;
  bytes: number;
  source: MemorySource;
  entries: MemoryEntry[];
}

const cache = new Map<string, Map<string, CachedDocument>>();
const catalogEpochs = new Map<string, number>();
const pendingLoads = new Map<string, { epoch: number; promise: Promise<ScanResult> }>();

function catalogKey(agent: AgentKind, root: string) {
  return `${agent}:${root}`;
}

export function loadMemoryCatalog(agent: AgentKind, root: string): Promise<ScanResult> {
  const key = catalogKey(agent, root);
  const epoch = catalogEpochs.get(key) ?? 0;
  const pending = pendingLoads.get(key);
  if (pending?.epoch === epoch) return pending.promise;
  if (pending) {
    return pending.promise
      .catch(() => undefined)
      .then(() => loadMemoryCatalog(agent, root));
  }
  const task = loadMemoryCatalogUncached(agent, root, epoch).finally(() => {
    if (pendingLoads.get(key)?.promise === task) pendingLoads.delete(key);
  });
  pendingLoads.set(key, { epoch, promise: task });
  return task;
}

async function loadMemoryCatalogUncached(
  agent: AgentKind,
  root: string,
  epoch: number,
): Promise<ScanResult> {
  const adapter = memoryAdapter(agent);
  const discovered = (await adapter.discover(root)).sort((left, right) => left.path.localeCompare(right.path));
  const previous = cache.get(catalogKey(agent, root)) ?? new Map<string, CachedDocument>();
  const next = new Map<string, CachedDocument>();
  let reusedSources = 0;
  let changedSources = 0;

  for (const item of discovered) {
    const metadata = await stat(item.path);
    const cached = previous.get(item.path);
    if (cached && cached.modifiedMs === metadata.mtimeMs && cached.bytes === metadata.size) {
      next.set(item.path, cached);
      reusedSources += 1;
      continue;
    }

    const text = await readFile(item.path, "utf8");
    const hash = sha256(text);
    const relativePath = relative(root, item.path).split(sep).join("/");
    const source: MemorySource = {
      id: hash.slice(0, 16),
      path: item.path,
      relativePath,
      kind: item.kind,
      modifiedMs: metadata.mtimeMs,
      bytes: metadata.size,
      lines: textLines(text).length,
      sha256: hash,
    };
    next.set(item.path, {
      modifiedMs: metadata.mtimeMs,
      bytes: metadata.size,
      source,
      entries: parseEntries(relativePath, text, item.kind),
    });
    changedSources += 1;
  }

  const documents = [...next.values()].sort((left, right) =>
    left.source.relativePath.localeCompare(right.source.relativePath));
  const sources = documents.map((document) => document.source);
  const entries = await stabilizeMemoryEntryIds(
    agent,
    root,
    documents.flatMap((document) => document.entries),
  );
  const entriesBySource = new Map<string, MemoryEntry[]>();
  for (const entry of entries) {
    const sourceEntries = entriesBySource.get(entry.sourcePath) ?? [];
    sourceEntries.push(entry);
    entriesBySource.set(entry.sourcePath, sourceEntries);
  }
  for (const document of documents) {
    document.entries = entriesBySource.get(document.source.relativePath) ?? [];
  }
  const key = catalogKey(agent, root);
  if ((catalogEpochs.get(key) ?? 0) === epoch) cache.set(key, next);
  return {
    root,
    sources,
    entries,
    risks: detectRisks(entries),
    catalog: { indexedAt: isoNow(), reusedSources, changedSources },
  };
}

export function clearMemoryCatalog(root: string, agent?: AgentKind) {
  if (agent) {
    const key = catalogKey(agent, root);
    cache.delete(key);
    catalogEpochs.set(key, (catalogEpochs.get(key) ?? 0) + 1);
    return;
  }
  const keys = new Set([...cache.keys(), ...pendingLoads.keys(), ...catalogEpochs.keys()]);
  for (const key of keys) {
    if (key.endsWith(`:${root}`)) cache.delete(key);
    if (key.endsWith(`:${root}`)) {
      catalogEpochs.set(key, (catalogEpochs.get(key) ?? 0) + 1);
    }
  }
}
