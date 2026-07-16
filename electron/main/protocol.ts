import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative } from "node:path";
import { protocol } from "electron";

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
      },
    },
  ]);
}

export function handleAppScheme(rendererRoot: string) {
  protocol.handle("app", async (request) => {
    const requestUrl = new URL(request.url);
    const requestedPath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "") || "index.html";
    const target = normalize(join(rendererRoot, requestedPath));
    const targetRelative = relative(rendererRoot, target);
    if (targetRelative.startsWith("..") || targetRelative.includes("://")) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const body = await readFile(target);
      return new Response(body, {
        headers: {
          "Content-Type": mimeTypes[extname(target)] ?? "application/octet-stream",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
