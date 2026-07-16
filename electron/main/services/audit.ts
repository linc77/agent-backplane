import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CodexAuditMode,
  CodexAuditReport,
  CodexAuditRun,
  CodexAuditTask,
  EvidenceRef,
  MemorySource,
} from "../../../src/lib/types";
import { BackgroundTaskManager } from "./backgroundTask";
import { runCodexExec } from "./codex";
import { scanMemories } from "./memory";
import { resolveMemoryRoot } from "./memory/paths";
import { atomicWrite, isoNow } from "./shared";

function reportSchemaPath() {
  const candidates = [
    join(process.cwd(), "schemas", "current-memory-report.schema.json"),
    join(process.resourcesPath, "schemas", "current-memory-report.schema.json"),
  ];
  const path = candidates.find(existsSync);
  if (!path) throw new Error("current memory report schema is unavailable");
  return path;
}

function validateEvidence(evidence: EvidenceRef[], sources: Map<string, MemorySource>) {
  if (!Array.isArray(evidence) || evidence.length === 0) throw new Error("audit evidence is required");
  for (const item of evidence) {
    const source = sources.get(item.sourcePath);
    if (!source || item.startLine < 1 || item.endLine < item.startLine || item.endLine > source.lines) {
      throw new Error("codex audit returned invalid evidence");
    }
  }
}

function validateReport(
  report: CodexAuditReport,
  mode: CodexAuditMode,
  root: string,
  sources: MemorySource[],
) {
  if (report.schemaVersion !== "1" || report.mode !== mode || report.metadata.memoryRoot !== root) {
    throw new Error("codex audit report does not match the selected request");
  }
  const sourceMap = new Map(sources.map((source) => [source.relativePath, source]));
  const claims = [...report.currentClaims, ...report.staleClaims, ...report.uncertainClaims];
  for (const item of [...claims, ...report.conflicts, ...report.suggestedCorrections]) {
    if (!Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      throw new Error("codex audit returned invalid confidence");
    }
    validateEvidence(item.evidence, sourceMap);
  }
}

function cacheName(mode: CodexAuditMode) {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 17)}-${mode}.json`;
}

export async function runCodexAudit(
  rootOverride: string | null,
  mode: CodexAuditMode,
  signal?: AbortSignal,
): Promise<CodexAuditRun> {
  const root = resolveMemoryRoot(rootOverride);
  const scan = await scanMemories(root);
  const curated = mode === "curated";
  const prompt = curated
    ? "Analyze this AMM curated memory bundle from stdin. Return only the required current-memory report. Set mode exactly to curated, metadata.memoryRoot exactly to the bundle memoryRoot, and use only supplied evidence references."
    : `Analyze the Codex memory root in the current working directory. Return only the required current-memory report. Set mode exactly to full and metadata.memoryRoot exactly to ${root}. Cite inspected files and do not write files.`;
  const output = await runCodexExec({
    cwd: curated ? tmpdir() : root,
    schemaPath: reportSchemaPath(),
    signal,
    prompt,
    stdin: curated ? JSON.stringify({
      schemaVersion: "1",
      memoryRoot: root,
      generatedAt: isoNow(),
      entries: scan.entries.map((entry) => ({
        ...entry,
        boundedText: [...entry.searchText].slice(0, 12_000).join(""),
        searchText: undefined,
      })),
    }) : undefined,
  });
  const report = JSON.parse(output) as CodexAuditReport;
  validateReport(report, mode, root, scan.sources);
  const cachePath = join(root, ".amm", "codex-runs", cacheName(mode));
  await atomicWrite(cachePath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, cachePath };
}

export function idleAuditTask(): CodexAuditTask {
  return { id: null, mode: null, status: "idle", startedAt: null, finishedAt: null, error: null, run: null };
}

const auditTasks = new BackgroundTaskManager<CodexAuditTask, CodexAuditRun>(idleAuditTask());

export function getCodexAudit() {
  return auditTasks.get();
}

export function startCodexAudit(rootOverride: string | null, mode: CodexAuditMode) {
  const id = `audit-${Date.now()}`;
  return auditTasks.start(
    { id, mode, status: "running", startedAt: isoNow(), finishedAt: null, error: null, run: null },
    (signal) => runCodexAudit(rootOverride, mode, signal),
    (task, run) => ({ ...task, run }),
  );
}

export function cancelCodexAudit() {
  return auditTasks.cancel();
}
