import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, FolderOpen, Pencil, RefreshCw, Save, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadSkillInventory, loadSkillUsage, openSourceFile, saveSkillManifest } from "../lib/api";
import { agentMeta } from "../lib/agentScope";
import type { UiText } from "../lib/i18n";
import { categorizeSkills, type SkillCategory, type SkillSemanticCategory } from "../lib/skillCategories";
import { projectSkillInventory } from "../lib/skillInventory";
import type { AgentKind, SkillCapability, SkillCopy, SkillUsageSummary } from "../lib/types";

function matchesCapability(capability: SkillCapability, query: string, tool: string) {
  if (tool && !capability.tools.includes(tool)) {
    return false;
  }
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
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
  return copy.scope === "project" ? uiText.skills.projectScope : uiText.skills.globalScope;
}

function filesystemKind(copy: SkillCopy, uiText: UiText) {
  return copy.filesystemKind === "symlink" ? uiText.skills.symlink : uiText.skills.directory;
}

function compactSkillPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const homeRelative = normalized.replace(/^\/Users\/[^/]+/, "~");
  if (/^~\/\.[^/]+\/skills\//.test(homeRelative)) {
    return homeRelative;
  }
  const segments = homeRelative.split("/").filter(Boolean);
  return segments.length > 4 ? `…/${segments.slice(-3).join("/")}` : homeRelative;
}

