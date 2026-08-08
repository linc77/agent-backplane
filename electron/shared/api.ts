import type {
  AgentActivationResult,
  AgentConfigInventory,
  AgentKind,
  AgentMemorySnapshot,
  ApplySkillProfileInput,
  CorrectionDraft,
  ExportModelGatewayReportInput,
  McpInventory,
  ModelBenchmarkInput,
  ModelBenchmarkResult,
  ModelGatewayCredentials,
  ModelGatewayDiscovery,
  ModelGatewayMonitorInventory,
  ModelGatewayProviderInventory,
  ModelGatewayProbeInput,
  ModelGatewayProbeSample,
  ModelGatewayReportExport,
  ModelGatewayTestTask,
  SaveModelGatewayMonitorInput,
  SaveModelGatewayProviderInput,
  StartModelGatewayTestInput,
  MemoryProfileGenerationTask,
  MemoryProfileLocale,
  MemoryChangeMetadata,
  MemoryChangeTarget,
  MemoryChangeWriteResult,
  SaveAgentProfileInput,
  SaveProjectSkillSelectionInput,
  SaveSkillProfileInput,
  SaveSkillManifestInput,
  ScanResult,
  SkillInventory,
  SkillProfileWorkspace,
  SkillProject,
  SkillSyncResult,
  SkillUsageInventory,
  SkillUsageTarget,
} from "../../src/lib/types";
import type { AppUpdateState } from "../../src/lib/appUpdate";

export interface BackplaneDesktopApi {
  app: {
    getUpdateState(): Promise<AppUpdateState>;
    checkForUpdates(): Promise<AppUpdateState>;
    downloadUpdate(): Promise<AppUpdateState>;
    installUpdate(): Promise<void>;
  };
  memory: {
    scan(rootOverride?: string | null): Promise<ScanResult>;
    startProfileGeneration(
      agent: AgentKind,
      locale: MemoryProfileLocale,
    ): Promise<MemoryProfileGenerationTask>;
    getProfileGeneration(): Promise<MemoryProfileGenerationTask>;
    cancelProfileGeneration(): Promise<MemoryProfileGenerationTask>;
    loadAgentSnapshot(
      agent: AgentKind,
      locale: MemoryProfileLocale,
    ): Promise<AgentMemorySnapshot>;
    getSourceExcerpt(
      rootOverride: string | null,
      path: string,
      startLine: number,
      endLine: number,
    ): Promise<string>;
    draftCorrection(
      agent: AgentKind,
      rootOverride: string | null,
      slug: string,
      bulletLines: string[],
      targets: MemoryChangeTarget[],
    ): Promise<CorrectionDraft>;
    draftCorrectionFromContent(
      agent: AgentKind,
      rootOverride: string | null,
      slug: string,
      content: string,
      targets: MemoryChangeTarget[],
    ): Promise<CorrectionDraft>;
    draftRevert(
      agent: AgentKind,
      rootOverride: string | null,
      change: MemoryChangeMetadata,
      sourcePath: string,
    ): Promise<CorrectionDraft>;
    writeCorrection(rootOverride: string | null, draft: CorrectionDraft): Promise<MemoryChangeWriteResult>;
  };
  skills: {
    load(projectRootOverride?: string | null): Promise<SkillInventory>;
    loadUsage(targets: SkillUsageTarget[]): Promise<SkillUsageInventory>;
    saveManifest(
      input: SaveSkillManifestInput,
      projectRootOverride?: string | null,
    ): Promise<SkillInventory>;
    loadWorkspace(): Promise<SkillProfileWorkspace>;
    chooseProject(): Promise<SkillProject | null>;
    saveSelection(input: SaveProjectSkillSelectionInput): Promise<SkillProfileWorkspace>;
    saveProfile(input: SaveSkillProfileInput): Promise<SkillProfileWorkspace>;
    deleteProfile(profileId: string): Promise<SkillProfileWorkspace>;
    applyProfile(input: ApplySkillProfileInput): Promise<SkillProfileWorkspace>;
    syncProject(projectId: string, agent: AgentKind): Promise<SkillSyncResult>;
  };
  agentConfig: {
    load(): Promise<AgentConfigInventory>;
    save(input: SaveAgentProfileInput): Promise<AgentConfigInventory>;
    delete(agent: AgentKind, profileId: string): Promise<AgentConfigInventory>;
    activate(agent: AgentKind, profileId: string): Promise<AgentActivationResult>;
  };
  mcp: {
    load(agent: AgentKind): Promise<McpInventory>;
  };
  modelGateway: {
    loadProviders(): Promise<ModelGatewayProviderInventory>;
    saveProvider(input: SaveModelGatewayProviderInput): Promise<ModelGatewayProviderInventory>;
    deleteProvider(id: string): Promise<ModelGatewayProviderInventory>;
    discover(input: ModelGatewayCredentials): Promise<ModelGatewayDiscovery>;
    benchmark(input: ModelBenchmarkInput): Promise<ModelBenchmarkResult>;
    probe(input: ModelGatewayProbeInput): Promise<ModelGatewayProbeSample>;
    startTest(input: StartModelGatewayTestInput): Promise<ModelGatewayTestTask>;
    getTest(): Promise<ModelGatewayTestTask>;
    cancelTest(): Promise<ModelGatewayTestTask>;
    loadMonitors(): Promise<ModelGatewayMonitorInventory>;
    saveMonitor(input: SaveModelGatewayMonitorInput): Promise<ModelGatewayMonitorInventory>;
    deleteMonitor(id: string): Promise<ModelGatewayMonitorInventory>;
    setMonitorEnabled(id: string, enabled: boolean): Promise<ModelGatewayMonitorInventory>;
    runMonitorNow(id: string): Promise<ModelGatewayMonitorInventory>;
    exportReport(input: ExportModelGatewayReportInput): Promise<ModelGatewayReportExport | null>;
  };
  shell: {
    revealSource(path: string): Promise<void>;
  };
}
