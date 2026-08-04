// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateAgentProviderProfile,
  applySkillProfile,
  chooseSkillProject,
  deleteSkillProfile,
  draftCorrectionFromContent,
  loadAgentConfigInventory,
  loadAgentMemorySnapshot,
  loadMcpInventory,
  loadSkillInventory,
  loadSkillWorkspace,
  loadSkillUsage,
  openSourceFile,
  scanMemories,
  saveSkillManifest,
  saveProjectSkillSelection,
  saveSkillProfile,
  syncProjectSkills,
  writeCorrection,
} from "./api";

const invokeMock = vi.hoisted(() => vi.fn());
const revealItemInDirMock = vi.hoisted(() => vi.fn());

Object.defineProperty(window, "backplane", {
  configurable: true,
  value: {
    memory: {
      scan: (rootOverride: string | null) => invokeMock("scan_memories", { rootOverride }),
      loadAgentSnapshot: (agent: string, locale: string) =>
        invokeMock("load_agent_memory_snapshot", { agent, locale }),
    },
    skills: {
      load: (projectRootOverride: string | null) => invokeMock("load_skill_inventory", { projectRootOverride }),
      loadUsage: (targets: unknown) => invokeMock("load_skill_usage", { targets }),
      saveManifest: (input: unknown, projectRootOverride: string | null) =>
        invokeMock("save_skill_manifest", { input, projectRootOverride }),
      loadWorkspace: () => invokeMock("load_skill_workspace"),
      chooseProject: () => invokeMock("choose_skill_project"),
      saveSelection: (input: unknown) => invokeMock("save_project_skill_selection", input),
      saveProfile: (input: unknown) => invokeMock("save_skill_profile", input),
      deleteProfile: (profileId: string) => invokeMock("delete_skill_profile", { profileId }),
      applyProfile: (input: unknown) => invokeMock("apply_skill_profile", input),
      syncProject: (projectId: string, agent: string) =>
        invokeMock("sync_project_skills", { projectId, agent }),
    },
    agentConfig: {
      load: () => invokeMock("load_agent_config_inventory"),
      activate: (agent: string, profileId: string) => invokeMock("activate_agent_provider_profile", { agent, profileId }),
    },
    mcp: { load: (agent: string) => invokeMock("load_mcp_inventory", { agent }) },
    shell: { revealSource: (path: string) => revealItemInDirMock(path) },
  },
});

