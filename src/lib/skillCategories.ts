import type { SkillCapability } from "./types";

export interface SkillCategory {
  id: string;
  key: string;
  count: number;
}

const knownNamespaces = new Set([
  "lark",
  "github",
  "openai",
  "notion",
  "slack",
  "gmail",
  "google",
]);

const ignoredPrefixes = new Set([
  "add",
  "build",
  "check",
  "create",
  "delete",
  "edit",
  "find",
  "get",
  "improve",
  "load",
  "make",
  "read",
  "redraw",
  "run",
  "save",
  "setup",
  "summarize",
  "update",
  "use",
  "using",
  "write",
]);

function namePrefix(name: string) {
  return name.trim().toLowerCase().match(/^([a-z0-9]+)(?=[:_-])/)?.[1] ?? null;
}

export function categorizeSkills(capabilities: SkillCapability[]) {
  const prefixCounts = new Map<string, number>();
  for (const capability of capabilities) {
    const prefix = namePrefix(capability.name);
    if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const categoryByCapability = new Map<string, string>();
  const categories = new Map<string, SkillCategory>();
  for (const capability of capabilities) {
    const prefix = namePrefix(capability.name);
    const usePrefix = Boolean(
      prefix
      && !ignoredPrefixes.has(prefix)
      && (knownNamespaces.has(prefix) || (prefixCounts.get(prefix) ?? 0) >= 2),
    );
    if (!usePrefix || !prefix) continue;
    const id = `prefix:${prefix}`;
    categoryByCapability.set(capability.id, id);
    const current = categories.get(id);
    categories.set(id, current
      ? { ...current, count: current.count + 1 }
      : { id, key: prefix, count: 1 });
  }

  return {
    categoryByCapability,
    categories: [...categories.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}
