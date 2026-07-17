import type { BackplaneDesktopApi } from "../electron/shared/api";

declare global {
  interface Window {
    backplane: BackplaneDesktopApi;
  }
}

export {};
