export type MemoryTopic =
  | "profile"
  | "projects"
  | "rules"
  | "tools"
  | "writing"
  | "activityLog"
  | "overrides"
  | "sources"
  | "staleRisks";

export type MemorySourceKind =
  | "summary"
  | "registry"
  | "raw"
  | "rolloutSummary"
  | "adHocNote"
  | "chronicle"
  | "skill";

export interface MemorySource {
  id: string;
  path: string;
  relativePath: string;
  kind: MemorySourceKind;
  modifiedMs: number;
  bytes: number;
  lines: number;
  sha256: string;
}

export interface MemoryEntry {
  id: string;
  revisionHash?: string;
  aliasIds?: string[];
  structuralKey?: string;
  claimKind?: "paragraph" | "listItem" | "block";
  topic: MemoryTopic;
  relatedTopics: MemoryTopic[];
  title: string;
  summary: string;
  searchText: string;
  sourcePath: string;
  startLine: number;
  endLine: number;
  change?: MemoryChangeMetadata;
}

export type MemoryChangeOperation = "replace" | "append" | "revert";

export interface MemoryChangeMetadata {
  schemaVersion?: "1" | "2";
  id: string;
  operation: MemoryChangeOperation;
  targetEntryIds: string[];
  revertsChangeId: string | null;
  createdAt: string;
  targetRevisions?: Record<string, string>;
}

export type RiskKind = "staleConflict" | "coveredByOverride";

export interface RiskFlag {
  id: string;
  kind: RiskKind;
  title: string;
  detail: string;
  entryId: string;
}

export interface CorrectionDraft {
  agent: AgentKind;
  slug: string;
  content: string;
  targetPath: string;
  targetSourcePaths: string[];
  change: MemoryChangeMetadata;
}

export interface MemoryChangeTarget {
  entryId: string;
  sourcePath: string;
  revisionHash?: string;
}

export interface MemoryChangeWriteResult {
  path: string;
  changeId: string;
}

export interface ScanResult {
  root: string;
  sources: MemorySource[];
  entries: MemoryEntry[];
  risks: RiskFlag[];
  catalog?: MemoryCatalogStats;
}

export interface MemoryCatalogStats {
  indexedAt: string;
  reusedSources: number;
  changedSources: number;
}

export interface EvidenceRef {
  entryId: string;
  sourcePath: string;
  startLine: number;
  endLine: number;
  summary: string;
}

export type MemoryProfileConfidence = "high" | "medium" | "low";
export type MemoryProfileStability = "stable" | "recent" | "uncertain";
export type MemoryProfileLocale = "zh-CN" | "en-US";

export interface MemoryProfileSection {
  id: string;
  title: string;
  body: string;
  evidence: EvidenceRef[];
  confidence: MemoryProfileConfidence;
  stability: MemoryProfileStability;
}

export interface MemoryProfileMetadata {
  memoryRoot: string;
  inputEntries: number;
  currentEntries: number;
}

export interface MemoryProfile {
  schemaVersion: "1";
  generatedAt: string;
  sourceHash: string;
  generator: string;
  cachePath: string;
  sections: MemoryProfileSection[];
  metadata: MemoryProfileMetadata;
}

export type MemoryProfileGenerationStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface MemoryProfileGenerationTask {
  id: string | null;
  agent: AgentKind | null;
  locale: MemoryProfileLocale | null;
  status: MemoryProfileGenerationStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  profile: MemoryProfile | null;
}

export type SkillScope = "library" | "global" | "project";
export type SkillFilesystemKind = "directory" | "symlink";
export type SkillHealth = "ready" | "invalid";

export interface SkillRootStatus {
  id: string;
  label: string;
  path: string;
  tool: string;
  scope: SkillScope;
  exists: boolean;
  copyCount: number;
}

export interface SkillCopy {
  id: string;
  name: string;
  description: string;
  markdown: string;
  path: string;
  manifestPath: string;
  source: string;
  tool: string;
  scope: SkillScope;
  filesystemKind: SkillFilesystemKind;
  resolvedPath: string;
  valid: boolean;
  issue: string | null;
  contentHash: string;
}

