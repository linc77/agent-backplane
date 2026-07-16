import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  AgentActivationResult,
  AgentConfigInventory,
  AgentKind,
  CodexAuditMode,
  CodexAuditRun,
  CodexAuditTask,
  CorrectionDraft,
  MemoryProfile,
  MemoryProfileGenerationTask,
  ScanResult,
  SaveAgentProfileInput,
  SkillInventory,
} from "./types";
import { demoAuditRun, demoMemoryProfile, demoScanResult } from "./demoData";

export function scanMemories(rootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(withFixtureRoot(rootOverride));
  }

  return invoke<ScanResult>("scan_memories", { rootOverride });
}

export function generateMemoryProfile(rootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureMemoryProfile(rootOverride));
  }

  return invoke<MemoryProfile>("generate_memory_profile", { rootOverride });
}

export function startMemoryProfileGeneration(rootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureProfileGenerationTask(rootOverride, "succeeded"));
  }

  return invoke<MemoryProfileGenerationTask>("start_memory_profile_generation", { rootOverride });
}

export function getMemoryProfileGeneration() {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureProfileGenerationTask(null, "idle"));
  }

  return invoke<MemoryProfileGenerationTask>("get_memory_profile_generation");
}

export function cancelMemoryProfileGeneration() {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureProfileGenerationTask(null, "cancelled"));
  }

  return invoke<MemoryProfileGenerationTask>("cancel_memory_profile_generation");
}

export function startCodexAudit(rootOverride: string | null, mode: CodexAuditMode) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureCodexAuditTask(rootOverride, mode, "succeeded"));
  }

  return invoke<CodexAuditTask>("start_codex_audit", { rootOverride, mode });
}

export function getCodexAudit() {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureCodexAuditTask(null, "curated", "idle"));
  }

  return invoke<CodexAuditTask>("get_codex_audit");
}

export function cancelCodexAudit() {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureCodexAuditTask(null, "curated", "cancelled"));
  }

  return invoke<CodexAuditTask>("cancel_codex_audit");
}

export function loadMemoryProfile(rootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureMemoryProfile(rootOverride));
  }

  return invoke<MemoryProfile>("load_memory_profile", { rootOverride });
}

export function getSourceExcerpt(
  rootOverride: string | null,
  path: string,
  startLine: number,
  endLine: number,
) {
  if (isFixtureMode()) {
    const source = withFixtureRoot(rootOverride).sources.find((item) => item.path === path);
    return Promise.resolve(
      source
        ? `${source.relativePath} lines ${startLine}-${endLine}\n\nFixture source excerpt for browser verification.`
        : `Fixture source not found: ${path}`,
    );
  }

  return invoke<string>("get_source_excerpt", {
    rootOverride,
    path,
    startLine,
    endLine,
  });
}

export function draftCorrection(
  rootOverride: string | null,
  slug: string,
  bulletLines: string[],
) {
  if (isFixtureMode()) {
    const content = `Memory update request:\n\n${bulletLines
      .filter((line) => line.trim())
      .map((line) => `- ${line.trim()}`)
      .join("\n")}\n`;
    return Promise.resolve(buildFixtureDraft(rootOverride, slug, content));
  }

  return invoke<CorrectionDraft>("draft_correction", {
    rootOverride,
    slug,
    bulletLines,
  });
}

export function draftCorrectionFromContent(
  rootOverride: string | null,
  slug: string,
  content: string,
) {
  if (isFixtureMode()) {
    const normalized = content.trim().toLowerCase().startsWith("memory update request:")
      ? `${content.trim()}\n`
      : `Memory update request:\n\n${content.trim()}\n`;
    return Promise.resolve(buildFixtureDraft(rootOverride, slug, normalized));
  }

  return invoke<CorrectionDraft>("draft_correction_from_content", {
    rootOverride,
    slug,
    content,
  });
}

export function writeCorrection(rootOverride: string | null, draft: CorrectionDraft) {
  if (isFixtureMode()) {
    return Promise.resolve(draft.targetPath);
  }

  return invoke<string>("write_correction", { rootOverride, draft });
}

export function runCodexAudit(rootOverride: string | null, mode: CodexAuditMode) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureCodexAuditRun(rootOverride, mode));
  }

  return invoke<CodexAuditRun>("run_codex_audit", { rootOverride, mode });
}

