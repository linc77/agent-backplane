import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  Layers3,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  applySkillProfile,
  chooseSkillProject,
  deleteSkillProfile,
  loadSkillInventory,
  loadSkillUsage,
  loadSkillWorkspace,
  openSourceFile,
  saveProjectSkillSelection,
  saveSkillManifest,
  saveSkillProfile,
  syncProjectSkills,
} from "../lib/api";
import { agentMeta } from "../lib/agentScope";
import { PageHeader } from "./PageHeader";
import { LoadingState } from "./LoadingState";
import type { UiText } from "../lib/i18n";
import { categorizeSkills, type SkillCategory } from "../lib/skillCategories";
import {
  isCapabilityGloballyInherited,
  isCapabilityProjectLocal,
  isCapabilitySelected,
  selectRepresentativeSkillSource,
  type SkillSourceRefLike,
} from "../lib/skillAssignments";
import { projectSkillInventory } from "../lib/skillInventory";
import type {
  AgentKind,
  ProjectSkillBinding,
  SkillCapability,
  SkillCopy,
  SkillSourceInput,
  SkillUsageSummary,
} from "../lib/types";

type SkillView = "enabled" | "available" | "profiles";

const selectedProjectStorageKey = "agent-backplane.selected-skill-project";

function matchesCapability(capability: SkillCapability, query: string, tool: string) {
  if (tool && !capability.tools.includes(tool)) return false;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    capability.name,
    capability.description,
    ...capability.tools,
    ...capability.copies.flatMap((copy) => [copy.path, copy.resolvedPath, copy.issue ?? ""]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function copyScope(copy: SkillCopy, uiText: UiText) {
  if (copy.scope === "library") return uiText.skills.libraryScope;
  return copy.scope === "project" ? uiText.skills.projectScope : uiText.skills.globalScope;
}

function filesystemKind(copy: SkillCopy, uiText: UiText) {
  return copy.filesystemKind === "symlink" ? uiText.skills.symlink : uiText.skills.directory;
}

function compactSkillPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const hiddenRoot = normalized.match(/\/(\.[^/]+)(?:\/|$)/)?.[1];
  if (hiddenRoot) return hiddenRoot;
  const segments = normalized.split("/").filter(Boolean);
  const skillsIndex = segments.lastIndexOf("skills");
  return skillsIndex > 0
    ? segments[skillsIndex - 1]
    : segments[segments.length - 2] ?? segments[segments.length - 1] ?? path;
}

function categoryLabel(category: SkillCategory, uiText: UiText) {
  return uiText.skills.namespaceNames[category.key]
    ?? category.key.charAt(0).toUpperCase() + category.key.slice(1);
}

function formatLastUsedAt(value: string, todayAt: (time: string) => string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const today = new Date();
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  if (date.toDateString() === today.toDateString()) return todayAt(time);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatAgentUsage(usage: SkillUsageSummary) {
  return (["codex", "claudeCode", "hermes"] as AgentKind[])
    .filter((agent) => usage.agentCounts[agent] > 0)
    .map((agent) => `${agentMeta[agent].label} ${usage.agentCounts[agent]}`)
    .join(" / ");
}

function sourceDirectoryName(path: string, fallback: string) {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? fallback;
}

function copySource(copy: SkillCopy): SkillSourceRefLike {
  const sourcePath = copy.resolvedPath || copy.path;
  return {
    sourceId: copy.id,
    name: copy.name,
    sourcePath,
    manifestPath: `${sourcePath.replace(/[\\/]$/, "")}/SKILL.md`,
    directoryName: sourceDirectoryName(sourcePath, copy.name),
    contentHash: copy.contentHash,
    scope: copy.scope,
  };
}

function sourceInput(source: SkillSourceRefLike): SkillSourceInput {
  return {
    name: source.name,
    sourcePath: source.sourcePath,
    contentHash: source.contentHash,
    scope: source.scope,
  };
}

function samePath(left: string, right: string) {
  const normalize = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalize(left) === normalize(right);
}

function emptyBinding(projectId: string, agent: AgentKind): ProjectSkillBinding {
  return {
    projectId,
    agent,
    profileId: null,
    skills: [],
    deployments: [],
    syncStatus: { state: "never", syncedAt: null, message: null },
    updatedAt: "",
  };
}

function readStoredProjectId() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(selectedProjectStorageKey) ?? "";
}

export function SkillManager({
  selectedAgent,
  uiText,
}: {
  selectedAgent: AgentKind;
  uiText: UiText;
}) {
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState("");
  const [category, setCategory] = useState("");
  const [view, setView] = useState<SkillView>("enabled");
  const [selectedProjectId, setSelectedProjectId] = useState(readStoredProjectId);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedCopyId, setSelectedCopyId] = useState<string>();
  const [isEditing, setIsEditing] = useState(false);
  const [draftSource, setDraftSource] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saveMessage, setSaveMessage] = useState<string>();
  const [isChoosingProject, setIsChoosingProject] = useState(false);
  const [changingCapabilityId, setChangingCapabilityId] = useState<string>();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileOperationId, setProfileOperationId] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [operationMessage, setOperationMessage] = useState<string>();
  const queryClient = useQueryClient();

  const workspaceQuery = useQuery({
    queryKey: ["skill-workspace"],
    queryFn: loadSkillWorkspace,
  });
  const workspace = workspaceQuery.data;
  const selectedProject = workspace?.projects.find((project) => project.id === selectedProjectId);
  const inventoryKey = ["skill-inventory", selectedProject?.rootPath ?? null] as const;
  const inventoryQuery = useQuery({
    queryKey: inventoryKey,
    queryFn: () => loadSkillInventory(selectedProject?.rootPath ?? null),
    enabled: workspaceQuery.isSuccess,
  });
  const inventory = useMemo(
    () => inventoryQuery.data ? projectSkillInventory(inventoryQuery.data, selectedAgent) : undefined,
    [inventoryQuery.data, selectedAgent],
  );
  const savedBinding = workspace?.bindings.find((item) =>
    item.projectId === selectedProjectId && item.agent === selectedAgent);
  const binding = savedBinding ?? emptyBinding(selectedProjectId, selectedAgent);
  const profiles = useMemo(
    () => workspace?.profiles.filter((profile) => profile.agent === selectedAgent) ?? [],
    [selectedAgent, workspace?.profiles],
  );

  useEffect(() => {
    if (!workspace) return;
    if (workspace.projects.some((project) => project.id === selectedProjectId)) return;
    const nextProjectId = workspace.projects[0]?.id ?? "";
    setSelectedProjectId(nextProjectId);
    if (nextProjectId) window.localStorage.setItem(selectedProjectStorageKey, nextProjectId);
    else window.localStorage.removeItem(selectedProjectStorageKey);
  }, [selectedProjectId, workspace]);

  useEffect(() => {
    setQuery("");
    setTool("");
    setCategory("");
    setView("enabled");
    setSelectedId(undefined);
    setSelectedCopyId(undefined);
    setIsEditing(false);
    setDraftSource("");
    setSaveError(undefined);
    setSaveMessage(undefined);
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsProfileFormOpen(false);
    setProfileName("");
  }, [selectedAgent, selectedProjectId]);

  const usageTargets = useMemo(
    () => (inventory?.capabilities ?? []).map((capability) => ({
      capabilityId: capability.id,
      name: capability.name,
      manifestPaths: Array.from(new Set(capability.copies.flatMap((copy) => [
        copy.manifestPath,
        `${copy.resolvedPath.replace(/[\\/]$/, "")}/SKILL.md`,
      ]))),
    })),
    [inventory?.capabilities],
  );
  const usageQuery = useQuery({
    queryKey: ["skill-usage", selectedAgent, selectedProjectId, usageTargets],
    queryFn: () => loadSkillUsage(usageTargets),
    enabled: usageTargets.length > 0,
    refetchInterval: 30_000,
  });
  const usageByCapability = useMemo(
    () => new Map(usageQuery.data?.summaries.map((usage) => [usage.capabilityId, usage]) ?? []),
    [usageQuery.data?.summaries],
  );
  const tools = useMemo(
    () => Array.from(new Set(inventory?.capabilities.flatMap((capability) => capability.tools) ?? [])).sort(),
    [inventory?.capabilities],
  );
  const categoryIndex = useMemo(
    () => categorizeSkills(inventory?.capabilities ?? []),
    [inventory?.capabilities],
  );
  const capabilityStates = useMemo(() => new Map(
    (inventory?.capabilities ?? []).map((capability) => {
      const sources = capability.copies.map(copySource);
      const validSources = capability.copies.filter((copy) => copy.valid).map(copySource);
      const selected = isCapabilitySelected(sources, binding);
      const inherited = isCapabilityGloballyInherited(sources);
      const projectLocal = isCapabilityProjectLocal(sources, binding.deployments);
      const representative = selectRepresentativeSkillSource(validSources);
      const enabled = selected || inherited || projectLocal;
      const available = !selected && !projectLocal && representative?.scope === "library";
      return [capability.id, { sources, selected, inherited, projectLocal, representative, enabled, available }];
    }),
  ), [binding, inventory?.capabilities]);
  const enabledCount = [...capabilityStates.values()].filter((state) => state.enabled).length;
  const availableCount = [...capabilityStates.values()].filter((state) => state.available).length;
  const capabilities = useMemo(
    () => (inventory?.capabilities ?? []).filter((capability) => {
      const state = capabilityStates.get(capability.id);
      if (view === "enabled" && !state?.enabled) return false;
      if (view === "available" && !state?.available) return false;
      if (category && categoryIndex.categoryByCapability.get(capability.id) !== category) return false;
      return matchesCapability(capability, query, tool);
    }),
    [capabilityStates, category, categoryIndex, inventory?.capabilities, query, tool, view],
  );
  const selectedCapability = inventory?.capabilities.find((capability) => capability.id === selectedId);
  const selectedCopy = selectedCapability?.copies.find((copy) => copy.id === selectedCopyId)
    ?? selectedCapability?.copies[0];
  const selectedUsage = selectedCapability ? usageByCapability.get(selectedCapability.id) : undefined;
  const activeRoots = inventory?.roots.filter((root) => root.exists) ?? [];

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    if (projectId) window.localStorage.setItem(selectedProjectStorageKey, projectId);
  }

  async function addProject() {
    setIsChoosingProject(true);
    setOperationError(undefined);
    try {
      const project = await chooseSkillProject();
      if (!project) return;
      await workspaceQuery.refetch();
      selectProject(project.id);
    } catch (error) {
      setOperationError(uiText.skills.selectionFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setIsChoosingProject(false);
    }
  }

  function openCapability(id: string) {
    setSelectedId(id);
    setSelectedCopyId(undefined);
    setIsEditing(false);
    setDraftSource("");
    setSaveError(undefined);
    setSaveMessage(undefined);
  }

  function closeCapability() {
    setSelectedId(undefined);
    setSelectedCopyId(undefined);
    setIsEditing(false);
    setDraftSource("");
    setSaveError(undefined);
    setSaveMessage(undefined);
  }

  function startEditing() {
    if (!selectedCopy) return;
    setDraftSource(selectedCopy.source);
    setIsEditing(true);
    setSaveError(undefined);
    setSaveMessage(undefined);
  }

  async function saveChanges() {
    if (!selectedCopy) return;
    setIsSaving(true);
    setSaveError(undefined);
    setSaveMessage(undefined);
    try {
      const nextInventory = await saveSkillManifest({
        manifestPath: selectedCopy.manifestPath,
        source: draftSource,
        expectedContentHash: selectedCopy.contentHash,
      }, selectedProject?.rootPath ?? null);
      queryClient.setQueryData(inventoryKey, nextInventory);
      const nextCapability = nextInventory.capabilities.find((capability) =>
        capability.copies.some((copy) => copy.manifestPath === selectedCopy.manifestPath));
      const nextCopy = nextCapability?.copies.find((copy) => copy.manifestPath === selectedCopy.manifestPath);
      setSelectedId(nextCapability?.id);
      setSelectedCopyId(nextCopy?.id);
      setIsEditing(false);
      setSaveMessage(uiText.skills.savedChanges);
    } catch (error) {
      setSaveError(uiText.skills.saveFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleCapability(capability: SkillCapability) {
    if (!selectedProject) return;
    const state = capabilityStates.get(capability.id);
    if (!state) return;
    const nextSkills = state.selected
      ? binding.skills.filter((skill) => !state.sources.some((source) =>
        source.sourceId === skill.sourceId || samePath(source.sourcePath, skill.sourcePath)))
      : state.representative?.scope === "library"
        ? [...binding.skills, state.representative]
        : binding.skills;
    setChangingCapabilityId(capability.id);
    setOperationError(undefined);
    setOperationMessage(undefined);
    try {
      const nextWorkspace = await saveProjectSkillSelection({
        projectId: selectedProject.id,
        agent: selectedAgent,
        skills: nextSkills.map(sourceInput),
      });
      queryClient.setQueryData(["skill-workspace"], nextWorkspace);
    } catch (error) {
      setOperationError(uiText.skills.selectionFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setChangingCapabilityId(undefined);
    }
  }

  async function saveProfile() {
    if (!selectedProject || !profileName.trim()) return;
    setProfileOperationId("save");
    setOperationError(undefined);
    setOperationMessage(undefined);
    try {
      const nextWorkspace = await saveSkillProfile({
        id: null,
        name: profileName.trim(),
        projectId: selectedProject.id,
        agent: selectedAgent,
      });
      queryClient.setQueryData(["skill-workspace"], nextWorkspace);
      setProfileName("");
      setIsProfileFormOpen(false);
      setOperationMessage(uiText.skills.profileSaved);
    } catch (error) {
      setOperationError(uiText.skills.profileFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setProfileOperationId(undefined);
    }
  }

  async function applyProfile(profileId: string) {
    if (!selectedProject) return;
    setProfileOperationId(profileId);
    setOperationError(undefined);
    setOperationMessage(undefined);
    try {
      const nextWorkspace = await applySkillProfile({ profileId, projectId: selectedProject.id });
      queryClient.setQueryData(["skill-workspace"], nextWorkspace);
      setView("enabled");
      setOperationMessage(uiText.skills.profileApplied);
    } catch (error) {
      setOperationError(uiText.skills.profileFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setProfileOperationId(undefined);
    }
  }

  async function removeProfile(profileId: string) {
    setProfileOperationId(profileId);
    setOperationError(undefined);
    setOperationMessage(undefined);
    try {
      const nextWorkspace = await deleteSkillProfile(profileId);
      queryClient.setQueryData(["skill-workspace"], nextWorkspace);
    } catch (error) {
      setOperationError(uiText.skills.profileFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setProfileOperationId(undefined);
    }
  }

  async function syncProject() {
    if (!selectedProject) return;
    setIsSyncing(true);
    setOperationError(undefined);
    setOperationMessage(undefined);
    try {
      const result = await syncProjectSkills(selectedProject.id, selectedAgent);
      queryClient.setQueryData(["skill-workspace"], result.workspace);
      if (result.status === "conflict" || result.status === "failed") {
        const detail = result.error ?? result.conflicts.map((conflict) => conflict.destinationPath).join(", ");
        setOperationError(uiText.skills.syncFailed(detail || result.status));
      } else {
        setOperationMessage(uiText.skills.syncResult(result.created.length, result.removed.length));
        await inventoryQuery.refetch();
      }
    } catch (error) {
      setOperationError(uiText.skills.syncFailed(error instanceof Error ? error.message : String(error)));
    } finally {
      setIsSyncing(false);
    }
  }

  function syncStatusLabel() {
    if (binding.syncStatus.state === "synced") return uiText.skills.synced;
    if (binding.syncStatus.state === "never") return uiText.skills.unapplied;
    if (binding.syncStatus.state === "pending" || binding.syncStatus.state === "drifted") {
      return uiText.skills.pendingSync(binding.skills.length);
    }
    return uiText.skills.drifted;
  }

  return (
    <main className="board skill-manager">
      <PageHeader
        className="skill-toolbar"
        title={`${agentMeta[selectedAgent].label} · ${uiText.skills.title}`}
        actions={(
          <div className="skill-project-actions">
            <button
              className="secondary-button"
              disabled={isChoosingProject || isEditing}
              onClick={() => void addProject()}
              type="button"
            >
              <FolderPlus size={15} />
              {uiText.skills.addProject}
            </button>
            <button
              className="secondary-button"
              disabled={inventoryQuery.isFetching || isEditing}
              onClick={() => void inventoryQuery.refetch()}
              type="button"
            >
              <RefreshCw size={15} />
              {uiText.skills.refresh}
            </button>
          </div>
        )}
      />

      {workspaceQuery.error && <div className="inline-error">{String(workspaceQuery.error)}</div>}
      {inventoryQuery.error && <div className="inline-error">{String(inventoryQuery.error)}</div>}
      {(workspaceQuery.isLoading || inventoryQuery.isLoading) && (
        <LoadingState label={uiText.skills.loading} />
      )}

      {workspace && inventory && !selectedCapability && (
        <>
          <section className="skill-project-context">
            <div className="skill-project-picker">
              <FolderKanban size={17} />
              {workspace.projects.length ? (
                <label>
                  <span>{uiText.skills.project}</span>
                  <select
                    aria-label={uiText.skills.project}
                    onChange={(event) => selectProject(event.target.value)}
                    value={selectedProjectId}
                  >
                    {workspace.projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div>
                  <strong>{uiText.skills.noProject}</strong>
                  <small>{uiText.skills.noProjectHint}</small>
                </div>
              )}
            </div>
            {selectedProject && (
              <div className="skill-sync-actions">
                <span className={`skill-sync-state ${binding.syncStatus.state}`}>
                  {syncStatusLabel()}
                </span>
                <button
                  className="primary-button"
                  disabled={isSyncing || !savedBinding}
                  onClick={() => void syncProject()}
                  type="button"
                >
                  <Check size={14} />
                  {isSyncing ? uiText.skills.syncingProject : uiText.skills.syncProject}
                </button>
              </div>
            )}
            {selectedProject && <code className="skill-project-path" title={selectedProject.rootPath}>{selectedProject.rootPath}</code>}
          </section>

          <p className="skill-baseline-note">{uiText.skills.globalBaselineNote}</p>
          {operationError && <p className="skill-save-status error" role="alert">{operationError}</p>}
          {operationMessage && <p className="skill-save-status success" role="status">{operationMessage}</p>}

          <nav className="skill-view-tabs" aria-label={uiText.skills.title}>
            <button
              className={view === "enabled" ? "active" : ""}
              aria-pressed={view === "enabled"}
              onClick={() => setView("enabled")}
              type="button"
            >
              {uiText.skills.enabledTab(enabledCount)}
            </button>
            <button
              className={view === "available" ? "active" : ""}
              aria-pressed={view === "available"}
              onClick={() => setView("available")}
              type="button"
            >
              {uiText.skills.availableTab(availableCount)}
            </button>
            <button
              className={view === "profiles" ? "active" : ""}
              aria-pressed={view === "profiles"}
              onClick={() => setView("profiles")}
              type="button"
            >
              {uiText.skills.profilesTab(profiles.length)}
            </button>
          </nav>

          {view !== "profiles" && (
            <>
              <div className="skill-root-summary">
                <span>{uiText.skills.scanRoots}</span>
                <div className="skill-tool-list">
                  {activeRoots.map((root) => (
                    <span key={root.id} title={root.path}>{root.label} · {root.copyCount}</span>
                  ))}
                </div>
              </div>
              <div className="skill-controls">
                <label className="search-box">
                  <Search size={15} />
                  <input
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={uiText.skills.searchPlaceholder}
                    value={query}
                  />
                </label>
                <select
                  aria-label={uiText.skills.tools}
                  className="mode-select"
                  onChange={(event) => setTool(event.target.value)}
                  value={tool}
                >
                  <option value="">{uiText.skills.allTools}</option>
                  {tools.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <nav className="skill-category-list" aria-label={uiText.skills.categoryFilter}>
                <button
                  aria-label={`${uiText.skills.allCategories} ${capabilities.length}`}
                  aria-pressed={!category}
                  className={!category ? "active" : ""}
                  onClick={() => setCategory("")}
                  type="button"
                >
                  {uiText.skills.allCategories}
                  <span>{capabilities.length}</span>
                </button>
                {categoryIndex.categories.map((item) => {
                  const label = categoryLabel(item, uiText);
                  return (
                    <button
                      aria-label={`${label} ${item.count}`}
                      aria-pressed={category === item.id}
                      className={category === item.id ? "active" : ""}
                      key={item.id}
                      onClick={() => setCategory(item.id)}
                      type="button"
                    >
                      {label}<span>{item.count}</span>
                    </button>
                  );
                })}
              </nav>
              {inventory.snapshotError && <div className="inline-error">{inventory.snapshotError}</div>}
              <section className="skill-grid">
                {capabilities.map((capability) => {
                  const usage = usageByCapability.get(capability.id);
                  const state = capabilityStates.get(capability.id);
                  return (
                    <article className="skill-card" key={capability.id}>
                      <button
                        aria-label={uiText.skills.openDetails(capability.name)}
                        className="skill-card-open"
                        onClick={() => openCapability(capability.id)}
                        type="button"
                      >
                        <span className="skill-card-heading">
                          <strong>{capability.name}</strong>
                          <ChevronRight size={17} />
                        </span>
                        <span className="skill-card-description">
                          {capability.description || uiText.skills.noDescription}
                        </span>
                      </button>
                      <span className="skill-card-footer">
                        <span title={capability.copies[0].path}>{compactSkillPath(capability.copies[0].path)}</span>
                        <span className="skill-card-footer-meta">
                          {usage && usage.totalCount > 0 && <span>{uiText.skills.usageCount(usage.totalCount)}</span>}
                          {(capability.health === "invalid" || capability.copyCount > 1) && (
                            <em className={capability.health === "invalid" ? "invalid" : ""}>
                              {capability.health === "invalid"
                                ? uiText.skills.invalid
                                : uiText.skills.copyCount(capability.copyCount)}
                            </em>
                          )}
                        </span>
                      </span>
                      <span className="skill-card-assignment">
                        {state?.selected ? (
                          <button
                            aria-label={`${uiText.skills.removeFromProject}: ${capability.name}`}
                            disabled={changingCapabilityId === capability.id}
                            onClick={() => void toggleCapability(capability)}
                            type="button"
                          >
                            <Minus size={13} />
                            {binding.syncStatus.state === "synced"
                              ? uiText.skills.projectManaged
                              : uiText.skills.unapplied}
                          </button>
                        ) : state?.available ? (
                          <button
                            aria-label={`${uiText.skills.addToProject}: ${capability.name}`}
                            disabled={!selectedProject || changingCapabilityId === capability.id}
                            onClick={() => void toggleCapability(capability)}
                            type="button"
                          >
                            <Plus size={13} />{uiText.skills.addToProject}
                          </button>
                        ) : state?.inherited ? (
                          <span><Check size={12} />{uiText.skills.globalInherited}</span>
                        ) : state?.projectLocal ? (
                          <span><Check size={12} />{uiText.skills.projectExisting}</span>
                        ) : (
                          <span>{uiText.skills.unavailableSource}</span>
                        )}
                      </span>
                    </article>
                  );
                })}
                {!capabilities.length && <div className="skill-state">{uiText.skills.empty}</div>}
              </section>
            </>
          )}

          {view === "profiles" && (
            <section>
              {isProfileFormOpen ? (
                <form
                  className="skill-profile-create"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveProfile();
                  }}
                >
                  <label htmlFor="skill-profile-name">{uiText.skills.profileName}</label>
                  <input
                    autoFocus
                    id="skill-profile-name"
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder={uiText.skills.profileNamePlaceholder}
                    value={profileName}
                  />
                  <button
                    className="primary-button"
                    disabled={!profileName.trim() || profileOperationId === "save" || !selectedProject}
                    type="submit"
                  >
                    <Save size={14} />
                    {profileOperationId === "save" ? uiText.skills.savingProfile : uiText.skills.saveProfile}
                  </button>
                  <button
                    aria-label={uiText.skills.cancelProfile}
                    className="icon-button"
                    onClick={() => {
                      setIsProfileFormOpen(false);
                      setProfileName("");
                    }}
                    type="button"
                  >
                    <X size={15} />
                  </button>
                </form>
              ) : (
                <button
                  className="secondary-button compact"
                  disabled={!selectedProject || !binding.skills.length}
                  onClick={() => setIsProfileFormOpen(true)}
                  type="button"
                >
                  <Layers3 size={14} />{uiText.skills.saveAsProfile}
                </button>
              )}
              <div className="skill-profile-list">
                {profiles.map((profile) => (
                  <article className="skill-profile-row" key={profile.id}>
                    <div>
                      <strong>{profile.name}</strong>
                      <small>{uiText.skills.profileSkillCount(profile.skills.length)}</small>
                    </div>
                    <div className="skill-profile-actions">
                      <button
                        className="secondary-button compact"
                        disabled={!selectedProject || Boolean(profileOperationId)}
                        onClick={() => void applyProfile(profile.id)}
                        type="button"
                      >
                        <Check size={13} />{uiText.skills.applyProfile}
                      </button>
                      <button
                        aria-label={`${uiText.skills.deleteProfile}: ${profile.name}`}
                        className="icon-button"
                        disabled={Boolean(profileOperationId)}
                        onClick={() => void removeProfile(profile.id)}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
                {!profiles.length && <div className="skill-state">{uiText.skills.emptyProfiles}</div>}
              </div>
            </section>
          )}
        </>
      )}

      {selectedCapability && (
        <section className="skill-detail-page">
          <button
            className="skill-detail-back"
            disabled={isEditing || isSaving}
            onClick={closeCapability}
            type="button"
          >
            <ArrowLeft size={16} />{uiText.skills.backToAll}
          </button>
          <section className="skill-locations" aria-label={uiText.skills.copyLocations}>
            <h3>{uiText.skills.copyLocations}</h3>
            <div className="skill-copy-list">
              {selectedCapability.copies.map((copy) => (
                <article className={copy.valid ? "skill-copy" : "skill-copy invalid"} key={copy.id}>
                  <header>
                    <div>
                      <strong>{copy.tool}</strong>
                      <span>{copyScope(copy, uiText)}</span>
                      <span>{filesystemKind(copy, uiText)}</span>
                    </div>
                    <button
                      aria-label={`${uiText.skills.reveal}: ${copy.path}`}
                      className="icon-button"
                      onClick={() => void openSourceFile(copy.path)}
                      type="button"
                    >
                      <FolderOpen size={15} />
                    </button>
                  </header>
                  <code>{copy.path}</code>
                  {copy.filesystemKind === "symlink" && copy.resolvedPath !== copy.path && (
                    <small>{uiText.skills.resolvedPath}: {copy.resolvedPath}</small>
                  )}
                  {copy.issue && <small className="skill-copy-issue">{copy.issue}</small>}
                </article>
              ))}
            </div>
          </section>
          <article className="skill-markdown-panel">
            <header className="skill-markdown-toolbar">
              <h3>{uiText.skills.documentation}</h3>
              <div className="skill-editor-actions">
                {selectedCapability.copies.length > 1 && (
                  <label className="skill-copy-select">
                    <span>{uiText.skills.editCopy}</span>
                    <select
                      disabled={isEditing}
                      onChange={(event) => {
                        setSelectedCopyId(event.target.value);
                        setSaveError(undefined);
                        setSaveMessage(undefined);
                      }}
                      value={selectedCopy?.id ?? ""}
                    >
                      {selectedCapability.copies.map((copy) => (
                        <option key={copy.id} value={copy.id}>
                          {copy.tool} / {copyScope(copy, uiText)} / {copy.path}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {isEditing ? (
                  <>
                    <button
                      className="secondary-button compact"
                      disabled={isSaving}
                      onClick={() => {
                        setIsEditing(false);
                        setDraftSource("");
                        setSaveError(undefined);
                      }}
                      type="button"
                    >
                      {uiText.skills.cancelEdit}
                    </button>
                    <button
                      className="primary-button"
                      disabled={isSaving || draftSource === selectedCopy?.source}
                      onClick={() => void saveChanges()}
                      type="button"
                    >
                      <Save size={14} />{isSaving ? uiText.skills.savingChanges : uiText.skills.saveChanges}
                    </button>
                  </>
                ) : (
                  <button className="secondary-button compact" onClick={startEditing} type="button">
                    <Pencil size={14} />{uiText.skills.editDocumentation}
                  </button>
                )}
              </div>
            </header>
            {isEditing ? (
              <textarea
                aria-label={uiText.skills.sourceEditor}
                className="skill-source-editor"
                onChange={(event) => setDraftSource(event.target.value)}
                spellCheck={false}
                value={draftSource}
              />
            ) : (
              <div className="skill-markdown">
                <h1 className="skill-document-name">{selectedCapability.name}</h1>
                <p className="skill-document-description">
                  {selectedCapability.description || uiText.skills.noDescription}
                </p>
                <p className="skill-usage-summary">
                  {selectedUsage && selectedUsage.totalCount > 0 && selectedUsage.lastUsedAt
                    ? uiText.skills.usageSummary(
                        selectedUsage.totalCount,
                        formatLastUsedAt(selectedUsage.lastUsedAt, uiText.skills.todayAt),
                        formatAgentUsage(selectedUsage),
                      )
                    : uiText.skills.noUsage}
                </p>
                {selectedCapability.markdown ? (
                  <ReactMarkdown
                    components={{
                      a: ({ children, href }) => <span className="skill-markdown-link" title={href}>{children}</span>,
                      img: ({ alt }) => alt ? <span className="skill-markdown-image">{alt}</span> : null,
                    }}
                    remarkPlugins={[remarkGfm]}
                  >
                    {selectedCapability.markdown}
                  </ReactMarkdown>
                ) : (
                  <div className="skill-state">{uiText.skills.noDocumentation}</div>
                )}
              </div>
            )}
            {saveError && <p className="skill-save-status error" role="alert">{saveError}</p>}
            {saveMessage && <p className="skill-save-status success" role="status">{saveMessage}</p>}
          </article>
        </section>
      )}
    </main>
  );
}
