import type {
  AgentActivationResult,
  AgentConfigInventory,
  AgentKind,
  AgentMemorySnapshot,
  CodexAuditMode,
  CodexAuditRun,
  CodexAuditTask,
  CorrectionDraft,
  McpInventory,
  MemoryProfile,
  MemoryProfileGenerationTask,
  SaveAgentProfileInput,
  ScanResult,
  SkillInventory,
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
    generateProfile(rootOverride?: string | null): Promise<MemoryProfile>;
    startProfileGeneration(rootOverride?: string | null): Promise<MemoryProfileGenerationTask>;
    getProfileGeneration(): Promise<MemoryProfileGenerationTask>;
    cancelProfileGeneration(): Promise<MemoryProfileGenerationTask>;
    loadProfile(rootOverride?: string | null): Promise<MemoryProfile>;
    loadAgentSnapshot(agent: AgentKind): Promise<AgentMemorySnapshot>;
    getSourceExcerpt(
      rootOverride: string | null,
      path: string,
      startLine: number,
      endLine: number,
    ): Promise<string>;
    draftCorrection(
      rootOverride: string | null,
      slug: string,
      bulletLines: string[],
    ): Promise<CorrectionDraft>;
    draftCorrectionFromContent(
      rootOverride: string | null,
      slug: string,
      content: string,
    ): Promise<CorrectionDraft>;
    writeCorrection(rootOverride: string | null, draft: CorrectionDraft): Promise<string>;
  };
  audit: {
    start(rootOverride: string | null, mode: CodexAuditMode): Promise<CodexAuditTask>;
    get(): Promise<CodexAuditTask>;
    cancel(): Promise<CodexAuditTask>;
    run(rootOverride: string | null, mode: CodexAuditMode): Promise<CodexAuditRun>;
  };
  skills: {
    load(projectRootOverride?: string | null): Promise<SkillInventory>;
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
