import { link, mkdir, open, readFile, realpath, rm, stat, unlink } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import type {
  AgentKind,
  CorrectionDraft,
  MemoryChangeMetadata,
  MemoryChangeTarget,
  MemoryChangeWriteResult,
} from "../../../../src/lib/types";
import { clearMemoryCatalog } from "./catalog";
import { memoryAdapter } from "./adapters";

function timestamp(date = new Date()) {
  const two = (value: number) => String(value).padStart(2, "0");
  const three = (value: number) => String(value).padStart(3, "0");
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}${three(date.getMilliseconds())}`;
}

function safeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "memory-update";
}

function normalizeContent(content: string) {
  const trimmed = content.trim();
  return trimmed.toLowerCase().startsWith("memory update request:")
    ? `${trimmed}\n`
    : `Memory update request:\n\n${trimmed}\n`;
}

function changeMetadata(
  slug: string,
  operation: MemoryChangeMetadata["operation"],
  targets: MemoryChangeTarget[],
  revertsChangeId: string | null,
  date = new Date(),
): MemoryChangeMetadata {
  return {
    id: `${timestamp(date)}-${safeSlug(slug)}`,
    operation,
    targetEntryIds: [...new Set(targets.map((target) => target.entryId))],
    revertsChangeId,
    createdAt: date.toISOString(),
  };
}

async function buildDraft(
  agent: AgentKind,
  root: string,
  slug: string,
  content: string,
  targets: MemoryChangeTarget[],
  operation: MemoryChangeMetadata["operation"] = "replace",
  revertsChangeId: string | null = null,
) {
  const normalizedSlug = safeSlug(slug);
  const effectiveOperation = operation === "replace" && targets.length === 0 ? "append" : operation;
  const change = changeMetadata(normalizedSlug, effectiveOperation, targets, revertsChangeId);
  const filename = `${change.id}.md`;
  const targetSourcePaths = [...new Set(targets.map((target) => target.sourcePath))];
  const targetPath = await memoryAdapter(agent).correctionTarget(root, filename, targetSourcePaths);
  return {
    agent,
    slug: normalizedSlug,
    targetPath,
    targetSourcePaths,
    change,
    content: normalizeContent(content),
  } satisfies CorrectionDraft;
}

export function draftCorrection(
  agent: AgentKind,
  root: string,
  slug: string,
  bulletLines: string[],
  targets: MemoryChangeTarget[],
) {
  const body = bulletLines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
  return buildDraft(agent, root, slug, body, targets);
}

export function draftCorrectionFromContent(
  agent: AgentKind,
  root: string,
  slug: string,
  content: string,
  targets: MemoryChangeTarget[],
) {
  return buildDraft(agent, root, slug, content, targets);
}

export function draftRevert(
  agent: AgentKind,
  root: string,
  change: MemoryChangeMetadata,
  sourcePath: string,
) {
  return buildDraft(
    agent,
    root,
    `revert-${change.id}`,
    `- Revert memory change ${change.id}.`,
    [{ entryId: change.id, sourcePath }],
    "revert",
    change.id,
  );
}

export async function getSourceExcerpt(root: string, path: string, startLine: number, endLine: number) {
  const [canonicalRoot, canonicalPath] = await Promise.all([realpath(root), realpath(path)]);
  const relativePath = relative(canonicalRoot, canonicalPath);
  const isOutsideRoot = relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
  if (isOutsideRoot) throw new Error("source path must stay inside the selected memory root");
  return (await readFile(canonicalPath, "utf8")).split(/\r?\n/).slice(startLine - 1, endLine).join("\n");
}

async function validateTarget(root: string, draft: CorrectionDraft) {
  const adapter = memoryAdapter(draft.agent);
  const expected = resolve(await adapter.correctionTarget(
    root,
    basename(draft.targetPath),
    draft.targetSourcePaths,
  ));
  const target = resolve(draft.targetPath);
  const rootRelative = relative(resolve(root), target);
  const outsideRoot = rootRelative === ".." || rootRelative.startsWith(`..${sep}`) || isAbsolute(rootRelative);
  if (target !== expected || outsideRoot || extname(target) !== ".md") {
    throw new Error("memory changes can only be written to the selected agent memory store");
  }
  return target;
}

async function validateCanonicalParent(root: string, target: string) {
  await mkdir(dirname(target), { recursive: true });
  const [canonicalRoot, canonicalParent] = await Promise.all([
    realpath(root),
    realpath(dirname(target)),
  ]);
  const rootRelative = relative(canonicalRoot, canonicalParent);
  const outsideRoot = rootRelative === ".." || rootRelative.startsWith(`..${sep}`) || isAbsolute(rootRelative);
  if (outsideRoot) {
    throw new Error("memory changes can only be written inside the selected agent memory store");
  }
}

async function createChangeFile(target: string, content: string) {
  await mkdir(dirname(target), { recursive: true });
  if (await stat(target).then(() => true).catch(() => false)) {
    throw new Error("memory change target already exists");
  }
  const temporary = `${target}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await link(temporary, target);
    await unlink(temporary);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function appendChange(target: string, content: string) {
  await mkdir(dirname(target), { recursive: true });
  const file = await open(target, "a", 0o600);
  try {
    await file.writeFile(`\n${content}`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function writeCorrection(root: string, draft: CorrectionDraft): Promise<MemoryChangeWriteResult> {
  const target = await validateTarget(root, draft);
  await validateCanonicalParent(root, target);
  const adapter = memoryAdapter(draft.agent);
  const serialized = adapter.serializeChange(draft.change, draft.content);
  if (adapter.writeMode === "append") await appendChange(target, serialized);
  else await createChangeFile(target, serialized);
  clearMemoryCatalog(root, draft.agent);
  return { path: target, changeId: draft.change.id };
}
