import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveMemoryTruth } from "../../../../src/lib/memoryTruth";
import { clearMemoryCatalog, loadMemoryCatalog } from "./catalog";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("memory catalog", () => {
  it("reuses unchanged documents without reparsing them", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-catalog-"));
    roots.push(root);
    await writeFile(join(root, "MEMORY.md"), "# Memory\n\nProject A is active.\n");

    const first = await loadMemoryCatalog("codex", root);
    const second = await loadMemoryCatalog("codex", root);

    expect(first.catalog).toMatchObject({ changedSources: 1, reusedSources: 0 });
    expect(second.catalog).toMatchObject({ changedSources: 0, reusedSources: 1 });
    expect(second.entries).toEqual(first.entries);
  });

  it("preserves stable claim IDs across edits, insertion, and reordering", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-catalog-"));
    roots.push(root);
    const path = join(root, "MEMORY.md");
    await writeFile(path, "# Memory\n\n- Project A is active.\n- Project B is archived.\n");

    const first = await loadMemoryCatalog("codex", root);
    const firstBySummary = new Map(first.entries.map((entry) => [entry.summary, entry]));
    const firstProjectB = firstBySummary.get("Project B is archived.")!;

    await writeFile(path, "# Memory\n\n- Project A is active.\n- Project B is maintained.\n");
    clearMemoryCatalog(root, "codex");
    const edited = await loadMemoryCatalog("codex", root);
    const editedProjectB = edited.entries.find((entry) => entry.summary === "Project B is maintained.")!;
    expect(editedProjectB.id).toBe(firstProjectB.id);
    expect(editedProjectB.revisionHash).not.toBe(firstProjectB.revisionHash);

    await writeFile(
      path,
      "# Memory\n\n- Project C is planned.\n- Project B is maintained.\n- Project A is active.\n",
    );
    clearMemoryCatalog(root, "codex");
    const reordered = await loadMemoryCatalog("codex", root);
    expect(reordered.entries.find((entry) => entry.summary === "Project A is active.")?.id)
      .toBe(firstBySummary.get("Project A is active.")?.id);
    expect(reordered.entries.find((entry) => entry.summary === "Project B is maintained.")?.id)
      .toBe(editedProjectB.id);

    const identity = JSON.parse(
      await readFile(join(root, ".backplane", "claim-identities.codex.v1.json"), "utf8"),
    ) as { schemaVersion: string; records: unknown[] };
    expect(identity).toMatchObject({ schemaVersion: "1" });
    expect(identity.records).toHaveLength(3);
  });

  it("fails closed when the stable identity catalog is corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-catalog-"));
    roots.push(root);
    await writeFile(join(root, "MEMORY.md"), "# Memory\n\n- Project A is active.\n");
    await loadMemoryCatalog("codex", root);
    await writeFile(join(root, ".backplane", "claim-identities.codex.v1.json"), "{broken");
    clearMemoryCatalog(root, "codex");

    await expect(loadMemoryCatalog("codex", root)).rejects.toThrow("Claim identity index is invalid");
  });

  it("does not transfer a deleted claim identity to unrelated replacement text", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-catalog-"));
    roots.push(root);
    const path = join(root, "MEMORY.md");
    await writeFile(path, "# Memory\n\n- Reply in Chinese.\n");
    const first = await loadMemoryCatalog("codex", root);

    await writeFile(path, "# Memory\n\n- Billing account belongs to Jane.\n");
    clearMemoryCatalog(root, "codex");
    const replacement = await loadMemoryCatalog("codex", root);

    expect(replacement.entries[0].id).not.toBe(first.entries[0].id);
  });

  it("migrates a real legacy block correction through risk and truth resolution", async () => {
    const root = await mkdtemp(join(tmpdir(), "backplane-catalog-"));
    roots.push(root);
    await writeFile(
      join(root, "MEMORY.md"),
      "# Projects\n\n- Project A is active.\n- Project B is active.\n",
    );
    const first = await loadMemoryCatalog("codex", root);
    const legacyAlias = first.entries[0].aliasIds?.find((alias) =>
      first.entries[1].aliasIds?.includes(alias),
    );
    expect(legacyAlias).toBeTruthy();

    const change = {
      id: "legacy-project-correction",
      operation: "replace",
      targetEntryIds: [legacyAlias],
      revertsChangeId: null,
      createdAt: "2026-07-17T00:00:00.000Z",
    };
    const notes = join(root, "extensions", "ad_hoc", "notes");
    await mkdir(notes, { recursive: true });
    await writeFile(
      join(notes, "legacy-project-correction.md"),
      `## Agent Backplane change legacy-project-correction\n\n<!-- agent-backplane-change ${JSON.stringify(change)} -->\n\nMemory update request:\n\n- Both projects are archived.\n`,
    );
    clearMemoryCatalog(root, "codex");
    const migrated = await loadMemoryCatalog("codex", root);
    const truth = resolveMemoryTruth(migrated);

    expect(migrated.risks).toEqual([]);
    expect(truth.current).toHaveLength(1);
    expect(truth.current[0].entry.change?.id).toBe(change.id);
    expect(truth.current[0].staleCandidates).toHaveLength(2);
  });
});
