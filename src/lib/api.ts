import type {
  AgentActivationResult,
  AgentConfigInventory,
  AgentKind,
  AgentMemorySnapshot,
  CodexAuditMode,
  CodexAuditRun,
  CodexAuditTask,
  CorrectionDraft,
  MemoryProfile,
  MemoryProfileGenerationTask,
  McpInventory,
  ScanResult,
  SaveAgentProfileInput,
  SkillInventory,
} from "./types";
import { demoAuditRun, demoMemoryProfile, demoScanResult } from "./demoData";

function desktopApi() {
  if (!window.amm) throw new Error("Electron desktop API is unavailable");
  return window.amm;
}

export function scanMemories(rootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(withFixtureRoot(rootOverride));
  }

  return desktopApi().memory.scan(rootOverride);
}

export function generateMemoryProfile(rootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureMemoryProfile(rootOverride));
  }

  return desktopApi().memory.generateProfile(rootOverride);
}

export function startMemoryProfileGeneration(rootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureProfileGenerationTask(rootOverride, "succeeded"));
  }

  return desktopApi().memory.startProfileGeneration(rootOverride);
}

export function getMemoryProfileGeneration() {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureProfileGenerationTask(null, "idle"));
  }

  return desktopApi().memory.getProfileGeneration();
}

export function cancelMemoryProfileGeneration() {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureProfileGenerationTask(null, "cancelled"));
  }

  return desktopApi().memory.cancelProfileGeneration();
}

export function startCodexAudit(rootOverride: string | null, mode: CodexAuditMode) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureCodexAuditTask(rootOverride, mode, "succeeded"));
  }

  return desktopApi().audit.start(rootOverride, mode);
}

export function getCodexAudit() {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureCodexAuditTask(null, "curated", "idle"));
  }

  return desktopApi().audit.get();
}

export function cancelCodexAudit() {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureCodexAuditTask(null, "curated", "cancelled"));
  }

  return desktopApi().audit.cancel();
}

export function loadMemoryProfile(rootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureMemoryProfile(rootOverride));
  }

  return desktopApi().memory.loadProfile(rootOverride);
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

  return desktopApi().memory.getSourceExcerpt(rootOverride, path, startLine, endLine);
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

  return desktopApi().memory.draftCorrection(rootOverride, slug, bulletLines);
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

  return desktopApi().memory.draftCorrectionFromContent(rootOverride, slug, content);
}

export function writeCorrection(rootOverride: string | null, draft: CorrectionDraft) {
  if (isFixtureMode()) {
    return Promise.resolve(draft.targetPath);
  }

  return desktopApi().memory.writeCorrection(rootOverride, draft);
}

export function runCodexAudit(rootOverride: string | null, mode: CodexAuditMode) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureCodexAuditRun(rootOverride, mode));
  }

  return desktopApi().audit.run(rootOverride, mode);
}

export function openSourceFile(path: string) {
  if (isFixtureMode()) {
    void path;
    return Promise.resolve();
  }

  return desktopApi().shell.revealSource(path);
}

export function loadSkillInventory(projectRootOverride: string | null = null) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureSkillInventory);
  }

  return desktopApi().skills.load(projectRootOverride);
}

export function loadAgentConfigInventory() {
  if (isFixtureMode()) {
    return Promise.resolve(cloneFixtureAgentInventory());
  }

  return desktopApi().agentConfig.load();
}

export function loadAgentMemorySnapshot(agent: AgentKind) {
  if (isFixtureMode()) {
    return Promise.resolve(fixtureAgentMemorySnapshot(agent));
  }

  return desktopApi().memory.loadAgentSnapshot(agent);
}

