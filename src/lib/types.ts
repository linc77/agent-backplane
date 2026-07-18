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
  id: string;
  operation: MemoryChangeOperation;
  targetEntryIds: string[];
  revertsChangeId: string | null;
  createdAt: string;
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

export type SkillScope = "global" | "project";
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
