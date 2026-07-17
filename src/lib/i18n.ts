import type { MemoryView } from "./memoryViews";
import type { MemoryTruthStatus } from "./memoryTruth";
import type { MemorySourceKind, MemoryTopic, RiskKind } from "./types";

export type Locale = "zh-CN" | "en-US";

export interface UiText {
  app: {
    fixtureBanner: string;
    resizeSidebar: string;
    resizeInspector: string;
    scanning: (agent: string) => string;
    correctionWritten: (path: string) => string;
  };
  sidebar: {
    agentMenuLabel: string;
    currentAgent: string;
    manageAgent: string;
    settings: string;
    updateAvailable: string;
    languageLabel: string;
  };
  views: Record<MemoryView, string>;
  sourceKinds: Record<MemorySourceKind, string>;
  truthStatuses: Record<MemoryTruthStatus, string>;
  topics: Record<MemoryTopic, string>;
  memoryCards: Record<MemoryTopic, string>;
  riskKinds: Record<RiskKind, string>;
  memorySummary: {
    eyebrow: string;
    title: (agent: string) => string;
    description: (agent: string) => string;
    wrong: string;
    viewEvidence: (count: number) => string;
    loading: string;
    emptyTitle: string;
    emptyDescription: string;
    readyTitle: string;
    readyDescription: string;
    updateProfile: string;
    cancelGeneration: string;
    generatingFirst: string;
    updatingWithPrevious: string;
    stale: string;
    failedWithPrevious: string;
    failedWithoutProfile: string;
    errorDetails: string;
    generatedAt: (date: string, count: number) => string;
    confidence: Record<"high" | "medium" | "low", string>;
    stability: Record<"stable" | "recent" | "uncertain", string>;
    evidenceTrust: Record<"current" | "stale" | "uncertain" | "conflict", string>;
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
    categoryFilter: string;
    allCategories: string;
    namespaceNames: Record<string, string>;
    refresh: string;
    loading: string;
    empty: string;
    readOnly: string;
    tools: string;
    copyLocations: string;
    path: string;
    resolvedPath: string;
    reveal: string;
    invalid: string;
    globalScope: string;
    projectScope: string;
    directory: string;
    symlink: string;
    snapshot: string;
    scanRoots: string;
    noDescription: string;
    backToAll: string;
    documentation: string;
    noDocumentation: string;
    editDocumentation: string;
    editCopy: string;
    sourceEditor: string;
    cancelEdit: string;
    saveChanges: string;
    savingChanges: string;
    savedChanges: string;
    saveFailed: (error: string) => string;
    openDetails: (name: string) => string;
    copyCount: (count: number) => string;
    usageCount: (count: number) => string;
    usageSummary: (count: number, lastUsed: string, agents: string) => string;
    todayAt: (time: string) => string;
    noUsage: string;
  };
  mcp: {
    eyebrow: string;
    title: string;
    subtitle: string;
    refresh: string;
    loading: string;
    empty: string;
    readOnly: string;
    serverCount: string;
    enabled: string;
    disabled: string;
    globalScope: string;
    projectScope: string;
    configSources: string;
    transports: Record<"stdio" | "http" | "sse" | "unknown", string>;
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
  settings: {
    eyebrow: string;
    title: string;
    subtitle: string;
    language: string;
    languageHint: string;
    appUpdate: string;
    appUpdateHint: string;
    currentVersion: string;
    unknownVersion: string;
    autoCheck: string;
    autoCheckHint: string;
    desktopOnly: string;
    check: string;
    checking: string;
    upToDate: string;
    available: (version: string) => string;
    downloading: (progress: number | null) => string;
    downloaded: string;
    download: string;
    restartAndInstall: string;
    installing: string;
    error: string;
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
    revertChange: string;
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
export const localeStorageKey = "agent-backplane.locale";
export const localeOptions: ReadonlyArray<{ locale: Locale; label: string }> = [
  { locale: "zh-CN", label: "中文" },
  { locale: "en-US", label: "English" },
];

const zhCN: UiText = {
  app: {
    fixtureBanner: "演示模式：仅使用示例记忆",
    resizeSidebar: "调整侧栏宽度",
    resizeInspector: "调整依据栏宽度",
    scanning: (agent) => `正在扫描 ${agent} 记忆...`,
    correctionWritten: (path) => `修正笔记已写入：${path}`,
  },
  sidebar: {
    agentMenuLabel: "切换当前 Agent",
    currentAgent: "当前 Agent",
    manageAgent: "管理当前 Agent 配置",
    settings: "设置",
    updateAvailable: "可更新",
    languageLabel: "语言",
  },
  views: {
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
    mcpManager: "MCP",
    settings: "设置",
    allSources: "全部来源",
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
    overrides: "关于你",
    sources: "其他",
    staleRisks: "需要确认",
  },
  riskKinds: {
    staleConflict: "过时冲突",
    coveredByOverride: "已由修正覆盖",
  },
  memorySummary: {
    eyebrow: "记忆画像",
    title: (agent) => `${agent} 记住的你`,
    description: (agent) =>
      `由本机 Codex CLI 根据 ${agent} 的记忆整理。打开时保留上次结果，新记忆会在后台更新。`,
    wrong: "这不对",
    viewEvidence: (count) => `查看依据 ${count}`,
    loading: "正在读取上次记忆画像...",
    emptyTitle: "还没有可整理的记忆",
    emptyDescription: "当当前 Agent 产生本地记忆后，这里会自动整理成画像。",
    readyTitle: "可以开始整理记忆了",
    readyDescription: "画像会在后台生成，完成后自动显示。",
    updateProfile: "更新画像",
    cancelGeneration: "取消更新",
    generatingFirst: "正在生成第一份画像，完成后会自动显示。",
    updatingWithPrevious: "发现新记忆，正在后台更新。当前显示上次结果。",
    stale: "发现新记忆，当前显示上次结果。",
    failedWithPrevious: "更新失败，继续显示上次结果。",
    failedWithoutProfile: "画像生成失败，可以再次更新。",
    errorDetails: "查看错误",
    generatedAt: (date, count) => `上次更新 ${date} · 基于 ${count} 条当前记忆`,
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
  },
  skills: {
    eyebrow: "本机能力",
    title: "Skills",
    subtitle: "由 Backplane 原生扫描本机与项目 Skill，不依赖外部管理器。",
    capabilities: "真实能力",
    discoveredCopies: "发现副本",
    duplicateGroups: "重复能力",
    invalidCopies: "异常副本",
    searchPlaceholder: "搜索能力、工具或路径...",
    allTools: "全部工具",
    categoryFilter: "分类",
    allCategories: "全部",
    namespaceNames: {
      lark: "飞书",
      github: "GitHub",
      openai: "OpenAI",
      notion: "Notion",
      slack: "Slack",
      gmail: "Gmail",
      google: "Google",
    },
    refresh: "刷新",
    loading: "正在原生扫描 Skill...",
    empty: "没有匹配的能力。",
    readOnly: "Backplane 扫描外部目录，并允许你明确选择一份副本进行编辑；不会自动复制或删除 Skill。",
    tools: "可见工具",
    copyLocations: "发现位置",
    path: "本地路径",
    resolvedPath: "实际位置",
    reveal: "在 Finder 中显示",
    invalid: "清单异常",
    globalScope: "全局",
    projectScope: "项目",
    directory: "真实目录",
    symlink: "软链接",
    snapshot: "Backplane 清单快照",
    scanRoots: "扫描来源",
    noDescription: "暂无说明",
    backToAll: "返回全部 Skills",
    documentation: "Skill 文档",
    noDocumentation: "这个 Skill 暂无可显示的 Markdown 内容。",
    editDocumentation: "编辑",
    editCopy: "编辑副本",
    sourceEditor: "SKILL.md 内容",
    cancelEdit: "取消",
    saveChanges: "保存",
    savingChanges: "保存中...",
    savedChanges: "已保存到所选 SKILL.md。",
    saveFailed: (error) => `保存失败：${error}`,
    openDetails: (name) => `查看 ${name} 详情`,
    copyCount: (count) => `${count} 份副本`,
    usageCount: (count) => `使用 ${count} 次`,
    usageSummary: (count, lastUsed, agents) =>
      `使用 ${count} 次 · 最近使用于 ${lastUsed} · ${agents}`,
    todayAt: (time) => `今天 ${time}`,
    noUsage: "暂无使用记录",
  },
  mcp: {
    eyebrow: "工具连接",
    title: "MCP",
    subtitle: "只读取当前 Agent 的原生 MCP 配置，不显示参数、环境变量或凭据。",
    refresh: "刷新",
    loading: "正在读取 MCP 配置...",
    empty: "当前 Agent 还没有配置 MCP Server。",
    readOnly: "只读发现：Backplane 不会修改 Agent 的 MCP 配置。",
    serverCount: "已配置服务",
    enabled: "已启用",
    disabled: "已停用",
    globalScope: "全局",
    projectScope: "项目",
    configSources: "配置来源",
    transports: {
      stdio: "本地进程",
      http: "HTTP",
      sse: "SSE",
      unknown: "未知传输",
    },
  },
  agents: {
    eyebrow: "Agent 配置",
    title: "配置",
    subtitle: "管理当前 Agent 的模型服务与模型配置。",
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
    managed: "Backplane 管理",
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
    apiKeyHint: "留空则保留现有凭据。Backplane 保存在系统凭据库；启用时按 Agent 原生格式写入其配置。",
    clearCredential: "清除已保存凭据",
    cancel: "取消",
    save: "保存",
    saving: "保存中...",
    createTitle: "添加 Agent 配置",
    editTitle: "编辑 Agent 配置",
    backupCreated: (path) => `原配置已备份：${path}`,
    switched: (agent) => `${agent} 已切换到新配置`,
    configPath: "原生配置",
    catalogPath: "Backplane 配置目录",
  },
  settings: {
    eyebrow: "应用设置",
    title: "设置",
    subtitle: "管理 Agent Backplane 的全局行为。",
    language: "界面语言",
    languageHint: "选择 Agent Backplane 的显示语言。",
    appUpdate: "应用更新",
    appUpdateHint: "检查 GitHub Releases，并在应用内下载、安装新版本。",
    currentVersion: "当前版本",
    unknownVersion: "仅桌面版可读取",
    autoCheck: "启动时自动检查",
    autoCheckHint: "只检查，不会自动下载或安装。",
    desktopOnly: "更新检查仅在安装后的桌面应用中可用。",
    check: "检查更新",
    checking: "正在检查更新...",
    upToDate: "当前已是最新版本。",
    available: (version) => `发现新版本 v${version}`,
    downloading: (progress) =>
      progress === null ? "正在下载安装包..." : `正在下载安装包... ${progress}%`,
    downloaded: "更新已下载，重启后完成安装。",
    download: "下载更新",
    restartAndInstall: "重启并安装",
    installing: "正在重启并安装...",
    error: "更新失败",
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
    revertChange: "撤销这条修正",
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
    scanning: (agent) => `Scanning ${agent} memory...`,
    correctionWritten: (path) => `Correction note written: ${path}`,
  },
  sidebar: {
    agentMenuLabel: "Switch current Agent",
    currentAgent: "Current Agent",
    manageAgent: "Manage current Agent",
    settings: "Settings",
    updateAvailable: "Update",
    languageLabel: "Language",
  },
  views: {
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
    mcpManager: "MCP",
    settings: "Settings",
    allSources: "All Sources",
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
    overrides: "About you",
    sources: "Other",
    staleRisks: "Needs attention",
  },
  riskKinds: {
    staleConflict: "Stale conflict",
    coveredByOverride: "Covered by correction",
  },
  memorySummary: {
    eyebrow: "Memory profile",
    title: (agent) => `What ${agent} remembers about you`,
    description: (agent) =>
      `The local Codex CLI organizes this profile from ${agent}'s memory. The last result stays visible while new memory updates in the background.`,
    wrong: "This is wrong",
    viewEvidence: (count) => `View evidence ${count}`,
    loading: "Loading the last memory profile...",
    emptyTitle: "No memory to organize yet",
    emptyDescription: "A profile will appear after the current Agent creates local memory.",
    readyTitle: "Memory is ready to organize",
    readyDescription: "The profile will be generated in the background and appear automatically.",
    updateProfile: "Update profile",
    cancelGeneration: "Cancel update",
    generatingFirst: "Generating the first profile. It will appear automatically when ready.",
    updatingWithPrevious: "New memory found. Updating in the background while showing the last result.",
    stale: "New memory found. The last result is still shown.",
    failedWithPrevious: "Update failed. The last result remains visible.",
    failedWithoutProfile: "Profile generation failed. You can try again.",
    errorDetails: "View error",
    generatedAt: (date, count) => `Last updated ${date} · Based on ${count} current memories`,
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
  },
  skills: {
    eyebrow: "Local capabilities",
    title: "Skills",
    subtitle: "Scanned natively by Backplane across local and project roots, with no external manager dependency.",
    capabilities: "Capabilities",
    discoveredCopies: "Discovered copies",
    duplicateGroups: "Duplicate groups",
    invalidCopies: "Invalid copies",
    searchPlaceholder: "Search capabilities, tools, or paths...",
    allTools: "All tools",
    categoryFilter: "Categories",
    allCategories: "All",
    namespaceNames: {
      lark: "Lark",
      github: "GitHub",
      openai: "OpenAI",
      notion: "Notion",
      slack: "Slack",
      gmail: "Gmail",
      google: "Google",
    },
    refresh: "Refresh",
    loading: "Scanning Skills natively...",
    empty: "No matching capabilities.",
    readOnly: "Backplane scans external roots and lets you explicitly edit one selected copy; it never copies or deletes Skills automatically.",
    tools: "Visible tools",
    copyLocations: "Discovered locations",
    path: "Local path",
    resolvedPath: "Resolved path",
    reveal: "Reveal in Finder",
    invalid: "Invalid manifest",
    globalScope: "Global",
    projectScope: "Project",
    directory: "Directory",
    symlink: "Symlink",
    snapshot: "Backplane inventory snapshot",
    scanRoots: "Scan roots",
    noDescription: "No description",
    backToAll: "Back to all Skills",
    documentation: "Skill documentation",
    noDocumentation: "This Skill has no Markdown content to display.",
    editDocumentation: "Edit",
    editCopy: "Copy to edit",
    sourceEditor: "SKILL.md content",
    cancelEdit: "Cancel",
    saveChanges: "Save",
    savingChanges: "Saving...",
    savedChanges: "Saved to the selected SKILL.md.",
    saveFailed: (error) => `Save failed: ${error}`,
    openDetails: (name) => `View ${name} details`,
    copyCount: (count) => `${count} copies`,
    usageCount: (count) => `Used ${count} times`,
    usageSummary: (count, lastUsed, agents) =>
      `Used ${count} times · Last used ${lastUsed} · ${agents}`,
    todayAt: (time) => `Today ${time}`,
    noUsage: "No usage recorded",
  },
  mcp: {
    eyebrow: "Tool connections",
    title: "MCP",
    subtitle: "Reads only the current Agent's native MCP configuration without exposing arguments, environment values, or credentials.",
    refresh: "Refresh",
    loading: "Reading MCP configuration...",
    empty: "No MCP servers are configured for this Agent.",
    readOnly: "Read-only discovery: Backplane does not change the Agent's MCP configuration.",
    serverCount: "Configured servers",
    enabled: "Enabled",
    disabled: "Disabled",
    globalScope: "Global",
    projectScope: "Project",
    configSources: "Configuration sources",
    transports: {
      stdio: "Local process",
      http: "HTTP",
      sse: "SSE",
      unknown: "Unknown transport",
    },
  },
  agents: {
    eyebrow: "Agent configuration",
    title: "Configuration",
    subtitle: "Manage provider and model profiles for the current Agent.",
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
    managed: "Backplane managed",
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
    apiKeyHint: "Leave blank to keep the existing credential. Backplane stores it in the system credential vault and materializes it only when the Agent's native format requires it.",
    clearCredential: "Clear stored credential",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving...",
    createTitle: "Add Agent profile",
    editTitle: "Edit Agent profile",
    backupCreated: (path) => `Previous config backed up to: ${path}`,
    switched: (agent) => `${agent} switched to the new profile`,
    configPath: "Native config",
    catalogPath: "Backplane profile catalog",
  },
  settings: {
    eyebrow: "Application settings",
    title: "Settings",
    subtitle: "Manage global Agent Backplane behavior.",
    language: "Interface language",
    languageHint: "Choose the display language for Agent Backplane.",
    appUpdate: "Application update",
    appUpdateHint: "Check GitHub Releases, then download and install updates in the app.",
    currentVersion: "Current version",
    unknownVersion: "Available in the desktop app",
    autoCheck: "Automatically check on startup",
    autoCheckHint: "Checks only; downloads and installation always require confirmation.",
    desktopOnly: "Update checks are available only in the installed desktop app.",
    check: "Check for updates",
    checking: "Checking for updates...",
    upToDate: "You are using the latest version.",
    available: (version) => `Version ${version} is available`,
    downloading: (progress) =>
      progress === null ? "Downloading update..." : `Downloading update... ${progress}%`,
    downloaded: "The update is downloaded and ready to install after restart.",
    download: "Download update",
    restartAndInstall: "Restart and install",
    installing: "Restarting to install...",
    error: "Update failed",
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
    revertChange: "Revert this change",
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
