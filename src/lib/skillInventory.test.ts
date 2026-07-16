import { describe, expect, it } from "vitest";
import { projectSkillInventory } from "./skillInventory";
import type { SkillInventory } from "./types";

const inventory: SkillInventory = {
  generatedAt: "now",
  provider: "native-filesystem",
  snapshotPath: "/tmp/inventory.json",
  snapshotError: null,
  capabilityCount: 2,
  copyCount: 3,
  duplicateGroupCount: 1,
  invalidCount: 1,
  roots: [
    {
      id: "agents",
      label: "Agents",
      path: "/tmp/agents",
      tool: "Agents",
      scope: "global",
      exists: true,
      copyCount: 2,
    },
    {
      id: "hermes",
      label: "Hermes",
      path: "/tmp/hermes",
      tool: "Hermes",
      scope: "global",
      exists: true,
      copyCount: 1,
    },
  ],
  capabilities: [
    {
      id: "shared",
      name: "shared",
      description: "Shared only through Agents",
      markdown: "# Shared",
      contentHash: "shared",
      health: "invalid",
      copyCount: 2,
      tools: ["Agents", "Hermes"],
      copies: [
        {
          id: "agents-copy",
          name: "shared",
          description: "Shared only through Agents",
          markdown: "# Shared",
          path: "/tmp/agents/shared",
          manifestPath: "/tmp/agents/shared/SKILL.md",
          tool: "Agents",
          scope: "global",
          filesystemKind: "directory",
          resolvedPath: "/tmp/agents/shared",
          valid: true,
          issue: null,
          contentHash: "shared",
        },
        {
          id: "hermes-copy",
          name: "shared",
          description: "Hermes copy",
          markdown: "# Shared",
          path: "/tmp/hermes/shared",
          manifestPath: "/tmp/hermes/shared/SKILL.md",
          tool: "Hermes",
          scope: "global",
          filesystemKind: "directory",
          resolvedPath: "/tmp/hermes/shared",
          valid: false,
          issue: "Invalid manifest",
          contentHash: "shared",
        },
      ],
    },
    {
      id: "agents-only",
      name: "agents-only",
      description: "Agents capability",
      markdown: "# Agents only",
      contentHash: "agents-only",
      health: "ready",
      copyCount: 1,
      tools: ["Agents"],
      copies: [
        {
          id: "agents-only-copy",
          name: "agents-only",
          description: "Agents capability",
          markdown: "# Agents only",
          path: "/tmp/agents/agents-only",
          manifestPath: "/tmp/agents/agents-only/SKILL.md",
          tool: "Agents",
          scope: "global",
          filesystemKind: "directory",
          resolvedPath: "/tmp/agents/agents-only",
          valid: true,
          issue: null,
          contentHash: "agents-only",
        },
      ],
    },
  ],
};

describe("projectSkillInventory", () => {
  it("recomputes counts from copies visible to the selected Agent", () => {
    const hermes = projectSkillInventory(inventory, "hermes");

    expect(hermes.capabilityCount).toBe(1);
    expect(hermes.copyCount).toBe(1);
    expect(hermes.invalidCount).toBe(1);
    expect(hermes.duplicateGroupCount).toBe(0);
    expect(hermes.roots.map((root) => root.tool)).toEqual(["Hermes"]);
    expect(hermes.capabilities[0].tools).toEqual(["Hermes"]);
  });

  it("includes shared Agents roots for Codex", () => {
    const codex = projectSkillInventory(inventory, "codex");

    expect(codex.capabilities.map((capability) => capability.name)).toEqual([
      "shared",
      "agents-only",
    ]);
    expect(codex.copyCount).toBe(2);
    expect(codex.invalidCount).toBe(0);
  });
});
