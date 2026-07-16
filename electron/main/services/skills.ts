import { readFile, readdir, realpath, stat, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type {
  SkillCapability,
  SkillCopy,
  SkillInventory,
  SkillRootStatus,
  SkillScope,
} from "../../../src/lib/types";
import { atomicWrite, isoNow, sha256 } from "./shared";

const maxDiscoveryDepth = 3;

interface SkillRoot {
  id: string;
  label: string;
  path: string;
  tool: string;
  scope: SkillScope;
}

async function isDirectory(path: string) {
  return stat(path).then((value) => value.isDirectory()).catch(() => false);
}

async function isFile(path: string) {
  return stat(path).then((value) => value.isFile()).catch(() => false);
}

function globalRoot(id: string, label: string, path: string, tool: string): SkillRoot {
  return { id, label, path, tool, scope: "global" };
}

function projectRoot(id: string, root: string, relativePath: string, tool: string): SkillRoot {
  return { id, label: `Project · ${tool}`, path: join(root, relativePath), tool, scope: "project" };
}

async function detectCurrentProjectRoot() {
  let candidate = resolve(process.cwd());
  while (true) {
    for (const marker of [".git", "AGENTS.md", "package.json"]) {
      if (await stat(join(candidate, marker)).then(() => true).catch(() => false)) {
        return candidate;
      }
    }
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

async function defaultSkillRoots(projectRootOverride?: string | null) {
  const home = homedir();
  const roots: SkillRoot[] = [
    globalRoot("agents", "Agent Skills", join(home, ".agents/skills"), "Agents"),
    globalRoot("codex", "Codex", join(home, ".codex/skills"), "Codex"),
    globalRoot("claude", "Claude Code", join(home, ".claude/skills"), "Claude Code"),
    globalRoot("hermes", "Hermes", join(home, ".hermes/skills"), "Hermes"),
    globalRoot("gemini", "Gemini CLI", join(home, ".gemini/skills"), "Gemini CLI"),
    globalRoot("cursor", "Cursor", join(home, ".cursor/skills"), "Cursor"),
    globalRoot("opencode", "OpenCode", join(home, ".config/opencode/skills"), "OpenCode"),
  ];
  const requested = projectRootOverride?.trim();
  const project = requested ? resolve(requested) : await detectCurrentProjectRoot();
  if (project) {
    roots.push(
      projectRoot("project-agents", project, ".agents/skills", "Agents"),
      projectRoot("project-codex", project, ".codex/skills", "Codex"),
      projectRoot("project-claude", project, ".claude/skills", "Claude Code"),
      projectRoot("project-hermes", project, ".hermes/skills", "Hermes"),
    );
  }
  const seen = new Set<string>();
  return roots.filter((root) => {
    if (seen.has(root.path)) return false;
    seen.add(root.path);
    return true;
  });
}

async function collectManifests(directory: string, depth: number, output: string[]) {
  if (depth > maxDiscoveryDepth) return;
  const direct = join(directory, "SKILL.md");
  if (await isFile(direct)) {
    output.push(direct);
    return;
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectManifests(path, depth + 1, output);
    } else if (entry.isSymbolicLink() && (await isDirectory(path))) {
      const manifest = join(path, "SKILL.md");
      if (await isFile(manifest)) output.push(manifest);
    }
  }
}

export function parseSkillManifest(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new Error("Missing YAML frontmatter");
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) throw new Error("Unclosed YAML frontmatter");
  const frontmatter = lines.slice(1, end);
  if (frontmatter.length === 0) throw new Error("Empty YAML frontmatter");
  const scalar = (key: string) => {
    const prefix = `${key}:`;
    for (const [index, line] of frontmatter.entries()) {
      const trimmed = line.trim();
      if (!trimmed.startsWith(prefix)) continue;
      const value = trimmed.slice(prefix.length).trim();
      if ([">", ">-", ">+", "|", "|-", "|+"].includes(value)) {
        const block: string[] = [];
        for (const continuation of frontmatter.slice(index + 1)) {
          if (continuation.trim() && !/^\s/.test(continuation)) break;
          if (continuation.trim()) block.push(continuation.trim());
        }
        return value.startsWith(">") ? block.join(" ") : block.join("\n");
      }
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        return value.slice(1, -1);
      }
      return value;
    }
    return "";
  };
  const name = scalar("name");
  const description = scalar("description");
  if (!name.trim()) throw new Error("Missing frontmatter name");
  if (!description.trim()) throw new Error("Missing frontmatter description");
  return {
    name,
    description,
    markdown: lines.slice(end + 1).join("\n").trim(),
  };
}