function categoryLabel(category: SkillCategory, uiText: UiText) {
  if (category.kind === "namespace") {
    return uiText.skills.namespaceNames[category.key]
      ?? category.key.charAt(0).toUpperCase() + category.key.slice(1);
  }
  return uiText.skills.categoryNames[category.key as SkillSemanticCategory];
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
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedCopyId, setSelectedCopyId] = useState<string>();
  const [isEditing, setIsEditing] = useState(false);
  const [draftSource, setDraftSource] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [saveMessage, setSaveMessage] = useState<string>();
  const queryClient = useQueryClient();
  const inventoryQuery = useQuery({
    queryKey: ["skill-inventory"],
    queryFn: () => loadSkillInventory(),
  });
  const inventory = useMemo(
    () =>
      inventoryQuery.data
        ? projectSkillInventory(inventoryQuery.data, selectedAgent)
        : undefined,
    [inventoryQuery.data, selectedAgent],
  );
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
    queryKey: ["skill-usage", selectedAgent, usageTargets],
    queryFn: () => loadSkillUsage(usageTargets),
    enabled: usageTargets.length > 0,
    refetchInterval: 30_000,
  });
  const usageByCapability = useMemo(
    () => new Map(usageQuery.data?.summaries.map((usage) => [usage.capabilityId, usage]) ?? []),
    [usageQuery.data?.summaries],
  );

  useEffect(() => {
    setQuery("");
    setTool("");
    setCategory("");
    setSelectedId(undefined);
    setSelectedCopyId(undefined);
    setIsEditing(false);
    setDraftSource("");
    setSaveError(undefined);
    setSaveMessage(undefined);
  }, [selectedAgent]);

  const tools = useMemo(
    () =>
      Array.from(
        new Set(inventory?.capabilities.flatMap((capability) => capability.tools) ?? []),
      ).sort(),
    [inventory?.capabilities],
  );
  const categoryIndex = useMemo(
    () => categorizeSkills(inventory?.capabilities ?? []),
    [inventory?.capabilities],
  );
  const capabilities = useMemo(
    () =>
      (inventory?.capabilities ?? []).filter((capability) => {
        if (category && categoryIndex.categoryByCapability.get(capability.id) !== category) {
          return false;
        }
        return matchesCapability(capability, query, tool);
      }),
    [category, categoryIndex, inventory?.capabilities, query, tool],
  );
  const selectedCapability = inventory?.capabilities.find(
    (capability) => capability.id === selectedId,
  );
  const selectedCopy = selectedCapability?.copies.find((copy) => copy.id === selectedCopyId)
    ?? selectedCapability?.copies[0];
  const selectedUsage = selectedCapability
    ? usageByCapability.get(selectedCapability.id)
    : undefined;
  const activeRoots = inventory?.roots.filter((root) => root.exists) ?? [];

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
      });
      queryClient.setQueryData(["skill-inventory"], nextInventory);
      const nextCapability = nextInventory.capabilities.find((capability) =>
        capability.copies.some((copy) => copy.manifestPath === selectedCopy.manifestPath));
      const nextCopy = nextCapability?.copies.find(
        (copy) => copy.manifestPath === selectedCopy.manifestPath,
      );
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

  return (
    <main className="board skill-manager">
      <header className="toolbar skill-toolbar">
        <div>
          <p className="eyebrow">{uiText.skills.eyebrow}</p>
          <h1>{agentMeta[selectedAgent].label} · {uiText.skills.title}</h1>
        </div>
        <button
          className="secondary-button"
          disabled={inventoryQuery.isFetching || isEditing}
          onClick={() => void inventoryQuery.refetch()}
          type="button"
        >
          <RefreshCw size={15} />
          {uiText.skills.refresh}
        </button>
      </header>

      {inventoryQuery.error && <div className="audit-error">{String(inventoryQuery.error)}</div>}
      {inventoryQuery.isLoading && <div className="skill-state">{uiText.skills.loading}</div>}

      {inventory && !selectedCapability && (
        <>
          <div className="skill-root-summary">
            <span>{uiText.skills.scanRoots}</span>
            <div className="skill-tool-list">
              {activeRoots.map((root) => (
                <span key={root.id} title={root.path}>
                  {root.label} · {root.copyCount}
                </span>
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
              {tools.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <nav className="skill-category-list" aria-label={uiText.skills.categoryFilter}>
            <button
              aria-label={`${uiText.skills.allCategories} ${inventory.capabilityCount}`}
              aria-pressed={!category}
              className={!category ? "active" : ""}
              onClick={() => setCategory("")}
              type="button"
            >
              {uiText.skills.allCategories}
              <span>{inventory.capabilityCount}</span>
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
                  {label}
                  <span>{item.count}</span>
                </button>
              );
            })}
          </nav>

          {inventory.snapshotError && <div className="audit-error">{inventory.snapshotError}</div>}

          <section className="skill-grid">
            {capabilities.map((capability) => {
              const usage = usageByCapability.get(capability.id);
              return (
                <button
                aria-label={uiText.skills.openDetails(capability.name)}
                className="skill-card"
                key={capability.id}
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
                <span className="skill-card-footer">
                  <span title={capability.copies[0].path}>
                    {compactSkillPath(capability.copies[0].path)}
                  </span>
                  <span className="skill-card-footer-meta">
                    {usage && usage.totalCount > 0 && (
                      <span>{uiText.skills.usageCount(usage.totalCount)}</span>
                    )}
                    {(capability.health === "invalid" || capability.copyCount > 1) && (
                      <em className={capability.health === "invalid" ? "invalid" : ""}>
                        {capability.health === "invalid"
                          ? uiText.skills.invalid
                          : uiText.skills.copyCount(capability.copyCount)}
                      </em>
                    )}
                  </span>
                </span>
                </button>
              );
            })}
            {!capabilities.length && <div className="skill-state">{uiText.skills.empty}</div>}
          </section>
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
            <ArrowLeft size={16} />
            {uiText.skills.backToAll}
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
                          {copy.tool} · {copyScope(copy, uiText)} · {copy.path}
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
                      <Save size={14} />
                      {isSaving ? uiText.skills.savingChanges : uiText.skills.saveChanges}
                    </button>
                  </>
                ) : (
                  <button className="secondary-button compact" onClick={startEditing} type="button">
                    <Pencil size={14} />
                    {uiText.skills.editDocumentation}
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
                      a: ({ children, href }) => (
                        <span className="skill-markdown-link" title={href}>{children}</span>
                      ),
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
            {saveError && <p className="skill-save-status error">{saveError}</p>}
            {saveMessage && <p className="skill-save-status success">{saveMessage}</p>}
          </article>

        </section>
      )}
    </main>
  );
}
