import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function isoNow() {
  return new Date().toISOString();
}

export function resolveHomePath(value: string) {
  if (value === "~") {
    return homedir();
  }
  if (value.startsWith("~/")) {
    return join(homedir(), value.slice(2));
  }
  return resolve(value);
}

export function nonBlankEnvironmentPath(name: string) {
  const value = process.env[name]?.trim();
  return value ? resolveHomePath(value) : null;
}

export async function atomicWrite(path: string, content: string | Uint8Array, mode = 0o600) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
  const temporary = join(parent, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { mode, flag: "wx" });
    await rename(temporary, path);
    await chmod(path, mode).catch(() => undefined);
  } catch (error) {
    const { rm } = await import("node:fs/promises");
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function textLines(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}
