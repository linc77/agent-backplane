export interface PaneLayout {
  sidebarWidth: number;
}

export const RESIZER_WIDTH = 8;
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 420;
export const MIN_BOARD_WIDTH = 560;

export const DEFAULT_PANE_LAYOUT: PaneLayout = {
  sidebarWidth: 240,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.round(value), min), max);
}

export function clampPaneLayout(layout: PaneLayout, viewportWidth: number): PaneLayout {
  const minViewportWidth = MIN_SIDEBAR_WIDTH + MIN_BOARD_WIDTH + RESIZER_WIDTH;
  const availableWidth = Math.max(viewportWidth, minViewportWidth) - RESIZER_WIDTH;
  const sidebarMax = Math.min(MAX_SIDEBAR_WIDTH, availableWidth - MIN_BOARD_WIDTH);
  const sidebarWidth = clamp(layout.sidebarWidth, MIN_SIDEBAR_WIDTH, sidebarMax);

  return { sidebarWidth };
}

export function resizePaneLayout(
  layout: PaneLayout,
  deltaX: number,
  viewportWidth: number,
) {
  return clampPaneLayout(
    { sidebarWidth: layout.sidebarWidth + deltaX },
    viewportWidth,
  );
}

export function paneGridTemplate(layout: PaneLayout) {
  return `${layout.sidebarWidth}px ${RESIZER_WIDTH}px minmax(${MIN_BOARD_WIDTH}px, 1fr)`;
}
