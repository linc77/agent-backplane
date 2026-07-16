import { z } from "zod";

export const agentSchema = z.enum(["codex", "claudeCode", "hermes"]);
export const auditModeSchema = z.enum(["curated", "full"]);
export const rootOverrideSchema = z.object({ rootOverride: z.string().nullable().optional() }).strict();
export const agentInputSchema = z.object({ agent: agentSchema }).strict();
export const skillInputSchema = z.object({ projectRootOverride: z.string().nullable().optional() }).strict();
export const sourceExcerptSchema = z.object({
  rootOverride: z.string().nullable(),
  path: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
}).strict().refine((value) => value.endLine >= value.startLine, "endLine must not precede startLine");
export const correctionDraftSchema = z.object({
  slug: z.string(),
  content: z.string(),
  targetPath: z.string(),
}).strict();
export const draftCorrectionSchema = z.object({
  rootOverride: z.string().nullable(),
  slug: z.string(),
  bulletLines: z.array(z.string()),
}).strict();
export const draftCorrectionFromContentSchema = z.object({
  rootOverride: z.string().nullable(),
  slug: z.string(),
  content: z.string(),
}).strict();
export const writeCorrectionSchema = z.object({
  rootOverride: z.string().nullable(),
  draft: correctionDraftSchema,
}).strict();
export const auditInputSchema = z.object({
  rootOverride: z.string().nullable(),
  mode: auditModeSchema,
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
