import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentKind, MemoryChangeTarget } from "../../../../src/lib/types";
import { draftCorrectionSchema, writeCorrectionSchema } from "../../../shared/validation";
import { clearMemoryCatalog, loadMemoryCatalog } from "./catalog";
import { draftCorrection, draftRevert, getSourceExcerpt, writeCorrection } from "./correction";
import { parseEntries } from "./parser";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "backplane-memory-change-"));
  roots.push(root);
  return root;
}

function relativeMemoryPath(root: string, path: string) {
  return relative(root, path).split(sep).join("/");
}

async function createMemoryTarget(
  agent: AgentKind,
  root: string,
  relativePath: string,
  content: string,
): Promise<MemoryChangeTarget> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  clearMemoryCatalog(root, agent);
  const scan = await loadMemoryCatalog(agent, root);
  const entry = scan.entries.find((candidate) => !candidate.change);
  if (!entry) throw new Error("test memory target was not parsed");
  return {
    entryId: entry.id,
    sourcePath: entry.sourcePath,
    revisionHash: entry.revisionHash,
  };
}

describe("memory changes", () => {
  it("writes a targeted Codex change that remains machine-readable", async () => {
    const root = await temporaryRoot();
    const target = await createMemoryTarget(
      "codex",
      root,
      "MEMORY.md",
      "# Profile\n\n- Java/Spring Boot is current.\n",
    );
    expect(() => draftCorrectionSchema.parse({
      agent: "codex",
      rootOverride: null,
      slug: "Profile Stack",
      bulletLines: ["Python/Rust is current."],
      targets: [target],
    })).not.toThrow();
    const draft = await draftCorrection(
      "codex",
      root,
      "Profile Stack",
      ["Python/Rust is current."],
      [target],
    );
    expect(() => writeCorrectionSchema.parse({ rootOverride: null, draft })).not.toThrow();
    const result = await writeCorrection(root, draft);
    const text = await readFile(result.path, "utf8");
    const [entry] = parseEntries(relativeMemoryPath(root, result.path), text);

    expect(dirname(result.path)).toBe(join(root, "extensions", "ad_hoc", "notes"));
    expect(entry.change).toMatchObject({
      schemaVersion: "2",
      operation: "replace",
      targetEntryIds: [target.entryId],
      targetRevisions: { [target.entryId]: target.revisionHash },
    });
    expect(await getSourceExcerpt(root, result.path, 1, 1)).toContain("Agent Backplane change");
  });

  it("writes Claude Code changes beside the targeted project memory", async () => {
    const root = await temporaryRoot();
    const target = await createMemoryTarget(
      "claudeCode",
      root,
      "project-a/MEMORY.md",
      "# Project\n\n- Project A is active.\n",
    );
    const draft = await draftCorrection(
      "claudeCode",
      root,
      "Project",
      ["Project A is archived."],
      [target],
    );
    const result = await writeCorrection(root, draft);
    expect(dirname(result.path)).toBe(join(root, "project-a", "memory"));
  });

  it("appends Hermes changes to its native MEMORY.md", async () => {
    const root = await temporaryRoot();
    const target = await createMemoryTarget("hermes", root, "MEMORY.md", "Existing memory.\n");
    const draft = await draftCorrection(
      "hermes",
      root,
      "Preference",
      ["Use Chinese output."],
      [target],
    );
    const result = await writeCorrection(root, draft);
    const text = await readFile(result.path, "utf8");
    expect(text).toContain("Existing memory.");
    expect(text).toContain("agent-backplane-change");
  });

  it("creates a revert change without deleting history", async () => {
    const root = await temporaryRoot();
    const target = await createMemoryTarget(
      "codex",
      root,
      "MEMORY.md",
      "# Profile\n\n- Old value.\n",
    );
    const correction = await draftCorrection("codex", root, "Profile", ["New value."], [target]);
    await writeCorrection(root, correction);
    const revert = await draftRevert(
      "codex",
      root,
      correction.change,
      relativeMemoryPath(root, correction.targetPath),
    );
    const result = await writeCorrection(root, revert);
    expect((await readFile(result.path, "utf8"))).toContain(`"revertsChangeId":"${correction.change.id}"`);
  });

  it("rejects writes outside the selected agent memory store", async () => {
    const root = await temporaryRoot();
    const outside = join(root, "..", `outside-${Date.now()}.md`);
    const target = await createMemoryTarget(
      "codex",
      root,
      "MEMORY.md",
      "# Profile\n\n- Existing value.\n",
    );
    const draft = await draftCorrection("codex", root, "bad", ["bad"], [target]);
    await expect(writeCorrection(root, { ...draft, targetPath: outside })).rejects.toThrow("selected agent memory store");
  });

  it("rejects a draft when its target changed before the write", async () => {
    const root = await temporaryRoot();
    const target = await createMemoryTarget(
      "codex",
      root,
      "MEMORY.md",
      "# Profile\n\n- Existing profile value is active.\n",
    );
    const draft = await draftCorrection("codex", root, "Profile", ["Corrected value."], [target]);
    await writeFile(join(root, "MEMORY.md"), "# Profile\n\n- Existing profile value is archived.\n");
    clearMemoryCatalog(root, "codex");

    await expect(writeCorrection(root, draft)).rejects.toThrow("changed after this draft was created");
  });
});
