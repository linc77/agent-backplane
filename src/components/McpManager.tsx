import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CircleHelp,
  FolderOpen,
  Globe2,
  RadioTower,
  RefreshCw,
  Search,
  Server,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { agentMeta } from "../lib/agentScope";
import { loadMcpInventory, openSourceFile } from "../lib/api";
import type { UiText } from "../lib/i18n";
import type { AgentKind, McpServer, McpTransport } from "../lib/types";

type StateFilter = "all" | "configured" | "disabled" | "attention";

function TransportIcon({ transport }: { transport: McpTransport }) {
  if (transport === "stdio") return <Terminal size={16} />;
  if (transport === "unknown") return <CircleHelp size={16} />;
  if (transport === "ws") return <RadioTower size={16} />;
  return <Globe2 size={16} />;
}

function needsAttention(server: McpServer) {
  return server.state === "invalid" || server.state === "pending" || server.state === "rejected";
}

function matchesFilter(server: McpServer, filter: StateFilter) {
  if (filter === "all") return true;
  if (filter === "attention") return needsAttention(server);
  return server.state === filter;
}

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function endpointLabel(server: McpServer, uiText: UiText["mcp"]) {
  return server.endpointKind === "value" ? server.endpoint : uiText.endpoints[server.endpointKind];
}