export function loadMcpInventory(agent: AgentKind) {
  if (isFixtureMode()) {
    return Promise.resolve(structuredClone(fixtureMcpInventories[agent]));
  }

  return desktopApi().mcp.load(agent);
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

  return desktopApi().agentConfig.save(input);
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

  return desktopApi().agentConfig.delete(agent, profileId);
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

  return desktopApi().agentConfig.activate(agent, profileId);
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

function fixtureAgentMemorySnapshot(agent: AgentKind): AgentMemorySnapshot {
  if (agent === "codex") {
    return {
      agent,
      writable: true,
      scan: withFixtureRoot(null),
      profile: fixtureMemoryProfile(null),
    };
  }
  const root =
    agent === "claudeCode" ? "/Users/demo/.claude/projects" : "/Users/demo/.hermes/memories";
  const relativePath =
    agent === "claudeCode" ? "project-demo/memory/MEMORY.md" : "USER.md";
  const label = agent === "claudeCode" ? "Claude Code" : "Hermes";
  const summary = `${label} fixture memory is isolated from Codex.`;
  const scan: ScanResult = {
    root,
    sources: [
      {
        id: `fixture-${agent}-source`,
        path: `${root}/${relativePath}`,
        relativePath,
        kind: "registry",
        modifiedMs: 1_752_633_600_000,
        bytes: 128,
        lines: 4,
        sha256: `fixture-${agent}-sha`,
      },
    ],
    entries: [
      {
        id: `${relativePath}:1-4`,
        topic: "profile",
        relatedTopics: [],
        title: `${label} memory`,
        summary,
        searchText: summary,
        sourcePath: relativePath,
        startLine: 1,
        endLine: 4,
      },
    ],
    risks: [],
  };
  return {
    agent,
    writable: false,
    scan,
    profile: {
      schemaVersion: "1",
      generatedAt: "2026-07-16T02:00:00Z",
      sourceHash: `fixture-${agent}-profile`,
      generator: "deterministic-profile-v3",
      cachePath: `${root}/.amm/profile.json`,
      sections: [
        {
          id: `fixture-${agent}-section`,
          title: `${label} memory`,
          body: summary,
          evidence: [
            {
              sourcePath: relativePath,
              startLine: 1,
              endLine: 4,
              summary,
            },
          ],
          confidence: "high",
          stability: "stable",
        },
      ],
      metadata: {
        memoryRoot: root,
        inputEntries: 1,
        currentEntries: 1,
      },
    },
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
  capabilityCount: 6,
  copyCount: 7,
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
      copyCount: 4,
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
    {
      id: "claude",
      label: "Claude Code",
      path: "/Users/demo/.claude/skills",
      tool: "Claude Code",
      scope: "global",
      exists: true,
      copyCount: 1,
    },
    {
      id: "hermes",
      label: "Hermes",
      path: "/Users/demo/.hermes/skills",
      tool: "Hermes",
      scope: "global",
      exists: true,
      copyCount: 1,
    },
  ],
  capabilities: [
    {
      id: "hash-find-skills",
      name: "find-skills",
      description: "Discover installable agent skills.",
      markdown: "# Find Skills\n\nDiscover and install Skills for the selected Agent.\n\n## Usage\n\n- Search by capability\n- Review the source\n- Install deliberately",
      contentHash: "hash-find-skills",
      health: "ready",
      copyCount: 2,
      tools: ["Agents", "Codex"],
      copies: [
        {
          id: "copy-find-agents",
          name: "find-skills",
          description: "Discover installable agent skills.",
          markdown: "# Find Skills\n\nDiscover and install Skills for the selected Agent.",
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
          markdown: "# Find Skills\n\nDiscover and install Skills for the selected Agent.",
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
      markdown: "# Diagnose\n\nUse a disciplined diagnosis loop.\n\n1. Reproduce\n2. Minimise\n3. Verify",
      contentHash: "hash-diagnose",
      health: "ready",
      copyCount: 1,
      tools: ["Agents"],
      copies: [
        {
          id: "copy-diagnose",
          name: "diagnose",
          description: "Diagnose hard bugs with a disciplined feedback loop.",
          markdown: "# Diagnose\n\nUse a disciplined diagnosis loop.",
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
      id: "hash-metadata-only",
      name: "metadata-only",
      description: "A Skill with required metadata and no Markdown body.",
      markdown: "",
      contentHash: "hash-metadata-only",
      health: "ready",
      copyCount: 1,
      tools: ["Agents"],
      copies: [
        {
          id: "copy-metadata-only",
          name: "metadata-only",
          description: "A Skill with required metadata and no Markdown body.",
          markdown: "",
          path: "/Users/demo/.agents/skills/metadata-only",
          manifestPath: "/Users/demo/.agents/skills/metadata-only/SKILL.md",
          tool: "Agents",
          scope: "global",
          filesystemKind: "directory",
          resolvedPath: "/Users/demo/.agents/skills/metadata-only",
          valid: true,
          issue: null,
          contentHash: "hash-metadata-only",
        },
      ],
    },
    {
      id: "invalid-copy-broken",
      name: "broken-skill",
      description: "",
      markdown: "# Broken Skill\n\nThis fixture has invalid frontmatter.",
      contentHash: "hash-broken",
      health: "invalid",
      copyCount: 1,
      tools: ["Agents"],
      copies: [
        {
          id: "copy-broken",
          name: "broken-skill",
          description: "",
          markdown: "# Broken Skill\n\nThis fixture has invalid frontmatter.",
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
    {
      id: "hash-claude-helper",
      name: "claude-helper",
      description: "A Claude Code-only fixture Skill.",
      markdown: "# Claude Helper\n\nA Claude Code-only fixture Skill.",
      contentHash: "hash-claude-helper",
      health: "ready",
      copyCount: 1,
      tools: ["Claude Code"],
      copies: [
        {
          id: "copy-claude-helper",
          name: "claude-helper",
          description: "A Claude Code-only fixture Skill.",
          markdown: "# Claude Helper\n\nA Claude Code-only fixture Skill.",
          path: "/Users/demo/.claude/skills/claude-helper",
          manifestPath: "/Users/demo/.claude/skills/claude-helper/SKILL.md",
          tool: "Claude Code",
          scope: "global",
          filesystemKind: "directory",
          resolvedPath: "/Users/demo/.claude/skills/claude-helper",
          valid: true,
          issue: null,
          contentHash: "hash-claude-helper",
        },
      ],
    },
    {
      id: "hash-hermes-helper",
      name: "hermes-helper",
      description: "A Hermes-only fixture Skill.",
      markdown: "# Hermes Helper\n\nA Hermes-only fixture Skill.",
      contentHash: "hash-hermes-helper",
      health: "ready",
      copyCount: 1,
      tools: ["Hermes"],
      copies: [
        {
          id: "copy-hermes-helper",
          name: "hermes-helper",
          description: "A Hermes-only fixture Skill.",
          markdown: "# Hermes Helper\n\nA Hermes-only fixture Skill.",
          path: "/Users/demo/.hermes/skills/hermes-helper",
          manifestPath: "/Users/demo/.hermes/skills/hermes-helper/SKILL.md",
          tool: "Hermes",
          scope: "global",
          filesystemKind: "directory",
          resolvedPath: "/Users/demo/.hermes/skills/hermes-helper",
          valid: true,
          issue: null,
          contentHash: "hash-hermes-helper",
        },
      ],
    },
  ],
};

const fixtureMcpInventories: Record<AgentKind, McpInventory> = {
  codex: {
    generatedAt: "2026-07-16T02:00:00Z",
    agent: "codex",
    configPaths: ["/Users/demo/.codex/config.toml"],
    servers: [
      {
        id: "fixture-codex-context7",
        name: "context7",
        scope: "global",
        scopeLabel: "Global",
        transport: "stdio",
        endpoint: "npx",
        enabled: true,
      },
    ],
  },
  claudeCode: {
    generatedAt: "2026-07-16T02:00:00Z",
    agent: "claudeCode",
    configPaths: ["/Users/demo/.claude.json"],
    servers: [
      {
        id: "fixture-claude-drawio",
        name: "drawio",
        scope: "global",
        scopeLabel: "Global",
        transport: "stdio",
        endpoint: "npx",
        enabled: true,
      },
    ],
  },
  hermes: {
    generatedAt: "2026-07-16T02:00:00Z",
    agent: "hermes",
    configPaths: ["/Users/demo/.hermes/config.yaml"],
    servers: [
      {
        id: "fixture-hermes-mnemosyne",
        name: "mnemosyne",
        scope: "global",
        scopeLabel: "Global",
        transport: "stdio",
        endpoint: "uvx",
        enabled: true,
      },
    ],
  },
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
