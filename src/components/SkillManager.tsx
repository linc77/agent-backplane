import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, FolderOpen, RefreshCw, Search } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { loadSkillInventory, openSourceFile } from "../lib/api";
import { agentMeta } from "../lib/agentScope";
import type { UiText } from "../lib/i18n";
import { projectSkillInventory } from "../lib/skillInventory";
import type { AgentKind, SkillCapability, SkillCopy } from "../lib/types";

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

export function SkillManager({
  selectedAgent,
  uiText,
}: {
  selectedAgent: AgentKind;
  uiText: UiText;
}) {
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
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

  useEffect(() => {
    setQuery("");
    setTool("");
    setSelectedId(undefined);
  }, [selectedAgent]);

  const tools = useMemo(
    () =>
      Array.from(
        new Set(inventory?.capabilities.flatMap((capability) => capability.tools) ?? []),
      ).sort(),
    [inventory?.capabilities],
  );
  const capabilities = useMemo(
    () =>
      (inventory?.capabilities ?? []).filter((capability) =>
        matchesCapability(capability, query, tool),
      ),
    [inventory?.capabilities, query, tool],
  );
  const selectedCapability = inventory?.capabilities.find(
    (capability) => capability.id === selectedId,
  );
  const activeRoots = inventory?.roots.filter((root) => root.exists) ?? [];

  return (
    <main className="board skill-manager">
      <header className="toolbar skill-toolbar">
        <div>
          <p className="eyebrow">{uiText.skills.eyebrow}</p>
          <h1>{agentMeta[selectedAgent].label} · {uiText.skills.title}</h1>
          <span className="toolbar-meta">{uiText.skills.subtitle}</span>
        </div>
        <button
          className="secondary-button"
          disabled={inventoryQuery.isFetching}
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
          <section className="skill-stats" aria-label={uiText.skills.title}>
            <article>
              <span>{uiText.skills.capabilities}</span>
              <strong>{inventory.capabilityCount}</strong>
            </article>
            <article>
              <span>{uiText.skills.discoveredCopies}</span>
              <strong>{inventory.copyCount}</strong>
            </article>
            <article>
              <span>{uiText.skills.duplicateGroups}</span>
              <strong>{inventory.duplicateGroupCount}</strong>
            </article>
            <article>
              <span>{uiText.skills.invalidCopies}</span>
              <strong>{inventory.invalidCount}</strong>
            </article>
          </section>

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

          <div className="skill-read-only">
            <span>{uiText.skills.readOnly}</span>
            <span title={inventory.snapshotPath}>
              {uiText.skills.snapshot}: {inventory.snapshotPath}
            </span>
          </div>
          {inventory.snapshotError && <div className="audit-error">{inventory.snapshotError}</div>}

          <section className="skill-grid">
            {capabilities.map((capability) => (
              <button
                aria-label={uiText.skills.openDetails(capability.name)}
                className="skill-card"
                key={capability.id}
                onClick={() => setSelectedId(capability.id)}
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
                  <span>{capability.tools.join(" · ")}</span>
                  <em className={capability.health === "invalid" ? "invalid" : ""}>
                    {capability.health === "invalid"
                      ? uiText.skills.invalid
                      : uiText.skills.copyCount(capability.copyCount)}
                  </em>
                </span>
              </button>
            ))}
            {!capabilities.length && <div className="skill-state">{uiText.skills.empty}</div>}
          </section>
        </>
      )}

      {selectedCapability && (
        <section className="skill-detail-page">
          <button className="skill-detail-back" onClick={() => setSelectedId(undefined)} type="button">
            <ArrowLeft size={16} />
            {uiText.skills.backToAll}
          </button>

          <header className="skill-detail-header">
            <div>
              <span
                className={
                  selectedCapability.health === "invalid"
                    ? "status-pill invalid"
                    : "status-pill"
                }
              >
                {selectedCapability.health === "invalid"
                  ? uiText.skills.invalid
                  : uiText.skills.ready}
              </span>
              <h2>{selectedCapability.name}</h2>
              <p>{selectedCapability.description || uiText.skills.noDescription}</p>
            </div>
            <dl>
              <div>
                <dt>{uiText.skills.tools}</dt>
                <dd>{selectedCapability.tools.join(", ")}</dd>
              </div>
              <div>
                <dt>{uiText.skills.copyLocations}</dt>
                <dd>{uiText.skills.copyCount(selectedCapability.copyCount)}</dd>
              </div>
            </dl>
          </header>

          <article className="skill-markdown-panel">
            <h3>{uiText.skills.documentation}</h3>
            {selectedCapability.markdown ? (
              <div className="skill-markdown">
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
              </div>
            ) : (
              <div className="skill-state">{uiText.skills.noDocumentation}</div>
            )}
          </article>

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
        </section>
      )}
    </main>
  );
}