async function readSkillCopy(root: SkillRoot, manifestPath: string): Promise<SkillCopy> {
  const path = dirname(manifestPath);
  const fallbackName = path.split(/[\\/]/).at(-1) || "unnamed-skill";
  const filesystemKind = await lstat(path)
    .then((metadata) => (metadata.isSymbolicLink() ? "symlink" as const : "directory" as const))
    .catch(() => "directory" as const);
  const resolvedPath = await realpath(path).catch(() => path);
  let bytes = Buffer.alloc(0);
  let manifest: { name: string; description: string; markdown: string } | null = null;
  let markdown = "";
  let issue: string | null = null;
  try {
    bytes = await readFile(manifestPath);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    markdown = text.trim();
    manifest = parseSkillManifest(text);
    markdown = manifest.markdown;
  } catch (error) {
    issue = error instanceof Error ? error.message : String(error);
  }
  return {
    id: sha256(path),
    name: manifest?.name ?? fallbackName,
    description: manifest?.description ?? "",
    markdown,
    path,
    manifestPath,
    tool: root.tool,
    scope: root.scope,
    filesystemKind,
    resolvedPath,
    valid: Boolean(manifest),
    issue,
    contentHash: sha256(bytes),
  };
}

function groupCapabilities(copies: SkillCopy[]) {
  const groups = new Map<string, SkillCopy[]>();
  for (const copy of copies) {
    const id = copy.valid ? copy.contentHash : `invalid-${copy.id}`;
    groups.set(id, [...(groups.get(id) ?? []), copy]);
  }
  return [...groups.entries()]
    .map(([id, items]): SkillCapability => {
      const sorted = items.toSorted((left, right) => left.path.localeCompare(right.path));
      const representative = sorted[0];
      return {
        id,
        name: representative.name,
        description: representative.description,
        markdown: representative.markdown,
        contentHash: representative.contentHash,
        health: sorted.every((copy) => copy.valid) ? "ready" : "invalid",
        copyCount: sorted.length,
        tools: [...new Set(sorted.map((copy) => copy.tool))].toSorted(),
        copies: sorted,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export async function buildSkillInventory(roots: SkillRoot[], snapshotPath: string) {
  const copies: SkillCopy[] = [];
  const statuses: SkillRootStatus[] = [];
  for (const root of roots) {
    const start = copies.length;
    const exists = await isDirectory(root.path);
    if (exists) {
      const manifests: string[] = [];
      await collectManifests(root.path, 0, manifests);
      for (const manifest of [...new Set(manifests)].toSorted()) {
        copies.push(await readSkillCopy(root, manifest));
      }
    }
    statuses.push({ ...root, exists, copyCount: copies.length - start });
  }
  const capabilities = groupCapabilities(copies);
  const inventory: SkillInventory = {
    generatedAt: isoNow(),
    provider: "native-filesystem",
    snapshotPath,
    snapshotError: null,
    capabilityCount: capabilities.length,
    copyCount: copies.length,
    duplicateGroupCount: capabilities.filter((capability) => capability.copyCount > 1).length,
    invalidCount: copies.filter((copy) => !copy.valid).length,
    roots: statuses,
    capabilities,
  };
  try {
    await atomicWrite(snapshotPath, `${JSON.stringify(inventory, null, 2)}\n`);
  } catch (error) {
    inventory.snapshotError = error instanceof Error ? error.message : String(error);
  }
  return inventory;
}

export async function loadSkillInventory(projectRootOverride?: string | null) {
  return buildSkillInventory(
    await defaultSkillRoots(projectRootOverride),
    join(homedir(), ".agent-memory-manager", "skill-inventory.json"),
  );
}
