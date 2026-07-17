import type { SkillCapability } from "./types";

export type SkillSemanticCategory =
  | "writing"
  | "development"
  | "design"
  | "data"
  | "automation"
  | "research"
  | "uncategorized";

export interface SkillCategory {
  id: string;
  kind: "namespace" | "semantic";
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

const semanticRules: Array<{
  key: Exclude<SkillSemanticCategory, "uncategorized">;
  pattern: RegExp;
}> = [
  {
    key: "writing",
    pattern: /\b(article|blog|document|docx|humanizer|reference|thesis|writer|writing)\b/,
  },
  {
    key: "design",
    pattern: /\b(canvas|design|diagram|drawio|excalidraw|illustration|image|presentation|prototype|slide|visualize)\b/,
  },
  {
    key: "data",
    pattern: /\b(csv|data|database|excel|pdf|spreadsheet|storage)\b/,
  },
  {
    key: "automation",
    pattern: /\b(adapter|automation|browser|chrome|cli|mcp|workflow)\b/,
  },
  {
    key: "research",
    pattern: /\b(analysis|analyze|audit|find|reach|research|search)\b/,
  },
  {
    key: "development",
    pattern: /\b(architecture|code|coding|debug|deploy|development|diagnose|frontend|plugin|repo|tdd|test|vercel)\b/,
  },
];

function namePrefix(name: string) {
  return name.trim().toLowerCase().match(/^([a-z0-9]+)(?=[:_-])/)?.[1] ?? null;
}

function semanticCategory(capability: SkillCapability): SkillSemanticCategory {
  const searchable = `${capability.name} ${capability.description}`
    .toLowerCase()
    .replace(/[:_-]+/g, " ");
  return semanticRules.find((rule) => rule.pattern.test(searchable))?.key ?? "uncategorized";
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
    const useNamespace = Boolean(
      prefix
      && !ignoredPrefixes.has(prefix)
      && (knownNamespaces.has(prefix) || (prefixCounts.get(prefix) ?? 0) >= 3),
    );
    const kind = useNamespace ? "namespace" as const : "semantic" as const;
    const key = useNamespace && prefix ? prefix : semanticCategory(capability);
    const id = `${kind}:${key}`;
    categoryByCapability.set(capability.id, id);
    const current = categories.get(id);
    categories.set(id, current
      ? { ...current, count: current.count + 1 }
      : { id, kind, key, count: 1 });
  }

  return {
    categoryByCapability,
    categories: [...categories.values()].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "namespace" ? -1 : 1;
      return left.key.localeCompare(right.key);
    }),
  };
}