export interface SkillCapability {
  id: string;
  name: string;
  description: string;
  markdown: string;
  contentHash: string;
  health: SkillHealth;
  copyCount: number;
  tools: string[];
  copies: SkillCopy[];
}

export interface SkillInventory {
  generatedAt: string;
  provider: string;
  snapshotPath: string;
  snapshotError: string | null;
  capabilityCount: number;
  copyCount: number;
  duplicateGroupCount: number;
  invalidCount: number;
  roots: SkillRootStatus[];
  capabilities: SkillCapability[];
}

export interface SaveSkillManifestInput {
  manifestPath: string;
  source: string;
  expectedContentHash: string;
}

export type AgentKind = "codex" | "claudeCode" | "hermes";

export interface SkillSourceInput {
  name: string;
  sourcePath: string;
  contentHash: string;
  scope: SkillScope;
}

export interface SkillSourceRef extends SkillSourceInput {
  sourceId: string;
  directoryName: string;
  manifestPath: string;
}

export interface SkillProject {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillProfile {
  id: string;
  name: string;
  agent: AgentKind;
  skills: SkillSourceRef[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillDeploymentEntry {
  sourceId: string;
  sourcePath: string;
  destinationPath: string;
  contentHash: string;
}

export type SkillBindingSyncState =
  | "never"
  | "pending"
  | "synced"
  | "drifted"
  | "conflict"
  | "failed";

export interface SkillBindingSyncStatus {
  state: SkillBindingSyncState;
  syncedAt: string | null;
  message: string | null;
}

export interface ProjectSkillBinding {
  projectId: string;
  agent: AgentKind;
  profileId: string | null;
  skills: SkillSourceRef[];
  deployments: SkillDeploymentEntry[];
  syncStatus: SkillBindingSyncStatus;
  updatedAt: string;
}

export interface SkillProfileWorkspace {
  schemaVersion: 1;
  generatedAt: string;
  catalogPath: string;
  projects: SkillProject[];
  profiles: SkillProfile[];
  bindings: ProjectSkillBinding[];
}

export interface SaveProjectSkillSelectionInput {
  projectId: string;
  agent: AgentKind;
  skills: SkillSourceInput[];
}

export interface SaveSkillProfileInput {
  id: string | null;
  name: string;
  projectId: string;
  agent: AgentKind;
}

export interface ApplySkillProfileInput {
  profileId: string;
  projectId: string;
}

export interface SyncProjectSkillsInput {
  projectId: string;
  agent: AgentKind;
}

export interface SkillSourceDrift {
  sourceId: string;
  name: string;
  expectedContentHash: string;
  actualContentHash: string;
}

export interface SkillSyncConflict {
  directoryName: string;
  destinationPath: string;
  reason: "unmanaged-target" | "managed-target-changed";
}

export type SkillSyncState = "synced" | "unchanged" | "conflict" | "failed";

export interface SkillSyncResult {
  status: SkillSyncState;
  workspace: SkillProfileWorkspace;
  created: string[];
  removed: string[];
  unchanged: string[];
  driftedSources: SkillSourceDrift[];
  conflicts: SkillSyncConflict[];
  error: string | null;
}

export interface SkillUsageTarget {
  capabilityId: string;
  name: string;
  manifestPaths: string[];
}

export interface SkillUsageSummary {
  capabilityId: string;
  totalCount: number;
  lastUsedAt: string | null;
  agentCounts: Record<AgentKind, number>;
}

export interface SkillUsageInventory {
  generatedAt: string;
  scannedSessions: number;
  summaries: SkillUsageSummary[];
}

export type AgentProtocol = "responses" | "anthropicMessages" | "chatCompletions";
export type AgentProfileSource = "imported" | "managed";

export interface AgentProviderProfile {
  id: string;
  agent: AgentKind;
  name: string;
  providerKey: string;
  baseUrl: string;
  model: string;
  protocol: AgentProtocol;
  official: boolean;
  source: AgentProfileSource;
  hasSecret: boolean;
  active: boolean;
}

export interface AgentTarget {
  agent: AgentKind;
  label: string;
  installed: boolean;
  executablePath: string | null;
  configPath: string;
  configExists: boolean;
  activeProfileId: string | null;
  activeProviderKey: string;
  activeModel: string;
  activeBaseUrl: string;
  reloadHint: string;
  profiles: AgentProviderProfile[];
}

export interface AgentConfigInventory {
  generatedAt: string;
  catalogPath: string;
  targets: AgentTarget[];
}

export interface SaveAgentProfileInput {
  id: string | null;
  agent: AgentKind;
  name: string;
  providerKey: string;
  baseUrl: string;
  model: string;
  protocol: AgentProtocol;
  official: boolean;
  apiKey: string | null;
  clearSecret: boolean;
}

export interface AgentActivationResult {
  inventory: AgentConfigInventory;
  backupPath: string | null;
  reloadHint: string;
}

export interface AgentMemorySnapshot {
  agent: AgentKind;
  writable: boolean;
  scan: ScanResult;
  profile: MemoryProfile | null;
  profileStale: boolean;
  sourceHash: string;
}

export type McpScope = "user" | "local" | "project";
export type McpTransport = "stdio" | "http" | "sse" | "ws" | "unknown";
export type McpEndpointKind = "value" | "local" | "remote" | "conflicting" | "missing";
export type McpServerState = "configured" | "disabled" | "invalid" | "pending" | "rejected";
export type McpServerDiagnostic =
  | "conflicting-endpoints"
  | "invalid-entry"
  | "invalid-name"
  | "missing-endpoint"
  | "missing-transport"
  | "transport-mismatch"
  | "unsupported-transport";
export type McpConfigSourceState = "loaded" | "missing" | "invalid";
export type McpConfigSourceDiagnostic =
  | "file-too-large"
  | "invalid-shape"
  | "parse-failed"
  | "read-failed";

export interface McpConfigSource {
  id: string;
  path: string;
  label: string;
  state: McpConfigSourceState;
  diagnostic: McpConfigSourceDiagnostic | null;
  serverCount: number;
}

export interface McpServer {
  id: string;
  name: string;
  scope: McpScope;
  scopeLabel: string;
  sourceId: string;
  sourcePath: string;
  transport: McpTransport;
  endpoint: string;
  endpointKind: McpEndpointKind;
  state: McpServerState;
  diagnostics: McpServerDiagnostic[];
}

export interface McpInventory {
  generatedAt: string;
  agent: AgentKind;
  sources: McpConfigSource[];
  servers: McpServer[];
}

export interface ModelGatewayCredentials {
  baseUrl: string;
  apiKey: string;
  providerId?: string | null;
}

export interface ModelGatewayProvider {
  id: string;
  name: string;
  baseUrl: string;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelGatewayProviderInventory {
  generatedAt: string;
  providers: ModelGatewayProvider[];
}

export interface SaveModelGatewayProviderInput {
  id: string | null;
  name: string;
  baseUrl: string;
  apiKey: string | null;
  clearSecret: boolean;
}

export interface GatewayModel {
  id: string;
  ownedBy: string | null;
  createdAt: number | null;
}

export interface ModelGatewayDiscovery {
  baseUrl: string;
  models: GatewayModel[];
}

export interface ModelBenchmarkInput extends ModelGatewayCredentials {
  modelId: string;
}

export type ModelBenchmarkStatus = "success" | "failed";

export interface ModelBenchmarkResult {
  modelId: string;
  status: ModelBenchmarkStatus;
  latencyMs: number;
  outputTokens: number | null;
  error: string | null;
}

export type ModelGatewayProtocol =
  | "chatCompletions"
  | "responses"
  | "anthropicMessages"
  | "embeddings"
  | "imageGeneration"
  | "audioGeneration"
  | "models";

export type ModelGatewayProbeOutcome =
  | "success"
  | "authentication_error"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network_error"
  | "invalid_response"
  | "stream_truncated"
  | "dropped";

export interface ModelGatewayProbeInput extends ModelGatewayCredentials {
  modelId: string;
  protocol: ModelGatewayProtocol;
  stream: boolean;
  maxOutputTokens: number;
  timeoutMs: number;
  connectionMode: "warm" | "cold";
}

export interface ModelGatewayProbeSample {
  id: string;
  observedAt: string;
  providerId: string | null;
  protocol: ModelGatewayProtocol;
  modelId: string;
  connectionMode: "warm" | "cold";
  outcome: ModelGatewayProbeOutcome;
  statusCode: number | null;
  ttfbMs: number | null;
  ttftMs: number | null;
  totalMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  generatedUnits: number | null;
  responseModel: string | null;
  systemFingerprint: string | null;
  gatewayRequestId: string | null;
  finishReason: string | null;
  retryAfterMs: number | null;
  error: string | null;
}

export interface ModelGatewayLatencySummary {
  count: number;
  minMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
}

export interface ModelGatewayProbeSummary {
  sampleCount: number;
  successCount: number;
  successRate: number;
  outcomes: Partial<Record<ModelGatewayProbeOutcome, number>>;
  totalLatency: ModelGatewayLatencySummary;
  ttft: ModelGatewayLatencySummary;
  outputTokens: number;
  generatedUnits: number;
}

export interface ModelGatewayTestConfig {
  modelId: string;
  protocol: ModelGatewayProtocol;
  stream: boolean;
  sampleCount: number;
  warmupSamples: number;
  targetRps: number;
  maxConcurrency: number;
  maxOutputTokens: number;
  timeoutMs: number;
  expertMode: boolean;
}

export interface StartModelGatewayTestInput extends ModelGatewayCredentials {
  config: ModelGatewayTestConfig;
}

export type ModelGatewayTestStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "succeeded"
  | "cancelled"
  | "failed";

export interface ModelGatewayTestTask {
  id: string | null;
  providerId: string | null;
  status: ModelGatewayTestStatus;
  startedAt: string | null;
  finishedAt: string | null;
  completedSamples: number;
  totalSamples: number;
  stopReason: "rate_limit" | "budget" | null;
  config: ModelGatewayTestConfig | null;
  summary: ModelGatewayProbeSummary | null;
  samples: ModelGatewayProbeSample[];
  error: string | null;
}

export type ModelGatewayMonitorHealth =
  | "learning"
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "paused"
  | "credentials_required";

export interface ModelGatewayMonitorThresholds {
  minimumSuccessRate: number;
  maximumP95Ms: number;
  maximumP99Ms: number;
}

export interface ModelGatewayMonitorBudget {
  maximumDailyRequests: number;
  maximumDailyOutputTokens: number;
  maximumDailyGeneratedRequests: number;
}

export interface ModelGatewayMonitor {
  id: string;
  name: string;
  providerId: string;
  baseUrl: string;
  modelId: string;
  protocol: ModelGatewayProtocol;
  stream: boolean;
  enabled: boolean;
  hasSecret: boolean;
  fixtureId: string;
  intervalMinutes: number;
  latencyBatchSize: number;
  maxOutputTokens: number;
  timeoutMs: number;
  thresholds: ModelGatewayMonitorThresholds;
  budget: ModelGatewayMonitorBudget;
  health: ModelGatewayMonitorHealth;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  createdAt: string;
  updatedAt: string;
  lastProbeAt: string | null;
  nextProbeAt: string | null;
  lastLatencyBatchAt: string | null;
  lastColdProbeAt: string | null;
  latestSample: ModelGatewayProbeSample | null;
  summary7d: ModelGatewayProbeSummary;
}

export interface SaveModelGatewayMonitorInput {
  id: string | null;
  name: string;
  providerId: string;
  modelId: string;
  protocol: ModelGatewayProtocol;
  stream: boolean;
  enabled: boolean;
  fixtureId: string;
  intervalMinutes: number;
  latencyBatchSize: number;
  maxOutputTokens: number;
  timeoutMs: number;
  thresholds: ModelGatewayMonitorThresholds;
  budget: ModelGatewayMonitorBudget;
}

export interface ModelGatewayMonitorInventory {
  generatedAt: string;
  monitors: ModelGatewayMonitor[];
}

export interface ModelGatewayReportExport {
  path: string;
  format: "json" | "csv";
}

export interface ExportModelGatewayReportInput {
  scope: "test" | "monitor";
  id: string;
  format: "json" | "csv";
}
