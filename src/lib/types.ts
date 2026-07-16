export type MemoryTopic =
  | "profile"
  | "projects"
  | "rules"
  | "tools"
  | "writing"
  | "activityLog"
  | "audit"
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
  slug: string;
  content: string;
  targetPath: string;
}

export interface ScanResult {
  root: string;
  sources: MemorySource[];
  entries: MemoryEntry[];
  risks: RiskFlag[];
}

export type CodexAuditMode = "curated" | "full";

export type ClaimScope = "global" | "project" | "tool" | "writing" | "rule" | "unknown";

export type ClaimStatus = "current" | "stale" | "historical" | "uncertain";

export interface EvidenceRef {
  sourcePath: string;
  startLine: number;
  endLine: number;
  summary: string;
}

export interface MemoryClaim {
  id: string;
  subject: string;
  field: string;
  value: string;
  scope: ClaimScope;
  status: ClaimStatus;
  confidence: number;
  rationale: string;
  evidence: EvidenceRef[];
}

export interface MemoryConflict {
  id: string;
  title: string;
  detail: string;
  confidence: number;
  claimIds: string[];
  evidence: EvidenceRef[];
}

export interface SuggestedCorrection {
  id: string;
  title: string;
  reason: string;
  content: string;
  confidence: number;
  affectedClaimIds: string[];
  evidence: EvidenceRef[];
}

export interface CodexAuditMetadata {
  memoryRoot: string;
  inputEntries: number;
  model: string;
}

export interface CodexAuditReport {
  schemaVersion: "1";
  mode: CodexAuditMode;
  generatedAt: string;
  summary: string;
  currentClaims: MemoryClaim[];
  staleClaims: MemoryClaim[];
  conflicts: MemoryConflict[];
  uncertainClaims: MemoryClaim[];
  suggestedCorrections: SuggestedCorrection[];
  metadata: CodexAuditMetadata;
}

export interface CodexAuditRun {
  report: CodexAuditReport;
  cachePath: string;
}

export type CodexAuditTaskStatus =
  | "idle"
  | "running"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface CodexAuditTask {
  id: string | null;
  mode: CodexAuditMode | null;
  status: CodexAuditTaskStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  run: CodexAuditRun | null;
}

export type MemoryProfileConfidence = "high" | "medium" | "low";
export type MemoryProfileStability = "stable" | "recent" | "uncertain";

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
  path: string;
  manifestPath: string;
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

export type AgentKind = "codex" | "claudeCode" | "hermes";
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