export function openSourceFile(path: string) {
  if (isFixtureMode()) {
    void path;
    return Promise.resolve();
  }

  return revealItemInDir(path);
}

export function loadSkillInventory(projectRootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureSkillInventory);
  }

  return invoke<SkillInventory>("load_skill_inventory", { projectRootOverride });
}

export function loadAgentConfigInventory() {
  if (isFixtureMode()) {
    return Promise.resolve(cloneFixtureAgentInventory());
  }

  return invoke<AgentConfigInventory>("load_agent_config_inventory");
}

export function saveAgentProviderProfile(input: SaveAgentProfileInput) {
  if (isFixtureMode()) {
    const inventory = cloneFixtureAgentInventory();
    const target = inventory.targets.find((item) => item.agent === input.agent);
    if (target) {
      const id = input.id || `fixture-${input.agent}-${target.profiles.length + 1}`;
      const existing = target.profiles.findIndex((profile) => profile.id === id);
      const profile = {
        id,
        agent: input.agent,
        name: input.name,
        providerKey: input.providerKey,
        baseUrl: input.baseUrl,
        model: input.model,
        protocol: input.protocol,
        official: input.official,
        source: "managed" as const,
        hasSecret: Boolean(input.apiKey) || (existing >= 0 && target.profiles[existing].hasSecret),
        active: existing >= 0 ? target.profiles[existing].active : false,
      };
      if (existing >= 0) {
        target.profiles[existing] = profile;
      } else {
        target.profiles.push(profile);
      }
    }
    return Promise.resolve(inventory);
  }

  return invoke<AgentConfigInventory>("save_agent_provider_profile", { input });
}

export function deleteAgentProviderProfile(agent: AgentKind, profileId: string) {
  if (isFixtureMode()) {
    const inventory = cloneFixtureAgentInventory();
    const target = inventory.targets.find((item) => item.agent === agent);
    if (target) {
      target.profiles = target.profiles.filter((profile) => profile.id !== profileId);
    }
    return Promise.resolve(inventory);
  }

  return invoke<AgentConfigInventory>("delete_agent_provider_profile", { agent, profileId });
}

export function activateAgentProviderProfile(agent: AgentKind, profileId: string) {
  if (isFixtureMode()) {
    const inventory = cloneFixtureAgentInventory();
    const target = inventory.targets.find((item) => item.agent === agent);
    const profile = target?.profiles.find((item) => item.id === profileId);
    if (target && profile) {
      target.profiles.forEach((item) => {
        item.active = item.id === profileId;
      });
      target.activeProfileId = profile.id;
      target.activeProviderKey = profile.providerKey;
      target.activeModel = profile.model;
      target.activeBaseUrl = profile.baseUrl;
    }
    return Promise.resolve({
      inventory,
      backupPath: `/Users/demo/.agent-memory-manager/backups/agent-config/${agent}/config.bak`,
      reloadHint: target?.reloadHint ?? "",
    } satisfies AgentActivationResult);
  }

  return invoke<AgentActivationResult>("activate_agent_provider_profile", { agent, profileId });
}

export function isFixtureMode() {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("fixture") === "1"
  );
}

function fixtureRoot(rootOverride: string | null) {
  return rootOverride?.trim() || demoScanResult.root;
}

function fixtureMemoryProfile(rootOverride: string | null) {
  const root = fixtureRoot(rootOverride);
  return {
    ...demoMemoryProfile,
    cachePath: `${root}/.amm/profile.json`,
    metadata: {
      ...demoMemoryProfile.metadata,
      memoryRoot: root,
    },
  } satisfies MemoryProfile;
}

function fixtureProfileGenerationTask(
  rootOverride: string | null,
  status: MemoryProfileGenerationTask["status"],
) {
  const profile = status === "succeeded" ? fixtureMemoryProfile(rootOverride) : null;
  return {
    id: status === "idle" ? null : "fixture-profile-generation",
    status,
    startedAt: status === "idle" ? null : "2026-06-09T00:00:00Z",
    finishedAt: status === "running" || status === "cancelling" ? null : "2026-06-09T00:00:01Z",
    error: null,
    profile,
  } satisfies MemoryProfileGenerationTask;
}

