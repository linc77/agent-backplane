import { link, mkdir, open, readFile, realpath, rm, stat, unlink } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CorrectionDraft } from "../../../../src/lib/types";

function timestamp(date = new Date()) {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
}
function safeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "memory-update";
}

function correctionTarget(root: string, slug: string) {
  const normalized = safeSlug(slug);
  return {
    slug: normalized,
    targetPath: join(root, "extensions", "ad_hoc", "notes", `${timestamp()}-${normalized}.md`),
  };
}

export function draftCorrection(root: string, slug: string, bulletLines: string[]): CorrectionDraft {
  const target = correctionTarget(root, slug);
  const body = bulletLines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
  return { ...target, content: `Memory update request:\n\n${body}${body ? "\n" : ""}` };
}

export function draftCorrectionFromContent(root: string, slug: string, content: string): CorrectionDraft {
  const target = correctionTarget(root, slug);
  const trimmed = content.trim();
  const normalized = trimmed.toLowerCase().startsWith("memory update request:")
    ? `${trimmed}\n`
    : `Memory update request:\n\n${trimmed}\n`;
  return { ...target, content: normalized };
}

export async function getSourceExcerpt(
  root: string,
  path: string,
  startLine: number,
  endLine: number,
) {
  const [canonicalRoot, canonicalPath] = await Promise.all([realpath(root), realpath(path)]);
  const relativePath = relative(canonicalRoot, canonicalPath);
  const isOutsideRoot = relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
  if (isOutsideRoot) {
    throw new Error("source path must stay inside the selected memory root");
  }
  return (await readFile(canonicalPath, "utf8"))
    .split(/\r?\n/)
    .slice(startLine - 1, endLine)
    .join("\n");
}

export async function writeCorrection(root: string, draft: CorrectionDraft) {
  const allowedDirectory = join(root, "extensions", "ad_hoc", "notes");
  await mkdir(allowedDirectory, { recursive: true });
  const canonicalDirectory = await realpath(allowedDirectory);
  const target = resolve(draft.targetPath);
  const canonicalParent = await realpath(dirname(target));
  if (canonicalParent !== canonicalDirectory || extname(target) !== ".md") {
    throw new Error("correction notes can only be written under extensions/ad_hoc/notes");
  }
  if (await stat(target).then(() => true).catch(() => false)) {
    throw new Error("correction note target already exists");
  }
  const temporary = `${target}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(draft.content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await link(temporary, target);
    await unlink(temporary);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  await rm(join(root, ".amm", "profile.json"), { force: true });
  return target;
}
