import type { MemoryView } from "./memoryViews";
import type { MemoryTruthStatus } from "./memoryTruth";
import type { CodexAuditMode, MemorySourceKind, MemoryTopic, RiskKind } from "./types";

export type Locale = "zh-CN" | "en-US";

export interface UiText {
  app: {
    fixtureBanner: string;
    resizeSidebar: string;
    resizeInspector: string;
    scanning: string;
    correctionWritten: (path: string) => string;
  };
  sidebar: {
    brandTitle: string;
    brandSubtitle: string;
    defaultRoot: string;
    languageLabel: string;
    sections: {
      memoryModel: string;
      sources: string;
      review: string;
    };
  };
  views: Record<MemoryView, string>;
  sourceKinds: Record<MemorySourceKind, string>;
  truthStatuses: Record<MemoryTruthStatus, string>;
  topics: Record<MemoryTopic, string>;
  memoryCards: Record<MemoryTopic, string>;
  riskKinds: Record<RiskKind, string>;
  auditModes: Record<CodexAuditMode, string>;
  memorySummary: {
    eyebrow: string;
    title: string;
    wrong: string;
    viewEvidence: string;
    evidence: string;
    loading: string;
    emptyTitle: string;
    regenerate: string;
    cancelGeneration: string;
    generatedBy: (generator: string, count: number) => string;
    matchingSections: (count: number) => string;
    confidence: Record<"high" | "medium" | "low", string>;
    stability: Record<"stable" | "recent" | "uncertain", string>;
    evidenceTrust: Record<"current" | "stale" | "uncertain" | "conflict", string>;
    evidenceTrustNotes: Record<"current" | "stale" | "uncertain" | "conflict", string>;
  };
  skills: {
    eyebrow: string;
    title: string;
    subtitle: string;
    capabilities: string;
    discoveredCopies: string;
    duplicateGroups: string;
    invalidCopies: string;
    searchPlaceholder: string;
    allTools: string;
    refresh: string;
    loading: string;
    empty: string;
    readOnly: string;
    tools: string;
    copyLocations: string;
    path: string;
    resolvedPath: string;
    reveal: string;
    ready: string;
    invalid: string;
    globalScope: string;
    projectScope: string;
    directory: string;
    symlink: string;
    snapshot: string;
    scanRoots: string;
    noDescription: string;
    copyCount: (count: number) => string;
  };
  agents: {
    eyebrow: string;
    title: string;
    subtitle: string;
    refresh: string;
    addProfile: string;
    loading: string;
    installed: string;
    notInstalled: string;
    currentConfig: string;
    currentModel: string;
    currentProvider: string;
    noProfiles: string;
    active: string;
    enable: string;
    enabling: string;
    edit: string;
    delete: string;
    imported: string;
    managed: string;
    credentialStored: string;
    noCredential: string;
    official: string;
    custom: string;
    profileName: string;
    providerKey: string;
    baseUrl: string;
    model: string;
    protocol: string;
    apiKey: string;
    apiKeyHint: string;
    clearCredential: string;
    cancel: string;
    save: string;
    saving: string;
    createTitle: string;
    editTitle: string;
    backupCreated: (path: string) => string;
    switched: (agent: string) => string;
    configPath: string;
    catalogPath: string;
  };
  board: {
    eyebrow: string;
    scannedSources: string;
    effectiveEntries: string;
    sourcePriority: string;
    priorityTitle: string;
    auditMode: string;
    running: string;
    runAudit: string;
    cancelAudit: string;
    rescanMemory: string;
    noAuditReport: string;
    currentClaims: string;
    staleClaims: string;
    uncertainClaims: string;
    conflicts: string;
    suggestedCorrections: string;
    draftCorrection: string;
    searchPlaceholder: string;
    openSource: string;
    noSourceMatches: string;
    noEntryMatches: string;
    staleCandidates: (count: number) => string;
    auditEntries: (count: number) => string;
    matchingSources: (count: number) => string;
    matchingEntries: (count: number) => string;
    riskFlags: (count: number) => string;
    openSourceAria: (path: string) => string;
  };
  inspector: {
    eyebrow: string;
    emptyTitle: string;
    emptyDescription: string;
    loadingExcerpt: string;
    source: string;
    excerpt: string;
    decisionPath: string;
    reviewReason: string;
    staleCandidates: string;
    draftCorrection: string;
    openSource: string;
  };
  dialog: {
    eyebrow: string;
    title: string;
    targetPath: string;
    content: string;
    cancel: string;
    writing: string;
    writeCorrection: string;
  };
  format: {
    evidence: (path: string, startLine: number, endLine: number) => string;
    lineRange: (startLine: number, endLine: number) => string;
    sourceMeta: (kind: string, lines: number, kb: number) => string;
  };
}