function fixtureCodexAuditTask(
  rootOverride: string | null,
  mode: CodexAuditMode,
  status: CodexAuditTask["status"],
) {
  const run = status === "succeeded" ? fixtureCodexAuditRun(rootOverride, mode) : null;
  return {
    id: status === "idle" ? null : "fixture-codex-audit",
    mode: status === "idle" ? null : mode,
    status,
    startedAt: status === "idle" ? null : "2026-06-09T00:00:00Z",
    finishedAt: status === "running" || status === "cancelling" ? null : "2026-06-09T00:00:01Z",
    error: null,
    run,
  } satisfies CodexAuditTask;
}

function fixtureCodexAuditRun(rootOverride: string | null, mode: CodexAuditMode) {
  const root = fixtureRoot(rootOverride);
  return {
    ...demoAuditRun,
    cachePath: `${root}/.amm/codex-runs/demo-${mode}.json`,
    report: {
      ...demoAuditRun.report,
      mode,
      metadata: {
        ...demoAuditRun.report.metadata,
        memoryRoot: root,
      },
    },
  } satisfies CodexAuditRun;
}

function withFixtureRoot(rootOverride: string | null): ScanResult {
  const root = fixtureRoot(rootOverride);
  return {
    ...demoScanResult,
    root,
    sources: demoScanResult.sources.map((source) => ({
      ...source,
      path: `${root}/${source.relativePath}`,
    })),
  };
}

function buildFixtureDraft(
  rootOverride: string | null,
  slug: string,
  content: string,
): CorrectionDraft {
  const safeSlug =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "memory-update";
  return {
    slug: safeSlug,
    content,
    targetPath: `${fixtureRoot(rootOverride)}/extensions/ad_hoc/notes/demo-${safeSlug}.md`,
  };
}

const fixtureSkillInventory: SkillInventory = {
  generatedAt: "2026-07-13T00:00:00Z",
  provider: "native-filesystem",
  snapshotPath: "/Users/demo/.agent-memory-manager/skill-inventory.json",
  snapshotError: null,
  capabilityCount: 3,
  copyCount: 4,
  duplicateGroupCount: 1,
  invalidCount: 1,
  roots: [
    {
      id: "agents",
      label: "Agent Skills",
      path: "/Users/demo/.agents/skills",
      tool: "Agents",
      scope: "global",
      exists: true,
      copyCount: 3,
    },
    {
      id: "project-codex",
      label: "Project · Codex",
      path: "/Users/demo/project/.codex/skills",
      tool: "Codex",
      scope: "project",
      exists: true,
      copyCount: 1,
    },
  ],
  capabilities: [
    {
      id: "hash-find-skills",
      name: "find-skills",
      description: "Discover installable agent skills.",
      contentHash: "hash-find-skills",
      health: "ready",
      copyCount: 2,
      tools: ["Agents", "Codex"],
      copies: [
        {
          id: "copy-find-agents",
          name: "find-skills",
          description: "Discover installable agent skills.",
          path: "/Users/demo/.agents/skills/find-skills",
          manifestPath: "/Users/demo/.agents/skills/find-skills/SKILL.md",
          tool: "Agents",
          scope: "global",
          filesystemKind: "symlink",
          resolvedPath: "/Users/demo/library/find-skills",
          valid: true,
          issue: null,
          contentHash: "hash-find-skills",
        },
        {
          id: "copy-find-codex",
          name: "find-skills",
          description: "Discover installable agent skills.",
          path: "/Users/demo/project/.codex/skills/find-skills",
          manifestPath: "/Users/demo/project/.codex/skills/find-skills/SKILL.md",
          tool: "Codex",
          scope: "project",
          filesystemKind: "directory",
          resolvedPath: "/Users/demo/project/.codex/skills/find-skills",
          valid: true,
          issue: null,
          contentHash: "hash-find-skills",
        },
      ],
    },
    {
      id: "hash-diagnose",
      name: "diagnose",
      description: "Diagnose hard bugs with a disciplined feedback loop.",
      contentHash: "hash-diagnose",
      health: "ready",
      copyCount: 1,
      tools: ["Agents"],
      copies: [
        {
          id: "copy-diagnose",
          name: "diagnose",
          description: "Diagnose hard bugs with a disciplined feedback loop.",
          path: "/Users/demo/.agents/skills/diagnose",
          manifestPath: "/Users/demo/.agents/skills/diagnose/SKILL.md",
          tool: "Agents",
          scope: "global",
          filesystemKind: "directory",
          resolvedPath: "/Users/demo/.agents/skills/diagnose",
          valid: true,
          issue: null,
          contentHash: "hash-diagnose",
        },
      ],
    },
    {
      id: "invalid-copy-broken",
      name: "broken-skill",
      description: "",
      contentHash: "hash-broken",
      health: "invalid",
      copyCount: 1,
      tools: ["Agents"],
      copies: [
        {
          id: "copy-broken",
          name: "broken-skill",
          description: "",
          path: "/Users/demo/.agents/skills/broken-skill",
          manifestPath: "/Users/demo/.agents/skills/broken-skill/SKILL.md",
          tool: "Agents",
          scope: "global",
          filesystemKind: "directory",
          resolvedPath: "/Users/demo/.agents/skills/broken-skill",
          valid: false,
          issue: "Missing YAML frontmatter",
          contentHash: "hash-broken",
        },
      ],
    },
  ],
};

