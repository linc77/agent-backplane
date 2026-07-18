import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANE_LAYOUT,
  MIN_BOARD_WIDTH,
  RESIZER_WIDTH,
  resizePaneLayout,
} from "./paneLayout";

describe("pane layout", () => {
  it("starts with a compact desktop sidebar", () => {
    expect(DEFAULT_PANE_LAYOUT.sidebarWidth).toBe(240);
  });

  it("resizes the sidebar from the separator", () => {
    const resized = resizePaneLayout(DEFAULT_PANE_LAYOUT, 64, 1400);

    expect(resized.sidebarWidth).toBe(DEFAULT_PANE_LAYOUT.sidebarWidth + 64);
  });

  it("keeps the sidebar within the supported range", () => {
    expect(resizePaneLayout(DEFAULT_PANE_LAYOUT, -1000, 1400).sidebarWidth).toBe(180);
    expect(resizePaneLayout(DEFAULT_PANE_LAYOUT, 1000, 1400).sidebarWidth).toBe(420);
  });

  it("preserves board minimum width while dragging", () => {
    const resized = resizePaneLayout(DEFAULT_PANE_LAYOUT, 900, 1100);
    const boardWidth = 1100 - resized.sidebarWidth - RESIZER_WIDTH;

    expect(boardWidth).toBeGreaterThanOrEqual(MIN_BOARD_WIDTH);
  });
});
