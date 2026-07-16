export const mainWindowOptions = {
  width: 1180,
  height: 760,
  minWidth: 980,
  minHeight: 640,
  center: true,
  show: false,
  title: "Agent Memory Manager",
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
} as const;

export function isTrustedRendererUrl(url: string, developmentOrigin?: string) {
  try {
    const candidate = new URL(url);
    if (developmentOrigin && candidate.origin === new URL(developmentOrigin).origin) return true;
    return candidate.protocol === "app:" && candidate.hostname === "renderer";
  } catch {
    return false;
  }
}
