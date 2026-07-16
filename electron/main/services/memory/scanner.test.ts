import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanAgentSources, scanSources } from "./scanner";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "amm-memory-"));
  temporaryRoots.push(root);
  return root;
}

describe("memory scanner parity", () => {
  it("scans known Codex sources", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "extensions/ad_hoc/notes"), { recursive: true });
    await writeFile(join(root, "MEMORY.md"), "# Registry\n\nFact\n");
    await writeFile(join(root, "extensions/ad_hoc/notes/one.md"), "Memory update request:\n\n- Fact\n");
    const sources = await scanSources(root);
    expect(sources.map((source) => source.kind)).toEqual(["adHocNote", "registry"]);
  });

  it("keeps Claude and Hermes source boundaries", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "project-a/memory"), { recursive: true });
    await writeFile(join(root, "project-a/memory/MEMORY.md"), "# A\n\nAlpha\n");
    await writeFile(join(root, "outside.md"), "# Outside\n\nIgnored\n");
    expect((await scanAgentSources("claudeCode", root)).map((source) => source.relativePath)).toEqual([
      "project-a/memory/MEMORY.md",
    ]);

    await writeFile(join(root, "MEMORY.md"), "# Memory\n\nFact\n");
    await writeFile(join(root, "USER.md"), "# User\n\nPreference\n");
    expect((await scanAgentSources("hermes", root)).map((source) => source.relativePath)).toEqual([
      "MEMORY.md",
      "USER.md",
    ]);
  });
});
