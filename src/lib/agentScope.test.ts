// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isAgentKind, readStoredAgent, writeStoredAgent } from "./agentScope";

describe("Agent scope persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("falls back to Codex for missing or invalid values", () => {
    expect(readStoredAgent()).toBe("codex");

    window.localStorage.setItem("agent-backplane.selected-agent", "unknown");
    expect(readStoredAgent()).toBe("codex");
    expect(isAgentKind("unknown")).toBe(false);
  });

  it("persists a supported Agent", () => {
    writeStoredAgent("hermes");

    expect(readStoredAgent()).toBe("hermes");
    expect(isAgentKind("hermes")).toBe(true);
  });
});
