import { describe, expect, it } from "vitest";
import { isTrustedRendererUrl, mainWindowOptions } from "./windowPolicy";

describe("Electron window policy", () => {
  it("keeps the renderer sandboxed behind context isolation", () => {
    expect(mainWindowOptions.webPreferences).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(mainWindowOptions.minWidth).toBe(980);
    expect(mainWindowOptions.minHeight).toBe(640);
  });

  it("trusts only the packaged renderer and the exact development origin", () => {
    expect(isTrustedRendererUrl("app://renderer/index.html")).toBe(true);
    expect(isTrustedRendererUrl("https://example.com/")).toBe(false);
    expect(isTrustedRendererUrl("http://localhost:1420/", "http://localhost:1420")).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:9999/", "http://localhost:1420")).toBe(false);
    expect(isTrustedRendererUrl("http://localhost:1420.evil.example/", "http://localhost:1420")).toBe(false);
  });
});
