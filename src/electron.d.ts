import type { AmmDesktopApi } from "../electron/shared/api";

declare global {
  interface Window {
    amm: AmmDesktopApi;
  }
}

export {};
