import { useQuery } from "@tanstack/react-query";
import { Globe2, RefreshCw, Server, Terminal } from "lucide-react";
import { agentMeta } from "../lib/agentScope";
import { loadMcpInventory } from "../lib/api";
import type { UiText } from "../lib/i18n";
import type { AgentKind, McpTransport } from "../lib/types";

function TransportIcon({ transport }: { transport: McpTransport }) {
  return transport === "stdio" ? <Terminal size={16} /> : <Globe2 size={16} />;
}

export function McpManager({
  selectedAgent,
  uiText,
}: {
  selectedAgent: AgentKind;
  uiText: UiText;
}) {
  const inventoryQuery = useQuery({
    queryKey: ["mcp-inventory", selectedAgent],
    queryFn: () => loadMcpInventory(selectedAgent),
  });
  const inventory = inventoryQuery.data;

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
          <RefreshCw size={15} />
          {uiText.mcp.refresh}
        </button>
      </header>

      {inventoryQuery.error && <div className="inline-error">{String(inventoryQuery.error)}</div>}
      {inventoryQuery.isLoading && <div className="skill-state">{uiText.mcp.loading}</div>}

      {inventory && (
        <>
          <section className="mcp-overview">
            <div>
              <Server size={18} />
              <span>{uiText.mcp.serverCount}</span>
              <strong>{inventory.servers.length}</strong>
            </div>
            <p>{uiText.mcp.readOnly}</p>
          </section>

          <section className="mcp-server-list" aria-label={uiText.mcp.title}>
            {inventory.servers.map((server) => (
              <article className="mcp-server-row" key={server.id}>
                <span className={`mcp-transport ${server.transport}`}>
                  <TransportIcon transport={server.transport} />
                </span>
                <div className="mcp-server-copy">
                  <div>
                    <h2>{server.name}</h2>
                    <span className={server.enabled ? "mcp-status enabled" : "mcp-status"}>
                      {server.enabled ? uiText.mcp.enabled : uiText.mcp.disabled}
                    </span>
                  </div>
                  <code>{server.endpoint}</code>
                </div>
                <div className="mcp-server-meta">
                  <span>{uiText.mcp.transports[server.transport]}</span>
                  <span>
                    {server.scope === "project"
                      ? `${uiText.mcp.projectScope} · ${server.scopeLabel}`
                      : uiText.mcp.globalScope}
                  </span>
                </div>
              </article>
            ))}
            {!inventory.servers.length && <div className="skill-state">{uiText.mcp.empty}</div>}
          </section>

          <footer className="mcp-config-paths">
            <span>{uiText.mcp.configSources}</span>
            {inventory.configPaths.map((path) => <code key={path}>{path}</code>)}
          </footer>
        </>
      )}
    </main>
  );
}
