import { describe, expect, it } from "vitest";
import { categorizeSkills } from "./skillCategories";
import type { SkillCapability } from "./types";

function capability(name: string, description = ""): SkillCapability {
  return {
    id: name,
    name,
    description,
    markdown: "",
    contentHash: name,
    health: "ready",
    copyCount: 0,
    tools: [],
    copies: [],
  };
}

describe("categorizeSkills", () => {
  it("recognizes known and repeated prefixes", () => {
    const result = categorizeSkills([
      capability("lark-doc-create"),
      capability("lark-message-send"),
      capability("acme-read"),
      capability("acme-write"),
    ]);

    expect(result.categoryByCapability.get("lark-doc-create")).toBe("prefix:lark");
    expect(result.categoryByCapability.get("acme-read")).toBe("prefix:acme");
    expect(result.categories.find((category) => category.id === "prefix:acme")?.count).toBe(2);
  });

  it("does not infer semantic categories or group action prefixes", () => {
    const result = categorizeSkills([
      capability("write-thesis-references"),
      capability("write-blog-post"),
      capability("write-document"),
      capability("diagnose", "Debug hard bugs"),
      capability("custom-helper"),
    ]);

    expect(result.categoryByCapability.size).toBe(0);
    expect(result.categories).toEqual([]);
  });
});