describe("fixture API mode", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/?fixture=1");
  });

  afterEach(() => {
    window.history.pushState(null, "", "/");
    invokeMock.mockReset();
    revealItemInDirMock.mockReset();
  });

  it("serves scan data without calling Electron IPC", async () => {
    const scan = await scanMemories("/tmp/demo-memory");

    expect(scan.root).toBe("/tmp/demo-memory");
    expect(scan.sources[0].path).toBe("/tmp/demo-memory/MEMORY.md");
    expect(scan.entries.some((entry) => entry.topic === "profile")).toBe(true);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("serves correction commands without calling Electron IPC", async () => {
    const draft = await draftCorrectionFromContent(
      "codex",
      "/tmp/demo-memory",
      "Clarify Stack",
      "- The current stack is Python/Rust.",
      [{ entryId: "profile", sourcePath: "MEMORY.md" }],
    );
    const written = await writeCorrection("/tmp/demo-memory", draft);
    await openSourceFile("/tmp/demo-memory/MEMORY.md");

    expect(draft.slug).toBe("clarify-stack");
    expect(draft.content).toContain("Memory update request:");
    expect(written.path).toBe(draft.targetPath);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(revealItemInDirMock).not.toHaveBeenCalled();
  });

  it("serves deterministic skill inventory without calling Electron IPC", async () => {
    const inventory = await loadSkillInventory();
    const usage = await loadSkillUsage([{
      capabilityId: "hash-find-skills",
      name: "find-skills",
      manifestPaths: ["/Users/demo/.agents/skills/find-skills/SKILL.md"],
    }]);

    expect(inventory.capabilityCount).toBe(6);
    expect(inventory.copyCount).toBe(7);
    expect(inventory.invalidCount).toBe(1);
    expect(inventory.capabilities.map((capability) => capability.name)).toContain("find-skills");
    expect(inventory.capabilities.find((capability) => capability.name === "find-skills")?.copyCount).toBe(2);
    expect(usage.summaries[0].totalCount).toBe(3);
    expect(usage.summaries[0].agentCounts).toEqual({ codex: 2, claudeCode: 1, hermes: 0 });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("serves a project Skill workspace without calling Electron IPC", async () => {
    const workspace = await loadSkillWorkspace();
    const project = await chooseSkillProject();

    expect(workspace.projects[0].rootPath).toBe("/Users/demo/project");
    expect(workspace.profiles[0].skills[0].name).toBe("diagnose");
    expect(project?.id).toBe("fixture-project");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("serves Agent profiles and activation without exposing credentials", async () => {
    const inventory = await loadAgentConfigInventory();
    const result = await activateAgentProviderProfile("codex", "fixture-codex-team");

    expect(inventory.targets.map((target) => target.agent)).toEqual([
      "codex",
      "claudeCode",
      "hermes",
    ]);
    expect(result.inventory.targets[0].activeProfileId).toBe("fixture-codex-team");
    expect(result.backupPath).toContain("backups/agent-config/codex");
    expect(JSON.stringify(inventory)).not.toContain("sk-");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("keeps fixture memory and MCP inventories isolated by Agent", async () => {
    const claudeMemory = await loadAgentMemorySnapshot("claudeCode", "zh-CN");
    const hermesMemory = await loadAgentMemorySnapshot("hermes", "zh-CN");
    const codexMcp = await loadMcpInventory("codex");
    const claudeMcp = await loadMcpInventory("claudeCode");

    expect(claudeMemory.writable).toBe(true);
    expect(claudeMemory.profile?.sections[0].body).toContain("Claude Code");
    expect(claudeMemory.profile?.sections[0].body).not.toContain("Hermes");
    expect(hermesMemory.profile?.sections[0].body).toContain("Hermes");
    expect(claudeMemory.profile?.generator).toBe("codex-profile-v7");
    expect(codexMcp.servers.map((server) => server.name)).toEqual(["context7"]);
    expect(claudeMcp.servers.map((server) => server.name)).toEqual(["drawio"]);
    expect(JSON.stringify([codexMcp, claudeMcp])).not.toContain("sk-");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("desktop skill API", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/");
  });

  afterEach(() => {
    invokeMock.mockReset();
  });

  it("invokes the native Skill inventory command", async () => {
    const inventory = { provider: "native-filesystem", capabilities: [] };
    invokeMock.mockResolvedValue(inventory);

    await expect(loadSkillInventory()).resolves.toBe(inventory);
    expect(invokeMock).toHaveBeenCalledWith("load_skill_inventory", {
      projectRootOverride: null,
    });
  });

  it("invokes the native Skill usage command", async () => {
    const usage = { generatedAt: "now", scannedSessions: 1, summaries: [] };
    const targets = [{
      capabilityId: "demo",
      name: "demo",
      manifestPaths: ["/tmp/demo/SKILL.md"],
    }];
    invokeMock.mockResolvedValue(usage);

    await expect(loadSkillUsage(targets)).resolves.toBe(usage);
    expect(invokeMock).toHaveBeenCalledWith("load_skill_usage", { targets });
  });

  it("invokes the native Skill save command", async () => {
    const inventory = { provider: "native-filesystem", capabilities: [] };
    const input = {
      manifestPath: "/tmp/demo/SKILL.md",
      source: "---\nname: demo\ndescription: Demo\n---\n",
      expectedContentHash: "a".repeat(64),
    };
    invokeMock.mockResolvedValue(inventory);

    await expect(saveSkillManifest(input)).resolves.toBe(inventory);
    expect(invokeMock).toHaveBeenCalledWith("save_skill_manifest", {
      input,
      projectRootOverride: null,
    });
  });

  it("invokes native project Skill workspace commands", async () => {
    const workspace = { schemaVersion: 1, projects: [], profiles: [], bindings: [] };
    const project = { id: "project-1", rootPath: "/work/project" };
    const syncResult = { status: "synced", workspace, created: [], removed: [] };
    const selection = {
      projectId: "project-1",
      agent: "codex" as const,
      skills: [{
        name: "diagnose",
        sourcePath: "/library/diagnose",
        contentHash: "hash",
        scope: "library" as const,
      }],
    };
    const profile = { id: null, name: "Debug", projectId: "project-1", agent: "codex" as const };
    invokeMock
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce(project)
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce(workspace)
      .mockResolvedValueOnce(syncResult);

    await expect(loadSkillWorkspace()).resolves.toBe(workspace);
    await expect(chooseSkillProject()).resolves.toBe(project);
    await expect(saveProjectSkillSelection(selection)).resolves.toBe(workspace);
    await expect(saveSkillProfile(profile)).resolves.toBe(workspace);
    await expect(applySkillProfile({ profileId: "profile-1", projectId: "project-1" })).resolves.toBe(workspace);
    await expect(deleteSkillProfile("profile-1")).resolves.toBe(workspace);
    await expect(syncProjectSkills("project-1", "codex")).resolves.toBe(syncResult);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "load_skill_workspace");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "choose_skill_project");
    expect(invokeMock).toHaveBeenNthCalledWith(3, "save_project_skill_selection", selection);
    expect(invokeMock).toHaveBeenNthCalledWith(4, "save_skill_profile", profile);
    expect(invokeMock).toHaveBeenNthCalledWith(5, "apply_skill_profile", {
      profileId: "profile-1",
      projectId: "project-1",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, "delete_skill_profile", { profileId: "profile-1" });
    expect(invokeMock).toHaveBeenNthCalledWith(7, "sync_project_skills", {
      projectId: "project-1",
      agent: "codex",
    });
  });

  it("invokes native Agent inventory and activation commands", async () => {
    const inventory = { generatedAt: "now", targets: [] };
    const activation = { inventory, backupPath: null, reloadHint: "Restart" };
    invokeMock.mockResolvedValueOnce(inventory).mockResolvedValueOnce(activation);

    await expect(loadAgentConfigInventory()).resolves.toBe(inventory);
    await expect(activateAgentProviderProfile("hermes", "profile-1")).resolves.toBe(activation);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "load_agent_config_inventory");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "activate_agent_provider_profile", {
      agent: "hermes",
      profileId: "profile-1",
    });
  });

  it("invokes native Agent memory and MCP discovery commands", async () => {
    const memory = { agent: "claudeCode", writable: false };
    const mcp = { agent: "claudeCode", servers: [] };
    invokeMock.mockResolvedValueOnce(memory).mockResolvedValueOnce(mcp);

    await expect(loadAgentMemorySnapshot("claudeCode", "en-US")).resolves.toBe(memory);
    await expect(loadMcpInventory("claudeCode")).resolves.toBe(mcp);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "load_agent_memory_snapshot", {
      agent: "claudeCode",
      locale: "en-US",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "load_mcp_inventory", {
      agent: "claudeCode",
    });
  });
});
