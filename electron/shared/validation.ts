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
export const emptyInputSchema = z.object({}).strict();
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
const projectIdSchema = z.string().min(1).max(256);
const profileIdSchema = z.string().min(1).max(256);
export const saveProjectSkillSelectionSchema = z.object({
  projectId: projectIdSchema,
  agent: agentSchema,
  skills: z.array(z.object({
    name: z.string().min(1).max(256),
    sourcePath: z.string().min(1).max(4096),
    contentHash: z.string().min(1).max(256),
    scope: z.enum(["library", "global", "project"]),
  }).strict()).max(5_000),
}).strict();
export const saveSkillProfileSchema = z.object({
  id: profileIdSchema.nullable(),
  projectId: projectIdSchema,
  agent: agentSchema,
  name: z.string().min(1).max(120),
}).strict();
export const deleteSkillProfileSchema = z.object({
  profileId: profileIdSchema,
}).strict();
export const applySkillProfileSchema = z.object({
  profileId: profileIdSchema,
  projectId: projectIdSchema,
}).strict();
export const projectSkillBindingSchema = z.object({
  projectId: projectIdSchema,
  agent: agentSchema,
}).strict();
export const sourceExcerptSchema = z.object({
  rootOverride: z.string().nullable(),
  path: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
}).strict().refine((value) => value.endLine >= value.startLine, "endLine must not precede startLine");
export const memoryChangeMetadataSchema = z.object({
  schemaVersion: z.enum(["1", "2"]).optional(),
  id: z.string().min(1).max(256),
  operation: z.enum(["replace", "append", "revert"]),
  targetEntryIds: z.array(z.string().min(1).max(4096)).max(256),
  revertsChangeId: z.string().min(1).max(256).nullable(),
  createdAt: z.string().min(1).max(64),
  targetRevisions: z.record(
    z.string().min(1).max(4096),
    z.string().min(1).max(256),
  ).optional(),
}).strict();
export const memoryChangeTargetSchema = z.object({
  entryId: z.string().min(1).max(4096),
  sourcePath: z.string().min(1).max(4096),
  revisionHash: z.string().min(1).max(256).optional(),
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
export const modelGatewayCredentialsSchema = z.object({
  baseUrl: z.string().min(1).max(4_096),
  apiKey: z.string().max(16_384),
  providerId: z.string().uuid().nullable().optional(),
}).strict();
export const saveModelGatewayProviderSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
  baseUrl: z.string().min(1).max(4_096),
  apiKey: z.string().max(16_384).nullable(),
  clearSecret: z.boolean(),
}).strict();
export const modelGatewayProviderIdSchema = z.object({ id: z.string().uuid() }).strict();
export const modelGatewayBenchmarkSchema = modelGatewayCredentialsSchema.extend({
  modelId: z.string().min(1).max(1_024),
}).strict();
export const modelGatewayProtocolSchema = z.enum([
  "chatCompletions",
  "responses",
  "anthropicMessages",
  "embeddings",
  "imageGeneration",
  "audioGeneration",
  "models",
]);
export const modelGatewayProbeSchema = modelGatewayCredentialsSchema.extend({
  modelId: z.string().max(1_024),
  protocol: modelGatewayProtocolSchema,
  stream: z.boolean(),
  maxOutputTokens: z.number().int().min(1).max(4_096),
  timeoutMs: z.number().int().min(1_000).max(600_000),
  connectionMode: z.enum(["warm", "cold"]),
}).strict().refine((value) => value.protocol === "models" || value.modelId.trim().length > 0, "Model is required.");
const modelGatewayTestConfigSchema = z.object({
  modelId: z.string().max(1_024),
  protocol: modelGatewayProtocolSchema,
  stream: z.boolean(),
  sampleCount: z.number().int().min(1).max(10_000),
  warmupSamples: z.number().int().min(0).max(100),
  targetRps: z.number().min(0.05).max(100),
  maxConcurrency: z.number().int().min(1).max(100),
  maxOutputTokens: z.number().int().min(1).max(4_096),
  timeoutMs: z.number().int().min(1_000).max(600_000),
  expertMode: z.boolean(),
}).strict()
  .refine((value) => value.protocol === "models" || value.modelId.trim().length > 0, "Model is required.")
  .refine((value) => value.expertMode || (value.targetRps <= 1 && value.maxConcurrency <= 3), "Expert mode is required above the safe load limit.");
export const startModelGatewayTestSchema = modelGatewayCredentialsSchema.extend({
  config: modelGatewayTestConfigSchema,
}).strict();
const modelGatewayThresholdsSchema = z.object({
  minimumSuccessRate: z.number().min(0).max(1),
  maximumP95Ms: z.number().int().min(1).max(3_600_000),
  maximumP99Ms: z.number().int().min(1).max(3_600_000),
}).strict();
const modelGatewayBudgetSchema = z.object({
  maximumDailyRequests: z.number().int().min(1).max(1_000_000),
  maximumDailyOutputTokens: z.number().int().min(1).max(1_000_000_000),
  maximumDailyGeneratedRequests: z.number().int().min(1).max(1_000_000),
}).strict();
export const saveModelGatewayMonitorSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().min(1).max(160),
  providerId: z.string().uuid(),
  modelId: z.string().max(1_024),
  protocol: modelGatewayProtocolSchema,
  stream: z.boolean(),
  enabled: z.boolean(),
  fixtureId: z.string().min(1).max(128),
  intervalMinutes: z.number().int().min(1).max(1_440),
  latencyBatchSize: z.number().int().min(1).max(100),
  maxOutputTokens: z.number().int().min(1).max(4_096),
  timeoutMs: z.number().int().min(1_000).max(600_000),
  thresholds: modelGatewayThresholdsSchema,
  budget: modelGatewayBudgetSchema,
}).strict().refine((value) => value.protocol === "models" || value.modelId.trim().length > 0, "Model is required.");
export const modelGatewayMonitorIdSchema = z.object({ id: z.string().uuid() }).strict();
export const modelGatewayMonitorEnabledSchema = z.object({
  id: z.string().uuid(),
  enabled: z.boolean(),
}).strict();
export const exportModelGatewayReportSchema = z.object({
  scope: z.enum(["test", "monitor"]),
  id: z.string().uuid(),
  format: z.enum(["json", "csv"]),
}).strict();
export const revealSourceSchema = z.object({ path: z.string().min(1) }).strict();