export function McpManager({
  selectedAgent,
  uiText,
}: {
  selectedAgent: AgentKind;
  uiText: UiText;
}) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  useEffect(() => {
    setSearch("");
    setStateFilter("all");
  }, [selectedAgent]);
  const inventoryQuery = useQuery({
    queryKey: ["mcp-inventory", selectedAgent],
    queryFn: () => loadMcpInventory(selectedAgent),
  });
  const inventory = inventoryQuery.data;
  const generatedAt = inventory ? formattedDate(inventory.generatedAt) : "";
  const servers = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return inventory?.servers.filter((server) => {
      if (!matchesFilter(server, stateFilter)) return false;
      return !needle || [server.name, endpointLabel(server, uiText.mcp), server.scopeLabel, server.sourcePath]
        .some((value) => value.toLocaleLowerCase().includes(needle));
    }) ?? [];
  }, [inventory, search, stateFilter, uiText]);
  const configuredCount = inventory?.servers.filter((server) => server.state === "configured").length ?? 0;
  const attentionCount = (inventory?.servers.filter(needsAttention).length ?? 0)
    + (inventory?.sources.filter((source) => source.state === "invalid").length ?? 0);
  const filters: Array<{ id: StateFilter; label: string }> = [
    { id: "all", label: uiText.mcp.allFilter },
    { id: "configured", label: uiText.mcp.configuredFilter },
    { id: "disabled", label: uiText.mcp.disabledFilter },
    { id: "attention", label: uiText.mcp.attentionFilter },
  ];

  return (
    <main className="board mcp-manager">
      <header className="toolbar mcp-toolbar">
        <div>
          <p className="eyebrow">{uiText.mcp.eyebrow}</p>
          <h1>{agentMeta[selectedAgent].label} · {uiText.mcp.title}</h1>
          <span className="toolbar-meta">{uiText.mcp.subtitle}</span>
        </div>
        <button
          className="secondary-button"
          disabled={inventoryQuery.isFetching}
          onClick={() => void inventoryQuery.refetch()}
          type="button"
        >
          <RefreshCw className={inventoryQuery.isFetching ? "spinning" : ""} size={15} />
          {inventoryQuery.isFetching ? uiText.mcp.refreshing : uiText.mcp.refresh}
        </button>
      </header>

      {inventoryQuery.error && inventory && (
        <div className="inline-error" role="alert">{uiText.mcp.staleResult(generatedAt)}</div>
      )}
      {inventoryQuery.error && !inventory && (
        <div className="inline-error" role="alert">{uiText.mcp.loadFailed}</div>
      )}
      {inventoryQuery.isLoading && <div className="skill-state" role="status">{uiText.mcp.loading}</div>}

      {inventory && (
        <>
          <section className="mcp-overview" aria-label={uiText.mcp.readOnly}>
            <div className="mcp-metrics">
              <div>
                <Server size={18} />
                <span>{uiText.mcp.serverCount}</span>
                <strong>{inventory.servers.length}</strong>
              </div>
              <div>
                <span>{uiText.mcp.configuredCount}</span>
                <strong>{configuredCount}</strong>
              </div>
              <div className={attentionCount ? "attention" : ""}>
                <span>{uiText.mcp.attentionCount}</span>
                <strong>{attentionCount}</strong>
              </div>
            </div>
            <p>
              <span>{uiText.mcp.readOnly}</span>
              <span>{uiText.mcp.lastRead(generatedAt)}</span>
            </p>
          </section>

          <section className="mcp-controls">
            <label className="mcp-search">
              <Search size={15} />
              <input
                aria-label={uiText.mcp.searchPlaceholder}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={uiText.mcp.searchPlaceholder}
                type="search"
                value={search}
              />
            </label>
            <div className="mcp-state-filters" role="group" aria-label={uiText.mcp.filterLabel}>
              {filters.map((filter) => (
                <button
                  aria-pressed={stateFilter === filter.id}
                  key={filter.id}
                  onClick={() => setStateFilter(filter.id)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </section>

          <section className="mcp-server-list" aria-label={uiText.mcp.title}>
            {servers.map((server) => (
              <article className={`mcp-server-row ${server.state}`} key={server.id}>
                <span className={`mcp-transport ${server.transport}`}>
                  <TransportIcon transport={server.transport} />
                </span>
                <div className="mcp-server-copy">
                  <div>
                    <h2>{server.name}</h2>
                    <span className={`mcp-status ${server.state}`}>
                      {uiText.mcp.states[server.state]}
                    </span>
                  </div>
                  <code title={endpointLabel(server, uiText.mcp)}>
                    {endpointLabel(server, uiText.mcp)}
                  </code>
                  {server.diagnostics.length > 0 && (
                    <ul className="mcp-server-diagnostics">
                      {server.diagnostics.map((diagnostic) => (
                        <li key={diagnostic}>
                          <TriangleAlert size={12} />
                          {uiText.mcp.serverDiagnostics[diagnostic]}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mcp-server-meta">
                  <span>{uiText.mcp.transports[server.transport]}</span>
                  <span>
                    {uiText.mcp.scopes[server.scope]}
                    {server.scopeLabel ? ` · ${server.scopeLabel}` : ""}
                  </span>
                </div>
              </article>
            ))}
            {!inventory.servers.length && <div className="skill-state">{uiText.mcp.empty}</div>}
            {inventory.servers.length > 0 && !servers.length && (
              <div className="skill-state">{uiText.mcp.noMatches}</div>
            )}
          </section>

          <section className="mcp-config-sources" aria-label={uiText.mcp.configSources}>
            <h2>{uiText.mcp.configSources}</h2>
            <div>
              {inventory.sources.map((source) => (
                <article className={`mcp-config-source ${source.state}`} key={source.id}>
                  <div>
                    <span className={`mcp-source-state ${source.state}`}>
                      {uiText.mcp.sourceStates[source.state]}
                    </span>
                    <code title={source.path}>{source.path}</code>
                    <small>{uiText.mcp.sourceServerCount(source.serverCount)}</small>
                    {source.diagnostic && (
                      <small className="mcp-source-diagnostic">
                        {uiText.mcp.sourceDiagnostics[source.diagnostic]}
                      </small>
                    )}
                  </div>
                  <button
                    aria-label={`${uiText.mcp.revealSource}: ${source.path}`}
                    className="icon-button"
                    disabled={source.state === "missing"}
                    onClick={() => void openSourceFile(source.path)}
                    title={uiText.mcp.revealSource}
                    type="button"
                  >
                    <FolderOpen size={15} />
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
