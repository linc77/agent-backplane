import type {
  AgentActivationResult,
  AgentConfigInventory,
  AgentKind,
  AgentMemorySnapshot,
  CorrectionDraft,
  McpInventory,
  MemoryProfileGenerationTask,
  MemoryProfileLocale,
  MemoryChangeMetadata,
  MemoryChangeTarget,
  MemoryChangeWriteResult,
  SaveAgentProfileInput,
  SaveSkillManifestInput,
  ScanResult,
  SkillInventory,
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
  shell: {
    revealSource(path: string): Promise<void>;
  };
}
