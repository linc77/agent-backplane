import { z } from "zod";

export const agentSchema = z.enum(["codex", "claudeCode", "hermes"]);
export const memoryProfileLocaleSchema = z.enum(["zh-CN", "en-US"]);
export const rootOverrideSchema = z.object({ rootOverride: z.string().nullable().optional() }).strict();
export const agentInputSchema = z.object({ agent: agentSchema }).strict();
export const memoryProfileInputSchema = z.object({
  agent: agentSchema,
  locale: memoryProfileLocaleSchema,
}).strict();
export const skillInputSchema = z.object({ projectRootOverride: z.string().nullable().optional() }).strict();
export const skillUsageInputSchema = z.object({
  targets: z.array(z.object({
    capabilityId: z.string().min(1).max(256),
    name: z.string().min(1).max(256),
    manifestPaths: z.array(z.string().min(1).max(4096)).max(64),
  }).strict()).max(5_000),
}).strict();
export const saveSkillManifestSchema = z.object({
  projectRootOverride: z.string().nullable().optional(),
  input: z.object({
    manifestPath: z.string().min(1),
    source: z.string().min(1).max(2_000_000),
    expectedContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();
export const sourceExcerptSchema = z.object({
  rootOverride: z.string().nullable(),
  path: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
}).strict().refine((value) => value.endLine >= value.startLine, "endLine must not precede startLine");
export const memoryChangeMetadataSchema = z.object({
  id: z.string().min(1).max(256),
  operation: z.enum(["replace", "append", "revert"]),
  targetEntryIds: z.array(z.string().min(1).max(4096)).max(256),
  revertsChangeId: z.string().min(1).max(256).nullable(),
  createdAt: z.string().min(1).max(64),
}).strict();
export const memoryChangeTargetSchema = z.object({
  entryId: z.string().min(1).max(4096),
  sourcePath: z.string().min(1).max(4096),
}).strict();
export const correctionDraftSchema = z.object({
  agent: agentSchema,
  slug: z.string(),
  content: z.string(),
  targetPath: z.string(),
  targetSourcePaths: z.array(z.string().min(1).max(4096)).max(256),
  change: memoryChangeMetadataSchema,
}).strict();
export const draftCorrectionSchema = z.object({
  agent: agentSchema,
  rootOverride: z.string().nullable(),
  slug: z.string(),
  bulletLines: z.array(z.string()),
  targets: z.array(memoryChangeTargetSchema).max(256),
}).strict();
export const draftCorrectionFromContentSchema = z.object({
  agent: agentSchema,
  rootOverride: z.string().nullable(),
  slug: z.string(),
  content: z.string(),
  targets: z.array(memoryChangeTargetSchema).max(256),
}).strict();
export const draftRevertSchema = z.object({
  agent: agentSchema,
  rootOverride: z.string().nullable(),
  change: memoryChangeMetadataSchema,
  sourcePath: z.string().min(1).max(4096),
}).strict();
export const writeCorrectionSchema = z.object({
  rootOverride: z.string().nullable(),
  draft: correctionDraftSchema,
}).strict();
export const profileIdInputSchema = z.object({
  agent: agentSchema,
  profileId: z.string().min(1),
}).strict();
export const saveAgentProfileSchema = z.object({
  input: z.object({
    id: z.string().nullable(),
    agent: agentSchema,
    name: z.string(),
    providerKey: z.string(),
    baseUrl: z.string(),
    model: z.string(),
    protocol: z.enum(["responses", "anthropicMessages", "chatCompletions"]),
    official: z.boolean(),
    apiKey: z.string().nullable(),
    clearSecret: z.boolean(),
  }).strict(),
}).strict();
export const revealSourceSchema = z.object({ path: z.string().min(1) }).strict();
