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
  cancelCodexAudit,
  cancelMemoryProfileGeneration,
  draftCorrection,
  draftCorrectionFromContent,
  getCodexAudit,
  getMemoryProfileGeneration,
  isFixtureMode,
  loadMemoryProfile,
  openSourceFile,
  scanMemories,
  startCodexAudit,
  startMemoryProfileGeneration,
  writeCorrection,
} from "./lib/api";
import {
  clampPaneLayout,
  DEFAULT_PANE_LAYOUT,
  paneGridTemplate,
  resizePaneLayout,
  type PaneDivider,
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
import type {
  CodexAuditMode,
  CodexAuditRun,
  CodexAuditTask,
  CorrectionDraft,
  MemoryEntry,
  MemoryProfileGenerationTask,
  MemoryProfileSection,
  SuggestedCorrection,
} from "./lib/types";
import { CorrectionDialog } from "./components/CorrectionDialog";
import { AgentConfigManager } from "./components/AgentConfigManager";
import { Inspector } from "./components/Inspector";
import { KnowledgeBoard } from "./components/KnowledgeBoard";
import { Sidebar } from "./components/Sidebar";
import { SkillManager } from "./components/SkillManager";
import "./App.css";

interface AuditRequest {
  mode: CodexAuditMode;
}

function App() {
  const queryClient = useQueryClient();
  const fixtureMode = isFixtureMode();
  const [locale, setLocale] = useState<Locale>(() => readStoredLocale());
  const uiText = useMemo(() => getUiText(locale), [locale]);
  const [activeTopic, setActiveTopic] = useState<MemoryView>("overview");
  const [query, setQuery] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | undefined>();
  const [draft, setDraft] = useState<CorrectionDraft | null>(null);
  const [lastWritePath, setLastWritePath] = useState<string | null>(null);
  const [auditMode, setAuditMode] = useState<CodexAuditMode>("curated");
  const [auditRun, setAuditRun] = useState<CodexAuditRun | null>(null);
  const [auditTask, setAuditTask] = useState<CodexAuditTask | null>(null);
  const [profileGenerationTask, setProfileGenerationTask] =
    useState<MemoryProfileGenerationTask | null>(null);
  const [paneLayout, setPaneLayout] = useState(() =>
    clampPaneLayout(DEFAULT_PANE_LAYOUT, window.innerWidth),
  );
  const [draggingDivider, setDraggingDivider] = useState<PaneDivider | null>(null);
  const auditContextRef = useRef<{ mode: CodexAuditMode }>({ mode: auditMode });
  auditContextRef.current = { mode: auditMode };
  const dragRef = useRef<{
    divider: PaneDivider;
    startX: number;
    startLayout: PaneLayout;
    viewportWidth: number;
  } | null>(null);

  const scanQuery = useQuery({
    queryKey: ["memories"],
    queryFn: () => scanMemories(),
  });

  const profileQuery = useQuery({
    queryKey: ["memory-profile"],
    queryFn: () => loadMemoryProfile(),
  });

  const selectedEntry = useMemo(
    () => scanQuery.data?.entries.find((entry) => entry.id === selectedEntryId),
    [scanQuery.data?.entries, selectedEntryId],
  );

  const truth = useMemo(() => resolveMemoryTruth(scanQuery.data), [scanQuery.data]);

  const selectedSource = useMemo(
    () =>
      selectedEntry
        ? scanQuery.data?.sources.find((source) => source.relativePath === selectedEntry.sourcePath)
        : undefined,
    [scanQuery.data?.sources, selectedEntry],
  );

  const selectedRisk = useMemo(
    () =>
      selectedEntry
        ? scanQuery.data?.risks.find((risk) => risk.entryId === selectedEntry.id)
        : undefined,
    [scanQuery.data?.risks, selectedEntry],
  );

  const selectedTruth = selectedEntry ? truth.byEntryId.get(selectedEntry.id) : undefined;

  const draftMutation = useMutation({
    mutationFn: (entry: MemoryEntry) =>
      draftCorrection(null, "memory-correction", [
        `Review and update memory from ${entry.sourcePath} lines ${entry.startLine}-${entry.endLine}: ${entry.summary}`,
      ]),
    onSuccess: setDraft,
  });

  const profileCorrectionMutation = useMutation({
    mutationFn: (section: MemoryProfileSection) =>
      draftCorrection(null, `memory-profile-${section.id}`, [
        `Review and update memory profile section "${section.title}": ${section.body}`,
        ...section.evidence.map(
          (evidence) =>
            `Evidence ${evidence.sourcePath} lines ${evidence.startLine}-${evidence.endLine}: ${evidence.summary}`,
        ),
      ]),
    onSuccess: setDraft,
  });

  const writeMutation = useMutation({
    mutationFn: (nextDraft: CorrectionDraft) => writeCorrection(null, nextDraft),
    onSuccess: async (path) => {
      setDraft(null);
      setLastWritePath(path);
      setActiveTopic("effective");
      setSelectedEntryId(undefined);
      setQuery("");
      setProfileGenerationTask(null);
      await Promise.all([scanQuery.refetch(), profileQuery.refetch()]);
    },
  });

  const suggestedCorrectionMutation = useMutation({
    mutationFn: (correction: SuggestedCorrection) =>
      draftCorrectionFromContent(null, correction.id, correction.content),
    onSuccess: setDraft,
  });

  function applyAuditTask(task: CodexAuditTask) {
    setAuditTask(task);
    if (task.run && task.mode === auditContextRef.current.mode) {
      setAuditRun(task.run);
    }
  }

  const startAuditMutation = useMutation({
    mutationFn: (request: AuditRequest) => startCodexAudit(null, request.mode),
    onSuccess: applyAuditTask,
  });

  const cancelAuditMutation = useMutation({
    mutationFn: () => cancelCodexAudit(),
    onSuccess: setAuditTask,
  });

  const startProfileGenerationMutation = useMutation({
    mutationFn: () => startMemoryProfileGeneration(),
    onSuccess: (task) => {
      setProfileGenerationTask(task);
      if (task.profile) {
        queryClient.setQueryData(["memory-profile"], task.profile);
      }
    },
  });

  const cancelProfileGenerationMutation = useMutation({
    mutationFn: () => cancelMemoryProfileGeneration(),
    onSuccess: setProfileGenerationTask,
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
        .then((task) => {
          setProfileGenerationTask(task);
          if (task.profile) {
            queryClient.setQueryData(["memory-profile"], task.profile);
          }
        })
        .catch((error) => {
          setProfileGenerationTask({
            id: profileGenerationTask.id,
            status: "failed",
            startedAt: profileGenerationTask.startedAt,
            finishedAt: new Date().toISOString(),
            error: String(error),
            profile: null,
          });
        });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [profileGenerationTask?.id, profileGenerationTask?.status, queryClient]);

  useEffect(() => {
    if (auditTask?.status !== "running" && auditTask?.status !== "cancelling") {
      return;
    }

    const interval = window.setInterval(() => {
      void getCodexAudit()
        .then((task) => {
          applyAuditTask(task);
        })
        .catch((error) => {
          setAuditTask({
            id: auditTask.id,
            mode: auditTask.mode,
            status: "failed",
            startedAt: auditTask.startedAt,
            finishedAt: new Date().toISOString(),
            error: String(error),
            run: null,
          });
        });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [auditTask?.id, auditTask?.mode, auditTask?.status]);

  useEffect(() => {
    if (profileGenerationTask?.profile) {
      queryClient.setQueryData(["memory-profile"], profileGenerationTask.profile);
    }
  }, [profileGenerationTask?.profile, queryClient]);

  const profileGenerationError =
    startProfileGenerationMutation.error ??
    cancelProfileGenerationMutation.error ??
    (profileGenerationTask?.status === "failed" ? profileGenerationTask.error : null);

  const auditError =
    startAuditMutation.error ??
    cancelAuditMutation.error ??
    (auditTask?.status === "failed" ? auditTask.error : null);

  const isProfileRegenerating =
    startProfileGenerationMutation.isPending ||
    cancelProfileGenerationMutation.isPending ||
    profileGenerationTask?.status === "running" ||
    profileGenerationTask?.status === "cancelling";

  const isAuditRunning =
    startAuditMutation.isPending ||
    cancelAuditMutation.isPending ||
    auditTask?.status === "running" ||
    auditTask?.status === "cancelling";

  function regenerateProfile() {
    startProfileGenerationMutation.mutate();
  }

  function cancelProfileGeneration() {
    cancelProfileGenerationMutation.mutate();
  }

  function runOrCancelCodexAudit() {
    if (isAuditRunning) {
      cancelAuditMutation.mutate();
      return;
    }
    startAuditMutation.mutate({ mode: auditMode });
  }

  useEffect(() => {
    const handleResize = () =>
      setPaneLayout((layout) => clampPaneLayout(layout, window.innerWidth));

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function startPaneResize(divider: PaneDivider, event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      divider,
      startX: event.clientX,
      startLayout: paneLayout,
      viewportWidth: window.innerWidth,
    };
    setDraggingDivider(divider);
  }

  function movePaneResize(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    setPaneLayout(
      resizePaneLayout(drag.startLayout, drag.divider, event.clientX - drag.startX, drag.viewportWidth),
    );
  }

  function stopPaneResize() {
    dragRef.current = null;
    setDraggingDivider(null);
  }

  function nudgePaneResize(divider: PaneDivider, event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const step = event.shiftKey ? 48 : 16;
    const deltaX = event.key === "ArrowLeft" ? -step : step;
    setPaneLayout((layout) => resizePaneLayout(layout, divider, deltaX, window.innerWidth));
  }

  function renderPaneResizer(divider: PaneDivider) {
    return (
      <div
        aria-label={divider === "left" ? uiText.app.resizeSidebar : uiText.app.resizeInspector}
        className={draggingDivider === divider ? "pane-resizer active" : "pane-resizer"}
        onKeyDown={(event) => nudgePaneResize(divider, event)}
        onPointerCancel={stopPaneResize}
        onPointerDown={(event) => startPaneResize(divider, event)}
        onPointerMove={movePaneResize}
        onPointerUp={stopPaneResize}
        role="separator"
        tabIndex={0}
      />
    );
  }

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    writeStoredLocale(nextLocale);
  }

  return (
    <div
      className={`${draggingDivider ? "app-shell resizing" : "app-shell"}${
        activeTopic === "skillManager" ? " skills-mode" : ""
      }${
        activeTopic === "agentManager" ? " agent-mode" : ""
      }`}
      style={{ gridTemplateColumns: paneGridTemplate(paneLayout) }}
    >
      {fixtureMode && <div className="fixture-banner">{uiText.app.fixtureBanner}</div>}
      <Sidebar
        activeTopic={activeTopic}
        locale={locale}
        uiText={uiText}
        onLocaleChange={changeLocale}
        onSelectTopic={(topic) => {
          setActiveTopic(topic);
          setSelectedEntryId(undefined);
        }}
      />

      {renderPaneResizer("left")}

      {activeTopic === "skillManager" ? (
        <SkillManager uiText={uiText} />
      ) : activeTopic === "agentManager" ? (
        <AgentConfigManager uiText={uiText} />
      ) : (
      <KnowledgeBoard
        activeTopic={activeTopic}
        auditError={auditError}
        auditMode={auditMode}
        auditRun={auditRun}
        isAuditRunning={isAuditRunning}
        onAuditModeChange={(mode) => {
          setAuditMode(mode);
          setAuditRun(null);
          setAuditTask(null);
          startAuditMutation.reset();
          cancelAuditMutation.reset();
        }}
        onQueryChange={setQuery}
        onRefresh={() => {
          void scanQuery.refetch();
          void profileQuery.refetch();
        }}
        onDraftProfileCorrection={(section) => profileCorrectionMutation.mutate(section)}
        onDraftSuggestedCorrection={(correction) => suggestedCorrectionMutation.mutate(correction)}
        onOpenSource={(path) => openSourceMutation.mutate(path)}
        onRunCodexAudit={runOrCancelCodexAudit}
        onCancelProfileGeneration={cancelProfileGeneration}
        onRegenerateProfile={regenerateProfile}
        onSelectEntry={(entry) => setSelectedEntryId(entry.id)}
        query={query}
        profile={profileQuery.data}
        profileError={profileQuery.error ?? profileGenerationError}
        isProfileLoading={profileQuery.isLoading}
        isProfileRegenerating={isProfileRegenerating}
        scan={scanQuery.data}
        selectedEntryId={selectedEntryId}
        uiText={uiText}
      />
      )}

      {activeTopic !== "skillManager" && activeTopic !== "agentManager" && (
        <>
          {renderPaneResizer("right")}
          <Inspector
            entry={selectedEntry}
            onDraftCorrection={(entry) => draftMutation.mutate(entry)}
            risk={selectedRisk}
            source={selectedSource}
            truthItem={selectedTruth}
            uiText={uiText}
          />
        </>
      )}

      {scanQuery.isLoading && <div className="status-toast">{uiText.app.scanning}</div>}
      {profileQuery.isLoading && <div className="status-toast">{uiText.memorySummary.loading}</div>}
      {isProfileRegenerating && (
        <div className="status-toast">{uiText.memorySummary.loading}</div>
      )}
      {isAuditRunning && <div className="status-toast">{uiText.board.running}</div>}
      {lastWritePath && <div className="status-toast">{uiText.app.correctionWritten(lastWritePath)}</div>}
      {scanQuery.error && <div className="status-toast error">{String(scanQuery.error)}</div>}
      {profileQuery.error && <div className="status-toast error">{String(profileQuery.error)}</div>}
      {profileGenerationError && (
        <div className="status-toast error">{String(profileGenerationError)}</div>
      )}
      {draftMutation.error && <div className="status-toast error">{String(draftMutation.error)}</div>}
      {profileCorrectionMutation.error && (
        <div className="status-toast error">{String(profileCorrectionMutation.error)}</div>
      )}
      {writeMutation.error && <div className="status-toast error">{String(writeMutation.error)}</div>}
      {auditError && <div className="status-toast error">{String(auditError)}</div>}
      {openSourceMutation.error && (
        <div className="status-toast error">{String(openSourceMutation.error)}</div>
      )}
      {suggestedCorrectionMutation.error && (
        <div className="status-toast error">{String(suggestedCorrectionMutation.error)}</div>
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
