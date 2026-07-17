import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSkillUsage, type SkillUsageRoots } from "./skillUsage";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoots() {
  const root = await mkdtemp(join(tmpdir(), "backplane-skill-usage-"));
  temporaryRoots.push(root);
  const roots: SkillUsageRoots = {
    codex: [join(root, "codex")],
    claudeCode: [join(root, "claude")],
    hermes: [join(root, "hermes")],
  };
  await Promise.all(Object.values(roots).flat().map((path) => mkdir(path, { recursive: true })));
  return roots;
}

function line(value: unknown) {
  return `${JSON.stringify(value)}\n`;
}

describe("Skill usage log aggregation", () => {
  it("counts one use per session and ignores prompts, outputs, and failed loads", async () => {
    const roots = await createRoots();
    const manifestPath = "/Users/demo/.agents/skills/demo/SKILL.md";
    await writeFile(join(roots.codex[0], "session-1.jsonl"), [
      line({ type: "response_item", timestamp: "2026-07-14T10:00:00Z", payload: { type: "message", content: manifestPath } }),
      line({
        type: "response_item",
        timestamp: "2026-07-14T10:01:00Z",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: `sed -n '1,120p' ${manifestPath}` }),
        },
      }),
      line({
        type: "response_item",
        timestamp: "2026-07-14T10:02:00Z",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: JSON.stringify({ cmd: `cat ${manifestPath}` }),
        },
      }),
      line({ type: "response_item", payload: { type: "function_call_output", output: manifestPath } }),
    ].join(""));
    await writeFile(join(roots.codex[0], "session-2.jsonl"), line({
      type: "response_item",
      timestamp: "2026-07-15T08:30:00Z",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: `cat '${manifestPath}'` }),
      },
    }));
    const claudeSessionId = "f0454a5c-ff11-4a6c-a039-2f2f748b95ae";
    await writeFile(join(roots.claudeCode[0], `${claudeSessionId}.jsonl`), [
      line({
        timestamp: "2026-07-16T09:00:00Z",
        message: { content: [{ type: "tool_use", name: "Read", input: { file_path: manifestPath } }] },
      }),
      line({
        timestamp: "2026-07-16T09:01:00Z",
        message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "demo" } }] },
      }),
    ].join(""));
    const subagentRoot = join(roots.claudeCode[0], claudeSessionId, "subagents");
    await mkdir(subagentRoot, { recursive: true });
    await writeFile(join(subagentRoot, "agent-demo.jsonl"), line({
      timestamp: "2026-07-16T09:02:00Z",
      message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "demo" } }] },
    }));
    await writeFile(join(roots.hermes[0], "session.jsonl"), [
      line({
        role: "tool",
        name: "skill_view",
        timestamp: "2026-07-17T02:42:00Z",
        content: JSON.stringify({ success: true, name: "demo" }),
      }),
      line({
        role: "tool",
        name: "skill_view",
        timestamp: "2026-07-17T03:00:00Z",
        content: JSON.stringify({ success: false, name: "demo" }),
      }),
    ].join(""));

    const result = await loadSkillUsage([{
      capabilityId: "demo-id",
      name: "demo",
      manifestPaths: [manifestPath],
    }], roots);

    expect(result.scannedSessions).toBe(4);
    expect(result.summaries).toEqual([{
      capabilityId: "demo-id",
      totalCount: 4,
      lastUsedAt: "2026-07-17T02:42:00Z",
      agentCounts: { codex: 2, claudeCode: 1, hermes: 1 },
    }]);
  });

  it("returns an empty summary when no Agent loaded the Skill", async () => {
    const roots = await createRoots();
    const result = await loadSkillUsage([{
      capabilityId: "unused-id",
      name: "unused",
      manifestPaths: ["/Users/demo/.agents/skills/unused/SKILL.md"],
    }], roots);

    expect(result.summaries[0]).toEqual({
      capabilityId: "unused-id",
      totalCount: 0,
      lastUsedAt: null,
      agentCounts: { codex: 0, claudeCode: 0, hermes: 0 },
    });
  });
});