export const defaultLocale: Locale = "zh-CN";
export const localeStorageKey = "agent-memory-manager.locale";
export const localeOptions: ReadonlyArray<{ locale: Locale; label: string }> = [
  { locale: "zh-CN", label: "中文" },
  { locale: "en-US", label: "English" },
];

function profileGeneratorLabel(generator: string, locale: Locale) {
  if (generator.includes("codex")) {
    return "Codex";
  }
  if (generator.includes("fallback")) {
    return locale === "zh-CN" ? "规则 fallback" : "rule fallback";
  }
  return locale === "zh-CN" ? "规则" : "rules";
}

const zhCN: UiText = {
  app: {
    fixtureBanner: "演示模式：仅使用示例记忆",
    resizeSidebar: "调整侧栏宽度",
    resizeInspector: "调整依据栏宽度",
    scanning: "正在扫描 Codex 记忆...",
    correctionWritten: (path) => `修正笔记已写入：${path}`,
  },
  sidebar: {
    brandTitle: "Agent Memory",
    brandSubtitle: "本地记忆",
    defaultRoot: "正在扫描默认记忆根目录",
    languageLabel: "语言",
    sections: {
      memoryModel: "记忆模型",
      sources: "来源",
      review: "检查",
    },
  },
  views: {
    overview: "首页",
    effective: "记忆",
    summary: "已加载摘要",
    registry: "记忆注册表",
    corrections: "修正",
    sessions: "会话摘要",
    activity: "活动记录",
    raw: "原始记忆",
    skills: "技能",
    skillManager: "Skills",
    agentManager: "Agents",
    allSources: "全部来源",
    audit: "检查",
  },
  sourceKinds: {
    summary: "已加载摘要",
    registry: "注册表",
    raw: "原始记忆",
    rolloutSummary: "会话摘要",
    adHocNote: "修正",
    chronicle: "活动记录",
    skill: "技能",
  },
  truthStatuses: {
    current: "当前",
    stale: "过时",
    uncertain: "不确定",
    conflict: "冲突",
  },
  topics: {
    profile: "画像",
    projects: "项目",
    rules: "规则",
    tools: "工具",
    writing: "写作",
    activityLog: "活动",
    audit: "审计",
    overrides: "修正",
    sources: "来源",
    staleRisks: "冲突",
  },
  memoryCards: {
    profile: "关于你",
    projects: "项目",
    rules: "偏好",
    tools: "工具",
    writing: "创作",
    activityLog: "最近活动",
    audit: "检查",
    overrides: "关于你",
    sources: "其他",
    staleRisks: "需要确认",
  },
  riskKinds: {
    staleConflict: "过时冲突",
    coveredByOverride: "已由修正覆盖",
  },
  auditModes: {
    curated: "精简",
    full: "完整",
  },
  memorySummary: {
    eyebrow: "关于你",
    title: "Codex 目前这样理解你",
    wrong: "这不对",
    viewEvidence: "查看依据",
    evidence: "依据",
    loading: "正在生成记忆画像...",
    emptyTitle: "还没有足够的当前记忆生成画像",
    regenerate: "重新生成",
    cancelGeneration: "取消",
    generatedBy: (generator, count) =>
      `由 ${profileGeneratorLabel(generator, "zh-CN")} 基于 ${count} 条当前记忆生成`,
    matchingSections: (count) => `${count} 个匹配章节`,
    confidence: {
      high: "高可信",
      medium: "中可信",
      low: "低可信",
    },
    stability: {
      stable: "长期稳定",
      recent: "近期迹象",
      uncertain: "证据不足",
    },
    evidenceTrust: {
      current: "当前依据",
      stale: "历史依据",
      uncertain: "不确定",
      conflict: "需复核",
    },
    evidenceTrustNotes: {
      current: "当前记忆正在引用这条依据。",
      stale: "这条依据已被更新记忆覆盖，只作为历史背景。",
      uncertain: "这条依据更像近期线索，暂时不当作稳定记忆。",
      conflict: "这条依据和其他记忆存在冲突，需要复核。",
    },
  },
  skills: {
    eyebrow: "本机能力",
    title: "Skills",
    subtitle: "由 AMM 原生扫描本机与项目 Skill，不依赖外部管理器。",
    capabilities: "真实能力",
    discoveredCopies: "发现副本",
    duplicateGroups: "重复能力",
    invalidCopies: "异常副本",
    searchPlaceholder: "搜索能力、工具或路径...",
    allTools: "全部工具",
    refresh: "刷新",
    loading: "正在原生扫描 Skill...",
    empty: "没有匹配的能力。",
    readOnly: "当前只读扫描外部目录；AMM 不会复制、修改或删除这些 Skill。",
    tools: "可见工具",
    copyLocations: "发现位置",
    path: "本地路径",
    resolvedPath: "实际位置",
    reveal: "在 Finder 中显示",
    ready: "正常",
    invalid: "清单异常",
    globalScope: "全局",
    projectScope: "项目",
    directory: "真实目录",
    symlink: "软链接",
    snapshot: "AMM 清单快照",
    scanRoots: "扫描来源",
    noDescription: "暂无说明",
    copyCount: (count) => `${count} 份副本`,
  },
  agents: {
    eyebrow: "Agent 配置",
    title: "Agents",
    subtitle: "在一处管理 Codex、Claude Code 与 Hermes 的模型服务配置。",
    refresh: "刷新",
    addProfile: "添加配置",
    loading: "正在读取本机 Agent 配置...",
    installed: "已安装",
    notInstalled: "未检测到",
    currentConfig: "当前配置",
    currentModel: "当前模型",
    currentProvider: "当前服务",
    noProfiles: "还没有这个 Agent 的配置。",
    active: "正在使用",
    enable: "启用",
    enabling: "切换中...",
    edit: "编辑",
    delete: "删除",
    imported: "本机导入",
    managed: "AMM 管理",
    credentialStored: "凭据已保存",
    noCredential: "无托管凭据",
    official: "官方",
    custom: "自定义",
    profileName: "配置名称",
    providerKey: "Provider 标识",
    baseUrl: "Base URL",
    model: "模型",
    protocol: "协议",
    apiKey: "API Key",
    apiKeyHint: "留空则保留现有凭据。AMM 保存在系统凭据库；启用时按 Agent 原生格式写入其配置。",
    clearCredential: "清除已保存凭据",
    cancel: "取消",
    save: "保存",
    saving: "保存中...",
    createTitle: "添加 Agent 配置",
    editTitle: "编辑 Agent 配置",
    backupCreated: (path) => `原配置已备份：${path}`,
    switched: (agent) => `${agent} 已切换到新配置`,
    configPath: "原生配置",
    catalogPath: "AMM 配置目录",
  },
  board: {
    eyebrow: "记忆",
    scannedSources: "依据",
    effectiveEntries: "当前记忆",
    sourcePriority: "来源优先级",
    priorityTitle: "按来源与证据解析真实记忆",
    auditMode: "检查范围",
    running: "检查中...",
    runAudit: "开始检查",
    cancelAudit: "取消",
    rescanMemory: "重新扫描记忆",
    noAuditReport: "还没有检查结果",
    currentClaims: "当前",
    staleClaims: "历史",
    uncertainClaims: "不确定",
    conflicts: "冲突",
    suggestedCorrections: "建议修正",
    draftCorrection: "起草修正",
    searchPlaceholder: "搜索当前视图...",
    openSource: "打开来源",
    noSourceMatches: "没有匹配当前视图的来源。",
    noEntryMatches: "没有匹配当前视图的记忆条目。",
    staleCandidates: (count) => `${count} 条旧记忆被覆盖`,
    auditEntries: (count) => `${count} 条条目`,
    matchingSources: (count) => `${count} 个匹配来源`,
    matchingEntries: (count) => `${count} 条匹配记忆条目`,
    riskFlags: (count) => `${count} 条记忆需要复核。`,
    openSourceAria: (path) => `打开来源 ${path}`,
  },
  inspector: {
    eyebrow: "依据",
    emptyTitle: "依据",
    emptyDescription: "选择后显示",
    loadingExcerpt: "正在加载来源片段...",
    source: "来源",
    excerpt: "片段",
    decisionPath: "决策路径",
    reviewReason: "复核原因",
    staleCandidates: "被覆盖的旧记忆",
    draftCorrection: "起草修正",
    openSource: "打开来源",
  },
  dialog: {
    eyebrow: "安全写入预览",
    title: "修正笔记",
    targetPath: "目标路径",
    content: "内容",
    cancel: "取消",
    writing: "写入中...",
    writeCorrection: "写入修正笔记",
  },
  format: {
    evidence: (path, startLine, endLine) => `${path} 第 ${startLine}-${endLine} 行`,
    lineRange: (startLine, endLine) => `第 ${startLine}-${endLine} 行`,
    sourceMeta: (kind, lines, kb) => `${kind} · ${lines} 行 · ${kb} KB`,
  },
};

