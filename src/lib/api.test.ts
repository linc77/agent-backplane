// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateAgentProviderProfile,
  draftCorrectionFromContent,
  loadAgentConfigInventory,
  loadSkillInventory,
  openSourceFile,
  runCodexAudit,
  scanMemories,
  writeCorrection,
} from "./api";

const invokeMock = vi.hoisted(() => vi.fn());
const revealItemInDirMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: revealItemInDirMock,
}));

describe("fixture API mode", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/?fixture=1");
  });

  afterEach(() => {
    window.history.pushState(null, "", "/");
    invokeMock.mockReset();
    revealItemInDirMock.mockReset();
  });

  it("serves scan data without calling Tauri", async () => {
    const scan = await scanMemories("/tmp/demo-memory");

    expect(scan.root).toBe("/tmp/demo-memory");
    expect(scan.sources[0].path).toBe("/tmp/demo-memory/MEMORY.md");
    expect(scan.entries.some((entry) => entry.topic === "profile")).toBe(true);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("serves audit and correction commands without calling Tauri", async () => {
    const audit = await runCodexAudit("/tmp/demo-memory", "full");
    const draft = await draftCorrectionFromContent(
      "/tmp/demo-memory",
      "Clarify Stack",
      "- The current stack is Python/Rust.",
    );
    const written = await writeCorrection("/tmp/demo-memory", draft);
    await openSourceFile("/tmp/demo-memory/MEMORY.md");

    expect(audit.report.mode).toBe("full");
    expect(audit.report.metadata.memoryRoot).toBe("/tmp/demo-memory");
    expect(draft.slug).toBe("clarify-stack");
    expect(draft.content).toContain("Memory update request:");
    expect(written).toBe(draft.targetPath);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(revealItemInDirMock).not.toHaveBeenCalled();
  });

  it("serves deterministic skill inventory without calling Tauri", async () => {
    const inventory = await loadSkillInventory();

    expect(inventory.capabilityCount).toBe(3);
    expect(inventory.copyCount).toBe(4);
    expect(inventory.invalidCount).toBe(1);
    expect(inventory.capabilities.map((capability) => capability.name)).toContain("find-skills");
    expect(inventory.capabilities.find((capability) => capability.name === "find-skills")?.copyCount).toBe(2);
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
});
