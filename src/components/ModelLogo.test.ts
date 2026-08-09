import { describe, expect, it } from "vitest";
import { detectModelBrand } from "./ModelLogo";

describe("detectModelBrand", () => {
  it.each([
    ["deepseek-chat", null, "deepseek"],
    ["provider/claude-3-7-sonnet", null, "claude"],
    ["custom-model", "Anthropic", "claude"],
    ["gemini-2.5-pro", "Google", "gemini"],
    ["gpt-4o-mini", null, "openai"],
    ["o3-mini", "system", "openai"],
    ["custom-model", "OpenAI", "openai"],
    ["local-model", "local", null],
  ])("maps %s from %s to %s", (modelId, ownedBy, expected) => {
    expect(detectModelBrand(modelId, ownedBy)).toBe(expected);
  });
});
