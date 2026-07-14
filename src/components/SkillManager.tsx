import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FolderOpen, RefreshCw, Search } from "lucide-react";
import { loadSkillInventory, openSourceFile } from "../lib/api";
import type { UiText } from "../lib/i18n";
import type { SkillCapability, SkillCopy } from "../lib/types";

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

export function SkillManager({ uiText }: { uiText: UiText }) {
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const inventoryQuery = useQuery({
    queryKey: ["skill-inventory"],
    queryFn: () => loadSkillInventory(),
  });

  const tools = useMemo(
    () =>
      Array.from(
        new Set(inventoryQuery.data?.capabilities.flatMap((capability) => capability.tools) ?? []),
      ).sort(),
    [inventoryQuery.data?.capabilities],
  );
  const capabilities = useMemo(
    () =>
      (inventoryQuery.data?.capabilities ?? []).filter((capability) =>
        matchesCapability(capability, query, tool),
      ),
    [inventoryQuery.data?.capabilities, query, tool],
  );
  const selectedCapability =
    capabilities.find((capability) => capability.id === selectedId) ?? capabilities[0];
  const activeRoots = inventoryQuery.data?.roots.filter((root) => root.exists) ?? [];

  return (
    <main className="board skill-manager">
      <header className="toolbar skill-toolbar">
        <div>
          <p className="eyebrow">{uiText.skills.eyebrow}</p>
          <h1>{uiText.skills.title}</h1>
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

      {inventoryQuery.data && (
        <>
          <section className="skill-stats" aria-label={uiText.skills.title}>
            <article>
              <span>{uiText.skills.capabilities}</span>
              <strong>{inventoryQuery.data.capabilityCount}</strong>
            </article>
            <article>
              <span>{uiText.skills.discoveredCopies}</span>
              <strong>{inventoryQuery.data.copyCount}</strong>
            </article>
            <article>
              <span>{uiText.skills.duplicateGroups}</span>
              <strong>{inventoryQuery.data.duplicateGroupCount}</strong>
            </article>
            <article>
              <span>{uiText.skills.invalidCopies}</span>
              <strong>{inventoryQuery.data.invalidCount}</strong>
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
            <span title={inventoryQuery.data.snapshotPath}>
              {uiText.skills.snapshot}: {inventoryQuery.data.snapshotPath}
            </span>
          </div>
          {inventoryQuery.data.snapshotError && (
            <div className="audit-error">{inventoryQuery.data.snapshotError}</div>
          )}

          <section className="skill-workspace">
            <div className="skill-list">
              {capabilities.map((capability) => (
                <button
                  className={
                    capability.id === selectedCapability?.id ? "skill-row active" : "skill-row"
                  }
                  key={capability.id}
                  onClick={() => setSelectedId(capability.id)}
                  type="button"
                >
                  <span className="skill-row-heading">
                    <strong>{capability.name}</strong>
                    <span className="skill-row-badges">
                      {capability.health === "invalid" && <AlertTriangle size={14} />}
                      <em>{uiText.skills.copyCount(capability.copyCount)}</em>
                    </span>
                  </span>
                  <span>{capability.description || uiText.skills.noDescription}</span>
                  <small>{capability.tools.join(" · ")}</small>
                </button>
              ))}
              {!capabilities.length && <div className="skill-state">{uiText.skills.empty}</div>}
            </div>

            <aside className="skill-detail">
              {selectedCapability && (
                <>
                  <div className="skill-detail-heading">
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
                    </div>
                  </div>
                  <p>{selectedCapability.description || uiText.skills.noDescription}</p>
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
                          <small>
                            {uiText.skills.resolvedPath}: {copy.resolvedPath}
                          </small>
                        )}
                        {copy.issue && <small className="skill-copy-issue">{copy.issue}</small>}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
