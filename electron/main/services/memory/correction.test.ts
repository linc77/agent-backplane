import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { draftCorrection, getSourceExcerpt, writeCorrection } from "./correction";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "amm-correction-"));
  roots.push(root);
  return root;
}

describe("memory correction parity", () => {
  it("writes a new note under the allowed directory", async () => {
    const root = await temporaryRoot();
    const draft = draftCorrection(root, "Profile Stack", ["Python/Rust is current."]);
    const path = await writeCorrection(root, draft);
    expect(dirname(path)).toBe(join(root, "extensions", "ad_hoc", "notes"));
    expect(await readFile(path, "utf8")).toContain("Python/Rust");
    expect(await getSourceExcerpt(root, path, 1, 1)).toBe("Memory update request:");
  });

  it("rejects writes and excerpts outside the selected root", async () => {
    const root = await temporaryRoot();
    const outside = join(root, "..", `outside-${Date.now()}.md`);
    await writeFile(outside, "outside");
    const draft = draftCorrection(root, "bad", ["bad"]);
    await expect(writeCorrection(root, { ...draft, targetPath: outside })).rejects.toThrow("only be written");
    await expect(getSourceExcerpt(root, outside, 1, 1)).rejects.toThrow("stay inside");
    await rm(outside, { force: true });
  });

  it("rejects an existing target", async () => {
    const root = await temporaryRoot();
    const draft = draftCorrection(root, "existing", ["new"]);
    await mkdir(join(root, "extensions/ad_hoc/notes"), { recursive: true });
    await writeFile(draft.targetPath, "existing");
    await expect(writeCorrection(root, draft)).rejects.toThrow("already exists");
  });
});