const enUS: UiText = {
  app: {
    fixtureBanner: "Fixture mode: demo memory only",
    resizeSidebar: "Resize sidebar",
    resizeInspector: "Resize evidence pane",
    scanning: "Scanning Codex memory...",
    correctionWritten: (path) => `Correction note written: ${path}`,
  },
  sidebar: {
    brandTitle: "Agent Memory",
    brandSubtitle: "Local memory",
    defaultRoot: "Scanning default memory root",
    languageLabel: "Language",
    sections: {
      memoryModel: "Memory Model",
      sources: "Sources",
      review: "Review",
    },
  },
  views: {
    overview: "Home",
    effective: "Memory",
    summary: "Loaded Summary",
    registry: "Memory Registry",
    corrections: "Corrections",
    sessions: "Session Summaries",
    activity: "Activity Records",
    raw: "Raw Memory",
    skills: "Skills",
    skillManager: "Skills",
    agentManager: "Agents",
    allSources: "All Sources",
    audit: "Check",
  },
  sourceKinds: {
    summary: "Loaded Summary",
    registry: "Registry",
    raw: "Raw Memory",
    rolloutSummary: "Session Summary",
    adHocNote: "Correction",
    chronicle: "Activity Record",
    skill: "Skill",
  },
  truthStatuses: {
    current: "Current",
    stale: "Stale",
    uncertain: "Uncertain",
    conflict: "Conflict",
  },
  topics: {
    profile: "Profile",
    projects: "Project",
    rules: "Rule",
    tools: "Tool",
    writing: "Writing",
    activityLog: "Activity",
    audit: "Audit",
    overrides: "Correction",
    sources: "Source",
    staleRisks: "Conflict",
  },
  memoryCards: {
    profile: "About you",
    projects: "Projects",
    rules: "Preferences",
    tools: "Tools",
    writing: "Writing",
    activityLog: "Recent activity",
    audit: "Check",
    overrides: "About you",
    sources: "Other",
    staleRisks: "Needs attention",
  },
  riskKinds: {
    staleConflict: "Stale conflict",
    coveredByOverride: "Covered by correction",
  },
  auditModes: {
    curated: "Focused",
    full: "Full",
  },
  memorySummary: {
    eyebrow: "About you",
    title: "How Codex currently understands you",
    wrong: "This is wrong",
    viewEvidence: "View evidence",
    evidence: "Evidence",
    loading: "Generating memory profile...",
    emptyTitle: "Not enough current memory to generate a profile yet",
    regenerate: "Regenerate",
    cancelGeneration: "Cancel",
    generatedBy: (generator, count) =>
      `Generated by ${profileGeneratorLabel(generator, "en-US")} from ${count} current memories`,
    matchingSections: (count) => `${count} matching sections`,
    confidence: {
      high: "High confidence",
      medium: "Medium confidence",
      low: "Low confidence",
    },
    stability: {
      stable: "Stable",
      recent: "Recent",
      uncertain: "Uncertain",
    },
    evidenceTrust: {
      current: "Current evidence",
      stale: "Historical evidence",
      uncertain: "Uncertain",
      conflict: "Needs review",
    },
    evidenceTrustNotes: {
      current: "This evidence is used by current memory.",
      stale: "This evidence has been displaced by newer memory and is historical context.",
      uncertain: "This evidence is useful context, but not stable memory yet.",
      conflict: "This evidence conflicts with another memory and needs review.",
    },
  },
  skills: {
    eyebrow: "Local capabilities",
    title: "Skills",
    subtitle: "Scanned natively by AMM across local and project roots, with no external manager dependency.",
    capabilities: "Capabilities",
    discoveredCopies: "Discovered copies",
    duplicateGroups: "Duplicate groups",
    invalidCopies: "Invalid copies",
    searchPlaceholder: "Search capabilities, tools, or paths...",
    allTools: "All tools",
    refresh: "Refresh",
    loading: "Scanning Skills natively...",
    empty: "No matching capabilities.",
    readOnly: "External roots are scanned read-only; AMM does not copy, edit, or delete these Skills.",
    tools: "Visible tools",
    copyLocations: "Discovered locations",
    path: "Local path",
    resolvedPath: "Resolved path",
    reveal: "Reveal in Finder",
    ready: "Ready",
    invalid: "Invalid manifest",
    globalScope: "Global",
    projectScope: "Project",
    directory: "Directory",
    symlink: "Symlink",
    snapshot: "AMM inventory snapshot",
    scanRoots: "Scan roots",
    noDescription: "No description",
    copyCount: (count) => `${count} copies`,
  },
  agents: {
    eyebrow: "Agent configuration",
    title: "Agents",
    subtitle: "Manage provider and model profiles for Codex, Claude Code, and Hermes in one place.",
    refresh: "Refresh",
    addProfile: "Add profile",
    loading: "Reading local Agent configurations...",
    installed: "Installed",
    notInstalled: "Not detected",
    currentConfig: "Current config",
    currentModel: "Current model",
    currentProvider: "Current provider",
    noProfiles: "No profiles for this Agent yet.",
    active: "Active",
    enable: "Enable",
    enabling: "Switching...",
    edit: "Edit",
    delete: "Delete",
    imported: "Imported",
    managed: "AMM managed",
    credentialStored: "Credential stored",
    noCredential: "No managed credential",
    official: "Official",
    custom: "Custom",
    profileName: "Profile name",
    providerKey: "Provider key",
    baseUrl: "Base URL",
    model: "Model",
    protocol: "Protocol",
    apiKey: "API key",
    apiKeyHint: "Leave blank to keep the existing credential. AMM stores it in the system credential vault and materializes it only when the Agent's native format requires it.",
    clearCredential: "Clear stored credential",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    createTitle: "Add Agent profile",
    editTitle: "Edit Agent profile",
    backupCreated: (path) => `Previous config backed up to: ${path}`,
    switched: (agent) => `${agent} switched to the new profile`,
    configPath: "Native config",
    catalogPath: "AMM profile catalog",
  },
  board: {
    eyebrow: "Memory",
    scannedSources: "Evidence",
    effectiveEntries: "Current memory",
    sourcePriority: "Source Priority",
    priorityTitle: "Truth is resolved by source, then evidence",
    auditMode: "Check scope",
    running: "Checking...",
    runAudit: "Start check",
    cancelAudit: "Cancel",
    rescanMemory: "Rescan memory",
    noAuditReport: "No check result yet",
    currentClaims: "Current",
    staleClaims: "History",
    uncertainClaims: "Uncertain",
    conflicts: "Conflicts",
    suggestedCorrections: "Suggested Corrections",
    draftCorrection: "Draft correction",
    searchPlaceholder: "Search current view...",
    openSource: "Open source",
    noSourceMatches: "No sources match this view.",
    noEntryMatches: "No memory entries match this view.",
    staleCandidates: (count) => `${count} stale memories displaced`,
    auditEntries: (count) => `${count} entries`,
    matchingSources: (count) => `${count} matching sources`,
    matchingEntries: (count) => `${count} matching memory entries`,
    riskFlags: (count) => `${count} memories need review.`,
    openSourceAria: (path) => `Open source ${path}`,
  },
  inspector: {
    eyebrow: "Evidence",
    emptyTitle: "Evidence",
    emptyDescription: "Shown after selection",
    loadingExcerpt: "Loading source excerpt...",
    source: "Source",
    excerpt: "Excerpt",
    decisionPath: "Decision Path",
    reviewReason: "Review Reason",
    staleCandidates: "Displaced Stale Memories",
    draftCorrection: "Draft correction",
    openSource: "Open source",
  },
  dialog: {
    eyebrow: "Safe write preview",
    title: "Correction note",
    targetPath: "Target path",
    content: "Content",
    cancel: "Cancel",
    writing: "Writing...",
    writeCorrection: "Write correction note",
  },
  format: {
    evidence: (path, startLine, endLine) => `${path} L${startLine}-${endLine}`,
    lineRange: (startLine, endLine) => `L${startLine}-${endLine}`,
    sourceMeta: (kind, lines, kb) => `${kind} · ${lines} lines · ${kb} KB`,
  },
};

const dictionaries: Record<Locale, UiText> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

export function isLocale(value: string | null): value is Locale {
  return value === "zh-CN" || value === "en-US";
}

export function getUiText(locale: Locale) {
  return dictionaries[locale];
}

export function readStoredLocale() {
  try {
    const stored = window.localStorage.getItem(localeStorageKey);
    return isLocale(stored) ? stored : defaultLocale;
  } catch {
    return defaultLocale;
  }
}

export function writeStoredLocale(locale: Locale) {
  try {
    window.localStorage.setItem(localeStorageKey, locale);
  } catch {
    // Ignore storage failures; runtime state still updates.
  }
}
