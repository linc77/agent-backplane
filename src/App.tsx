import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelMemoryProfileGeneration,
  draftCorrection,
  getMemoryProfileGeneration,
  isFixtureMode,
  loadAgentMemorySnapshot,
  openSourceFile,
  startMemoryProfileGeneration,
  writeCorrection,
} from "./lib/api";
import {
  clampPaneLayout,
  DEFAULT_PANE_LAYOUT,
  paneGridTemplate,
  resizePaneLayout,
  type PaneLayout,
} from "./lib/paneLayout";
import {
  getUiText,
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from "./lib/i18n";
import { resolveMemoryTruth } from "./lib/memoryTruth";
import type { MemoryView } from "./lib/memoryViews";
import { readStoredAgent, writeStoredAgent } from "./lib/agentScope";
import type {
  AgentKind,
  AgentMemorySnapshot,
  CorrectionDraft,
  MemoryChangeTarget,
  MemoryEntry,
  MemoryProfileGenerationTask,
  MemoryProfileLocale,
  MemoryProfileSection,
} from "./lib/types";
import { CorrectionDialog } from "./components/CorrectionDialog";
import { AgentConfigManager } from "./components/AgentConfigManager";
import { KnowledgeBoard } from "./components/KnowledgeBoard";
import { McpManager } from "./components/McpManager";
import { Sidebar } from "./components/Sidebar";
import { SkillManager } from "./components/SkillManager";
import { SettingsPage } from "./components/SettingsPage";
import { useAppUpdater } from "./hooks/useAppUpdater";
import "./App.css";

function targetsForEvidence(
  entries: MemoryEntry[],
  evidence: Array<{ sourcePath: string; startLine: number; endLine: number }>,
) {
  const targets = new Map<string, MemoryChangeTarget>();
  for (const item of evidence) {
    for (const entry of entries) {
      if (
        entry.sourcePath === item.sourcePath &&
        entry.startLine <= item.endLine &&
        item.startLine <= entry.endLine
      ) {
        targets.set(entry.id, { entryId: entry.id, sourcePath: entry.sourcePath });
      }
    }
  }
  return [...targets.values()];
}

function App() {
  const queryClient = useQueryClient();
  const fixtureMode = isFixtureMode();
  const nativeUpdaterEnabled = !fixtureMode && Boolean(window.backplane);
  const appUpdater = useAppUpdater({ enabled: nativeUpdaterEnabled });
  const [locale, setLocale] = useState<Locale>(() => readStoredLocale());
  const uiText = useMemo(() => getUiText(locale), [locale]);
  const [selectedAgent, setSelectedAgent] = useState<AgentKind>(() => readStoredAgent());
  const [activeTopic, setActiveTopic] = useState<MemoryView>("effective");
  const [draft, setDraft] = useState<CorrectionDraft | null>(null);
  const [lastWritePath, setLastWritePath] = useState<string | null>(null);
  const [profileGenerationTask, setProfileGenerationTask] =
    useState<MemoryProfileGenerationTask | null>(null);
  const [paneLayout, setPaneLayout] = useState(() =>
    clampPaneLayout(DEFAULT_PANE_LAYOUT, window.innerWidth),
  );
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const selectedAgentRef = useRef(selectedAgent);
  const localeRef = useRef<MemoryProfileLocale>(locale);
  const generationAttemptsRef = useRef(new Set<string>());
  const settledTaskRef = useRef<string | null>(null);
  const dragRef = useRef<{
    startX: number;
    startLayout: PaneLayout;
    viewportWidth: number;
  } | null>(null);
  selectedAgentRef.current = selectedAgent;
  localeRef.current = locale;

  const agentMemoryQuery = useQuery({
    queryKey: ["agent-memory", selectedAgent, locale],
    queryFn: () => loadAgentMemorySnapshot(selectedAgent, locale),
  });
  const snapshot = agentMemoryQuery.data;
  const scan = snapshot?.scan;
  const profile = snapshot?.profile;
  const currentMemoryCount = useMemo(
    () => resolveMemoryTruth(scan).current.length,
    [scan],
  );
  const writable = Boolean(snapshot?.writable);

  function applyProfileTask(task: MemoryProfileGenerationTask) {
    setProfileGenerationTask(task);
    if (task.profile && task.agent && task.locale) {
      queryClient.setQueryData<AgentMemorySnapshot>(
        ["agent-memory", task.agent, task.locale],
        (current) =>
          current
            ? {
                ...current,
                profile: task.profile,
                profileStale: false,
                sourceHash: task.profile!.sourceHash,
              }
            : current,
      );
    }
    if (
      task.id &&
      task.status === "succeeded" &&
      task.agent &&
      task.locale &&
      settledTaskRef.current !== task.id
    ) {
      settledTaskRef.current = task.id;
      void queryClient.invalidateQueries({
        queryKey: ["agent-memory", task.agent, task.locale],
      });
    }
  }

  const startProfileGenerationMutation = useMutation({
    mutationFn: ({ agent, locale: profileLocale }: {
      agent: AgentKind;
      locale: MemoryProfileLocale;
    }) => startMemoryProfileGeneration(agent, profileLocale),
    onSuccess: applyProfileTask,
  });

  const cancelProfileGenerationMutation = useMutation({
    mutationFn: () => cancelMemoryProfileGeneration(),
    onSuccess: applyProfileTask,
  });

  const profileCorrectionMutation = useMutation({
    mutationFn: (section: MemoryProfileSection) =>
      draftCorrection(
        selectedAgentRef.current,
        null,
        `memory-profile-${section.id}`,
        [
          `Review and update memory profile section "${section.title}": ${section.body}`,
          ...section.evidence.map(
            (evidence) =>
              `Evidence ${evidence.sourcePath} lines ${evidence.startLine}-${evidence.endLine}: ${evidence.summary}`,
          ),
        ],
        targetsForEvidence(scan?.entries ?? [], section.evidence),
      ),
    onSuccess: setDraft,
  });

  const writeMutation = useMutation({
    mutationFn: (nextDraft: CorrectionDraft) => writeCorrection(null, nextDraft),
    onSuccess: async (result) => {
      await agentMemoryQuery.refetch();
      setDraft(null);
      setLastWritePath(result.path);
      setActiveTopic("effective");
      setProfileGenerationTask(null);
    },
  });

  const openSourceMutation = useMutation({
    mutationFn: (path: string) => openSourceFile(path),
  });

  useEffect(() => {
    if (
      profileGenerationTask?.status !== "running" &&
      profileGenerationTask?.status !== "cancelling"
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      void getMemoryProfileGeneration()
        .then(applyProfileTask)
        .catch((error) => {
          setProfileGenerationTask({
            id: profileGenerationTask.id,
            agent: profileGenerationTask.agent,
            locale: profileGenerationTask.locale,
            status: "failed",
            startedAt: profileGenerationTask.startedAt,
            finishedAt: new Date().toISOString(),
            error: String(error),
            profile: null,
          });
        });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [profileGenerationTask?.id, profileGenerationTask?.status]);

  useEffect(() => {
    if (
      !snapshot ||
      currentMemoryCount === 0 ||
      (!snapshot.profileStale && snapshot.profile) ||
      startProfileGenerationMutation.isPending ||
      profileGenerationTask?.status === "running" ||
      profileGenerationTask?.status === "cancelling"
    ) {
      return;
    }
    const key = `${selectedAgent}:${locale}:${snapshot.sourceHash}`;
    if (generationAttemptsRef.current.has(key)) return;
    generationAttemptsRef.current.add(key);
    startProfileGenerationMutation.mutate({ agent: selectedAgent, locale });
  }, [
    currentMemoryCount,
    locale,
    profileGenerationTask?.status,
    selectedAgent,
    snapshot,
    startProfileGenerationMutation.isPending,
  ]);

  useEffect(() => {
    const handleResize = () =>
      setPaneLayout((layout) => clampPaneLayout(layout, window.innerWidth));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const taskMatchesSelection =
    profileGenerationTask?.agent === selectedAgent &&
    profileGenerationTask?.locale === locale;
  const pendingVariables = startProfileGenerationMutation.variables;
  const isProfileRegenerating =
    (startProfileGenerationMutation.isPending &&
      pendingVariables?.agent === selectedAgent &&
      pendingVariables.locale === locale) ||
    (taskMatchesSelection &&
      (profileGenerationTask?.status === "running" ||
        profileGenerationTask?.status === "cancelling"));
  const profileGenerationError =
    (taskMatchesSelection && profileGenerationTask?.status === "failed"
      ? profileGenerationTask.error
      : null) ??
    startProfileGenerationMutation.error ??
    cancelProfileGenerationMutation.error;

  function regenerateProfile() {
    if (!snapshot) return;
    const key = `${selectedAgent}:${locale}:${snapshot.sourceHash}`;
    generationAttemptsRef.current.delete(key);
    generationAttemptsRef.current.add(key);
    settledTaskRef.current = null;
    setProfileGenerationTask(null);
    startProfileGenerationMutation.reset();
    startProfileGenerationMutation.mutate({ agent: selectedAgent, locale });
  }

  function cancelProfileGeneration() {
    cancelProfileGenerationMutation.mutate();
  }

  function changeLocale(nextLocale: Locale) {
    if (nextLocale === locale) return;
    if (isProfileRegenerating) cancelProfileGenerationMutation.mutate();
    setLocale(nextLocale);
    writeStoredLocale(nextLocale);
    setDraft(null);
    setLastWritePath(null);
    setProfileGenerationTask(null);
  }

  function changeAgent(nextAgent: AgentKind) {
    if (nextAgent === selectedAgent) return;
    if (isProfileRegenerating) cancelProfileGenerationMutation.mutate();
    setSelectedAgent(nextAgent);
    writeStoredAgent(nextAgent);
    setDraft(null);
    setLastWritePath(null);
    setProfileGenerationTask(null);
    profileCorrectionMutation.reset();
    writeMutation.reset();
  }

  function startPaneResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      startX: event.clientX,
      startLayout: paneLayout,
      viewportWidth: window.innerWidth,
    };
    setIsResizingSidebar(true);
  }

  function movePaneResize(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    setPaneLayout(
      resizePaneLayout(
        drag.startLayout,
        "left",
        event.clientX - drag.startX,
        drag.viewportWidth,
      ),
    );
  }

  function stopPaneResize() {
    dragRef.current = null;
    setIsResizingSidebar(false);
  }

  function nudgePaneResize(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const deltaX = event.key === "ArrowLeft" ? -step : step;
    setPaneLayout((layout) => resizePaneLayout(layout, "left", deltaX, window.innerWidth));
  }

  const pageMode =
    activeTopic === "skillManager"
      ? "skills-mode"
      : activeTopic === "agentManager"
        ? "agent-mode"
        : activeTopic === "mcpManager"
          ? "mcp-mode"
          : activeTopic === "settings"
            ? "settings-mode"
            : "memory-mode";

  return (
    <div
      className={`app-shell ${pageMode}${isResizingSidebar ? " resizing" : ""}`}
      style={{ gridTemplateColumns: paneGridTemplate(paneLayout) }}
    >
      {fixtureMode && <div className="fixture-banner">{uiText.app.fixtureBanner}</div>}
      <Sidebar
        activeTopic={activeTopic}
        selectedAgent={selectedAgent}
        uiText={uiText}
        onManageAgent={() => setActiveTopic("agentManager")}
        onOpenSettings={() => setActiveTopic("settings")}
        onSelectAgent={changeAgent}
        onSelectTopic={setActiveTopic}
        updateAvailable={Boolean(appUpdater.state.update)}
      />

      <div
        aria-label={uiText.app.resizeSidebar}
        className={isResizingSidebar ? "pane-resizer active" : "pane-resizer"}
        onKeyDown={nudgePaneResize}
        onPointerCancel={stopPaneResize}
        onPointerDown={startPaneResize}
        onPointerMove={movePaneResize}
        onPointerUp={stopPaneResize}
        role="separator"
        tabIndex={0}
      />

      {activeTopic === "skillManager" ? (
        <SkillManager selectedAgent={selectedAgent} uiText={uiText} />
      ) : activeTopic === "mcpManager" ? (
        <McpManager selectedAgent={selectedAgent} uiText={uiText} />
      ) : activeTopic === "agentManager" ? (
        <AgentConfigManager selectedAgent={selectedAgent} uiText={uiText} />
      ) : activeTopic === "settings" ? (
        <SettingsPage
          controller={appUpdater}
          locale={locale}
          nativeEnabled={nativeUpdaterEnabled}
          onLocaleChange={changeLocale}
          uiText={uiText}
        />
      ) : (
        <KnowledgeBoard
          isProfileLoading={agentMemoryQuery.isLoading}
          isProfileRegenerating={isProfileRegenerating}
          locale={locale}
          onCancelProfileGeneration={cancelProfileGeneration}
          onDraftProfileCorrection={(section) => profileCorrectionMutation.mutate(section)}
          onOpenSource={(path) => openSourceMutation.mutate(path)}
          onRegenerateProfile={regenerateProfile}
          profile={profile}
          profileError={agentMemoryQuery.error ?? profileGenerationError}
          profileStale={Boolean(snapshot?.profileStale)}
          scan={scan}
          selectedAgent={selectedAgent}
          uiText={uiText}
          writable={writable}
        />
      )}

      {lastWritePath && (
        <div className="status-toast">{uiText.app.correctionWritten(lastWritePath)}</div>
      )}
      {profileCorrectionMutation.error && (
        <div className="status-toast error">{String(profileCorrectionMutation.error)}</div>
      )}
      {writeMutation.error && (
        <div className="status-toast error">{String(writeMutation.error)}</div>
      )}
      {openSourceMutation.error && (
        <div className="status-toast error">{String(openSourceMutation.error)}</div>
      )}

      {draft && (
        <CorrectionDialog
          draft={draft}
          isWriting={writeMutation.isPending}
          uiText={uiText}
          onCancel={() => setDraft(null)}
          onContentChange={(content) => setDraft({ ...draft, content })}
          onConfirm={() => writeMutation.mutate(draft)}
        />
      )}
    </div>
  );
}

export default App;
