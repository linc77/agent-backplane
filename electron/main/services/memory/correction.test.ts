import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

describe("memory changes", () => {
  it("writes a targeted Codex change that remains machine-readable", async () => {
    const root = await temporaryRoot();
    const draft = await draftCorrection("codex", root, "Profile Stack", ["Python/Rust is current."], [
      { entryId: "profile-old", sourcePath: "MEMORY.md" },
    ]);
    const result = await writeCorrection(root, draft);
    const text = await readFile(result.path, "utf8");
    const [entry] = parseEntries(relativeMemoryPath(root, result.path), text);

    expect(dirname(result.path)).toBe(join(root, "extensions", "ad_hoc", "notes"));
    expect(entry.change).toMatchObject({ operation: "replace", targetEntryIds: ["profile-old"] });
    expect(await getSourceExcerpt(root, result.path, 1, 1)).toContain("Agent Backplane change");
  });

  it("writes Claude Code changes beside the targeted project memory", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "project-a", "memory"), { recursive: true });
    const draft = await draftCorrection("claudeCode", root, "Project", ["Project A is archived."], [
      { entryId: "project-a", sourcePath: "project-a/memory/MEMORY.md" },
    ]);
    const result = await writeCorrection(root, draft);
    expect(dirname(result.path)).toBe(join(root, "project-a", "memory"));
  });

  it("appends Hermes changes to its native MEMORY.md", async () => {
    const root = await temporaryRoot();
    await writeFile(join(root, "MEMORY.md"), "Existing memory.\n");
    const draft = await draftCorrection("hermes", root, "Preference", ["Use Chinese output."], [
      { entryId: "preference", sourcePath: "MEMORY.md" },
    ]);
    const result = await writeCorrection(root, draft);
    const text = await readFile(result.path, "utf8");
    expect(text).toContain("Existing memory.");
    expect(text).toContain("agent-backplane-change");
  });

  it("creates a revert change without deleting history", async () => {
    const root = await temporaryRoot();
    const correction = await draftCorrection("codex", root, "Profile", ["New value."], [
      { entryId: "old", sourcePath: "MEMORY.md" },
    ]);
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
    const draft = await draftCorrection("codex", root, "bad", ["bad"], [
      { entryId: "bad", sourcePath: "MEMORY.md" },
    ]);
    await expect(writeCorrection(root, { ...draft, targetPath: outside })).rejects.toThrow("selected agent memory store");
  });
});
