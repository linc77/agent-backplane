import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSkillInventory, parseSkillManifest } from "./skills";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("native Skill discovery parity", () => {
  it("parses scalar and folded frontmatter", () => {
    expect(parseSkillManifest('---\nname: demo\ndescription: "A useful skill"\n---')).toEqual({
      name: "demo",
      description: "A useful skill",
    });
    expect(parseSkillManifest("---\nname: folded\ndescription: >\n  First line.\n  Second line.\n---").description)
      .toBe("First line. Second line.");
    expect(() => parseSkillManifest("# Demo")).toThrow("Missing YAML frontmatter");
  });

  it("groups identical copies and writes a snapshot", async () => {
    const root = await mkdtemp(join(tmpdir(), "amm-skills-"));
    roots.push(root);
    const global = join(root, "global");
    const project = join(root, "project");
    const managed = join(root, "managed/demo");
    await mkdir(managed, { recursive: true });
    await mkdir(join(project, "demo-copy"), { recursive: true });
    await mkdir(join(global, "broken"), { recursive: true });
    const manifest = "---\nname: demo\ndescription: Demo capability\n---\n";
    await writeFile(join(managed, "SKILL.md"), manifest);
    await writeFile(join(project, "demo-copy/SKILL.md"), manifest);
    await writeFile(join(global, "broken/SKILL.md"), "# broken");
    await symlink(managed, join(global, "demo-link"));
    const inventory = await buildSkillInventory(
      [
        { id: "global", label: "Global", path: global, tool: "Agents", scope: "global" },
        { id: "project", label: "Project", path: project, tool: "Codex", scope: "project" },
      ],
      join(root, "amm/skill-inventory.json"),
    );
    expect(inventory.copyCount).toBe(3);
    expect(inventory.capabilityCount).toBe(2);
    expect(inventory.duplicateGroupCount).toBe(1);
    expect(inventory.invalidCount).toBe(1);
    expect(inventory.capabilities.find((capability) => capability.name === "demo")?.copyCount).toBe(2);
    expect(inventory.snapshotError).toBeNull();
  });
});
