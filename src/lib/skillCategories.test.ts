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
  it("recognizes known namespaces and repeated prefixes", () => {
    const result = categorizeSkills([
      capability("lark-doc-create"),
      capability("lark-message-send"),
      capability("acme-read"),
      capability("acme-write"),
      capability("acme-sync"),
    ]);

    expect(result.categoryByCapability.get("lark-doc-create")).toBe("namespace:lark");
    expect(result.categoryByCapability.get("acme-read")).toBe("namespace:acme");
    expect(result.categories.find((category) => category.id === "namespace:acme")?.count).toBe(3);
  });

  it("keeps action prefixes semantic and leaves unknown skills uncategorized", () => {
    const result = categorizeSkills([
      capability("write-thesis-references"),
      capability("write-blog-post"),
      capability("write-document"),
      capability("diagnose", "Debug hard bugs"),
      capability("custom-helper"),
    ]);

    expect(result.categoryByCapability.get("write-thesis-references")).toBe("semantic:writing");
    expect(result.categoryByCapability.get("diagnose")).toBe("semantic:development");
    expect(result.categoryByCapability.get("custom-helper")).toBe("semantic:uncategorized");
  });
});
