import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import type { AgentKind, MemorySource, MemorySourceKind } from "../../../../src/lib/types";
import { sha256, textLines } from "../shared";

async function isDirectory(path: string) {
  return stat(path).then((value) => value.isDirectory()).catch(() => false);
}

async function isFile(path: string) {
  return stat(path).then((value) => value.isFile()).catch(() => false);
}

async function readSource(root: string, path: string, kind: MemorySourceKind): Promise<MemorySource> {
  const [text, metadata] = await Promise.all([readFile(path, "utf8"), stat(path)]);
  const hash = sha256(text);
  return {
    id: hash.slice(0, 16),
    path,
    relativePath: relative(root, path).split(sep).join("/"),
    kind,
    modifiedMs: metadata.mtimeMs,
    bytes: metadata.size,
    lines: textLines(text).length,
    sha256: hash,
  };
}

async function collectFile(
  root: string,
  base: string,
  name: string,
  kind: MemorySourceKind,
  output: MemorySource[],
) {
  const path = join(base, name);
  if (await isFile(path)) {
    output.push(await readSource(root, path, kind));
  }
}

async function collectDirectory(
  root: string,
  directory: string,
  kind: MemorySourceKind,
  output: MemorySource[],
) {
  if (!(await isDirectory(directory))) {
    return;
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (extname(entry.name) === ".md" && (entry.isFile() || (await isFile(path)))) {
      output.push(await readSource(root, path, kind));
    }
  }
}

export async function scanSources(root: string) {
  const sources: MemorySource[] = [];
  await collectFile(root, root, "memory_summary.md", "summary", sources);
  await collectFile(root, root, "MEMORY.md", "registry", sources);
  await collectFile(root, root, "raw_memories.md", "raw", sources);
  await collectDirectory(root, join(root, "rollout_summaries"), "rolloutSummary", sources);
  await collectDirectory(root, join(root, "extensions/ad_hoc/notes"), "adHocNote", sources);
  await collectDirectory(root, join(root, "extensions/chronicle/resources"), "chronicle", sources);

  const skillsDirectory = join(root, "skills");
  if (await isDirectory(skillsDirectory)) {
    for (const entry of await readdir(skillsDirectory)) {
      await collectFile(root, join(skillsDirectory, entry), "SKILL.md", "skill", sources);
    }
  }
  return sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function scanClaudeSources(root: string) {
  const sources: MemorySource[] = [];
  if (!(await isDirectory(root))) {
    return sources;
  }
  for (const projectEntry of await readdir(root, { withFileTypes: true })) {
    const project = join(root, projectEntry.name);
    if (!projectEntry.isDirectory() && !(await isDirectory(project))) {
      continue;
    }
    await collectFile(root, project, "MEMORY.md", "registry", sources);
    await collectDirectory(root, join(project, "memory"), "registry", sources);
  }
  return sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function scanHermesSources(root: string) {
  const sources: MemorySource[] = [];
  await collectFile(root, root, "MEMORY.md", "registry", sources);
  await collectFile(root, root, "USER.md", "registry", sources);
  return sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function scanAgentSources(agent: AgentKind, root: string) {
  switch (agent) {
    case "codex":
      return scanSources(root);
    case "claudeCode":
      return scanClaudeSources(root);
    case "hermes":
      return scanHermesSources(root);
  }
}