const fixtureAgentInventory: AgentConfigInventory = {
  generatedAt: "2026-07-16T01:20:47Z",
  catalogPath: "/Users/demo/.agent-memory-manager/agent-config-profiles.json",
  targets: [
    {
      agent: "codex",
      label: "Codex",
      installed: true,
      executablePath: "/opt/homebrew/bin/codex",
      configPath: "/Users/demo/.codex/config.toml",
      configExists: true,
      activeProfileId: "fixture-codex-official",
      activeProviderKey: "openai",
      activeModel: "gpt-5.4",
      activeBaseUrl: "https://chatgpt.com/codex",
      reloadHint: "Restart Codex or open a new terminal session.",
      profiles: [
        {
          id: "fixture-codex-official",
          agent: "codex",
          name: "OpenAI Official",
          providerKey: "openai",
          baseUrl: "https://chatgpt.com/codex",
          model: "gpt-5.4",
          protocol: "responses",
          official: true,
          source: "imported",
          hasSecret: false,
          active: true,
        },
        {
          id: "fixture-codex-team",
          agent: "codex",
          name: "Team Gateway",
          providerKey: "team-gateway",
          baseUrl: "https://gateway.example.com/openai/v1",
          model: "gpt-5.4",
          protocol: "responses",
          official: false,
          source: "managed",
          hasSecret: true,
          active: false,
        },
      ],
    },
    {
      agent: "claudeCode",
      label: "Claude Code",
      installed: true,
      executablePath: "/opt/homebrew/bin/claude",
      configPath: "/Users/demo/.claude/settings.json",
      configExists: true,
      activeProfileId: "fixture-claude-local",
      activeProviderKey: "anthropic",
      activeModel: "claude-sonnet-4-5",
      activeBaseUrl: "https://api.anthropic.com",
      reloadHint: "Claude Code reloads settings automatically.",
      profiles: [
        {
          id: "fixture-claude-local",
          agent: "claudeCode",
          name: "Anthropic Official",
          providerKey: "anthropic",
          baseUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4-5",
          protocol: "anthropicMessages",
          official: true,
          source: "imported",
          hasSecret: true,
          active: true,
        },
      ],
    },
    {
      agent: "hermes",
      label: "Hermes",
      installed: true,
      executablePath: "/Users/demo/.local/bin/hermes",
      configPath: "/Users/demo/.hermes/config.yaml",
      configExists: true,
      activeProfileId: "fixture-hermes-local",
      activeProviderKey: "openrouter",
      activeModel: "nousresearch/hermes-4-405b",
      activeBaseUrl: "https://openrouter.ai/api/v1",
      reloadHint: "Start a new Hermes session to use the profile.",
      profiles: [
        {
          id: "fixture-hermes-local",
          agent: "hermes",
          name: "OpenRouter",
          providerKey: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1",
          model: "nousresearch/hermes-4-405b",
          protocol: "chatCompletions",
          official: false,
          source: "imported",
          hasSecret: true,
          active: true,
        },
      ],
    },
  ],
};

function cloneFixtureAgentInventory() {
  return structuredClone(fixtureAgentInventory);
}
