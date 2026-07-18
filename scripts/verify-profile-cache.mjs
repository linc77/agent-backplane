#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const optional = args.includes("--optional");
const explicitPath = args.find((arg) => !arg.startsWith("--"));
const cachePath =
  explicitPath ?? path.join(os.homedir(), ".codex/memories/.backplane/profile.zh-CN.json");

const allowedGenerators = new Set(["codex-profile-v4"]);

const templateIds = new Set([
  "overview",
  "agent-research",
  "developer-tools",
  "learning-style",
  "content-creation",
  "career",
  "other-interests",
  "memory-details",
]);

const templateTitles = new Set([
  "概览",
  "AI Agent 与长期研究方向",
  "开发工具与技术兴趣",
  "学习方式偏好",
  "内容创作与 X",
  "工作与职业发展",
  "其他兴趣",
  "记忆细节",
]);

const forbiddenPatterns = [
  /scope:/i,
  /applies_to:/i,
  /rollout_summaries\//i,
  /rollout_path=/i,
  /thread_id=/i,
  /\[Task\s+\d+/i,
  /(^|[：:\s])Task\s+\d+/,
  /Symptom:/,
  /你当前被记住的是：/,
  /相关记忆显示：/,
  /when the user/i,
  /answer by/i,
  /rather than/i,
];

const confidenceValues = new Set(["high", "medium", "low"]);
const stabilityValues = new Set(["stable", "recent", "uncertain"]);

function fail(message) {
  console.error(`profile-cache check failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(cachePath)) {
  if (optional) {
    console.log(`profile-cache check skipped: ${cachePath} does not exist`);
    process.exit(0);
  }
  fail(`${cachePath} does not exist`);
}

let profile;
try {
  profile = JSON.parse(fs.readFileSync(cachePath, "utf8"));
} catch (error) {
  fail(`invalid JSON at ${cachePath}: ${error.message}`);
}

if (optional && !allowedGenerators.has(profile?.generator)) {
  console.log(`profile-cache check skipped: ${cachePath} uses outdated generator ${profile?.generator}`);
  process.exit(0);
}

const errors = [];

function check(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function hasForbiddenText(text) {
  return forbiddenPatterns.some((pattern) => pattern.test(text));
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/u.test(text);
}

function lineCount(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
}

check(profile && typeof profile === "object" && !Array.isArray(profile), "profile must be an object");
check(profile.schemaVersion === "1", "schemaVersion must be 1");
check(typeof profile.generatedAt === "string" && profile.generatedAt.length > 0, "generatedAt is required");
check(typeof profile.sourceHash === "string" && profile.sourceHash.length > 0, "sourceHash is required");
check(allowedGenerators.has(profile.generator), `unsupported generator: ${profile.generator}`);
check(Array.isArray(profile.sections), "sections must be an array");
check(profile.sections?.length > 0, "sections must not be empty for a profile cache quality check");
check(profile.sections?.length <= 8, "sections must not exceed 8 items");
check(profile.metadata && typeof profile.metadata === "object", "metadata is required");

const requiresChineseSynthesis = profile.generator === "codex-profile-v4";

const memoryRoot = profile.metadata?.memoryRoot;
check(typeof memoryRoot === "string" && memoryRoot.length > 0, "metadata.memoryRoot is required");
if (typeof memoryRoot === "string" && memoryRoot.length > 0) {
  check(fs.existsSync(memoryRoot), `metadata.memoryRoot does not exist: ${memoryRoot}`);
}

const ids = new Set();
const titles = new Set();

for (const [index, section] of (profile.sections ?? []).entries()) {
  const prefix = `sections[${index}]`;
  check(section && typeof section === "object" && !Array.isArray(section), `${prefix} must be an object`);
  if (!section || typeof section !== "object") {
    continue;
  }

  check(typeof section.id === "string" && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(section.id), `${prefix}.id must be a kebab-case slug`);
  check(!ids.has(section.id), `${prefix}.id is duplicated: ${section.id}`);
  ids.add(section.id);
  check(!templateIds.has(section.id), `${prefix}.id uses a template bucket: ${section.id}`);

  check(typeof section.title === "string" && section.title.trim().length > 0, `${prefix}.title is required`);
  check(typeof section.title === "string" && section.title.length <= 42, `${prefix}.title should stay concise`);
  check(!titles.has(section.title), `${prefix}.title is duplicated: ${section.title}`);
  titles.add(section.title);
  check(!templateTitles.has(section.title), `${prefix}.title uses a template bucket: ${section.title}`);
  if (requiresChineseSynthesis) {
    check(typeof section.title === "string" && hasCjk(section.title), `${prefix}.title should include Chinese synthesis`);
    check(typeof section.title === "string" && !hasForbiddenText(section.title), `${prefix}.title contains machine text`);
  }

  check(typeof section.body === "string" && section.body.trim().length >= 20, `${prefix}.body is too short`);
  if (requiresChineseSynthesis) {
    check(typeof section.body === "string" && hasCjk(section.body), `${prefix}.body should include Chinese synthesis`);
    check(typeof section.body === "string" && !hasForbiddenText(section.body), `${prefix}.body contains machine text`);
  }

  check(confidenceValues.has(section.confidence), `${prefix}.confidence is invalid`);
  check(stabilityValues.has(section.stability), `${prefix}.stability is invalid`);
  check(Array.isArray(section.evidence) && section.evidence.length > 0, `${prefix}.evidence must not be empty`);

  for (const [evidenceIndex, evidence] of (section.evidence ?? []).entries()) {
    const evidencePrefix = `${prefix}.evidence[${evidenceIndex}]`;
    check(evidence && typeof evidence === "object" && !Array.isArray(evidence), `${evidencePrefix} must be an object`);
    if (!evidence || typeof evidence !== "object") {
      continue;
    }

    check(typeof evidence.entryId === "string" && evidence.entryId.length > 0, `${evidencePrefix}.entryId is required`);
    check(typeof evidence.sourcePath === "string" && evidence.sourcePath.length > 0, `${evidencePrefix}.sourcePath is required`);
    check(!path.isAbsolute(evidence.sourcePath), `${evidencePrefix}.sourcePath must be relative`);
    check(!evidence.sourcePath.split(/[\\/]/).includes(".."), `${evidencePrefix}.sourcePath must not traverse`);
    check(Number.isInteger(evidence.startLine) && evidence.startLine >= 1, `${evidencePrefix}.startLine is invalid`);
    check(Number.isInteger(evidence.endLine) && evidence.endLine >= evidence.startLine, `${evidencePrefix}.endLine is invalid`);
    check(typeof evidence.summary === "string" && evidence.summary.trim().length > 0, `${evidencePrefix}.summary is required`);
    if (requiresChineseSynthesis) {
      check(typeof evidence.summary === "string" && hasCjk(evidence.summary), `${evidencePrefix}.summary should include Chinese synthesis`);
      check(typeof evidence.summary === "string" && !hasForbiddenText(evidence.summary), `${evidencePrefix}.summary contains machine text`);
    }

    if (typeof memoryRoot === "string" && memoryRoot.length > 0 && typeof evidence.sourcePath === "string") {
      const sourcePath = path.join(memoryRoot, evidence.sourcePath);
      check(fs.existsSync(sourcePath), `${evidencePrefix}.sourcePath does not exist: ${evidence.sourcePath}`);
      if (fs.existsSync(sourcePath)) {
        check(evidence.endLine <= lineCount(sourcePath), `${evidencePrefix}.line range exceeds source length`);
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`profile-cache check failed: ${error}`);
  }
  process.exit(1);
}

console.log(
  `profile-cache check passed: ${cachePath} (${profile.generator}, ${profile.sections.length} sections)`,
);
