import {
  BookOpen,
  Blocks,
  Check,
  ChevronDown,
  Cable,
  Home,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { agentKinds, agentMeta } from "../lib/agentScope";
import { loadAgentConfigInventory } from "../lib/api";
import type { UiText } from "../lib/i18n";
import type { MemoryView } from "../lib/memoryViews";
import type { AgentKind } from "../lib/types";

interface TopicDef {
  id: MemoryView;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

function navItems(uiText: UiText): TopicDef[] {
  return [
    { id: "overview", label: uiText.views.overview, icon: Home },
    { id: "effective", label: uiText.views.effective, icon: BookOpen },
    { id: "skillManager", label: uiText.views.skillManager, icon: Blocks },
    { id: "mcpManager", label: uiText.views.mcpManager, icon: Cable },
  ];
}

export function Sidebar({
  activeTopic,
  selectedAgent,
  uiText,
  onManageAgent,
  onOpenSettings,
  onSelectAgent,
  onSelectTopic,
  updateAvailable,
}: {
  activeTopic: MemoryView;
  selectedAgent: AgentKind;
  uiText: UiText;
  onManageAgent: () => void;
  onOpenSettings: () => void;
  onSelectAgent: (agent: AgentKind) => void;
  onSelectTopic: (topic: MemoryView) => void;
  updateAvailable: boolean;
}) {
  const topics = navItems(uiText);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const inventoryQuery = useQuery({
    queryKey: ["agent-config-inventory"],
    queryFn: loadAgentConfigInventory,
  });
  const selectedTarget = inventoryQuery.data?.targets.find(
    (target) => target.agent === selectedAgent,
  );

  useEffect(() => {
    if (!isAgentMenuOpen) {
      return;
    }
    function handlePointerDown(event: globalThis.PointerEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setIsAgentMenuOpen(false);
      }
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAgentMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAgentMenuOpen]);

  return (
    <aside className="sidebar">
      <div className="agent-context" ref={selectorRef}>
        <button
          aria-expanded={isAgentMenuOpen}
          aria-haspopup="menu"
          className={isAgentMenuOpen ? "agent-context-trigger open" : "agent-context-trigger"}
          onClick={() => setIsAgentMenuOpen((open) => !open)}
          type="button"
        >
          <span className={`agent-mark ${selectedAgent}`}>{agentMeta[selectedAgent].mark}</span>
          <span className="agent-context-copy">
            <strong>{selectedTarget?.label ?? agentMeta[selectedAgent].label}</strong>
            <small>
              {selectedTarget?.activeModel ||
                (selectedTarget
                  ? selectedTarget.installed
                    ? uiText.agents.installed
                    : uiText.agents.notInstalled
                  : inventoryQuery.isLoading
                    ? uiText.agents.loading
                    : uiText.agents.notInstalled)}
            </small>
          </span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>

        {isAgentMenuOpen && (
          <div
            aria-label={uiText.sidebar.agentMenuLabel}
            className="agent-context-menu"
            role="menu"
          >
            <span className="agent-context-menu-label">{uiText.sidebar.currentAgent}</span>
            {agentKinds.map((agent) => {
              const target = inventoryQuery.data?.targets.find((item) => item.agent === agent);
              const isSelected = agent === selectedAgent;
              return (
                <button
                  aria-checked={isSelected}
                  className={isSelected ? "agent-context-option active" : "agent-context-option"}
                  key={agent}
                  onClick={() => {
                    onSelectAgent(agent);
                    setIsAgentMenuOpen(false);
                  }}
                  role="menuitemradio"
                  type="button"
                >
                  <span className={`agent-mark ${agent}`}>{agentMeta[agent].mark}</span>
                  <span>
                    <strong>{target?.label ?? agentMeta[agent].label}</strong>
                    <small>
                      {target
                        ? target.installed
                          ? uiText.agents.installed
                          : uiText.agents.notInstalled
                        : inventoryQuery.isLoading
                          ? uiText.agents.loading
                          : uiText.agents.notInstalled}
                    </small>
                  </span>
                  {isSelected && <Check aria-hidden="true" size={15} />}
                </button>
              );
            })}
            <button
              className="agent-context-manage"
              onClick={() => {
                onManageAgent();
                setIsAgentMenuOpen(false);
              }}
              role="menuitem"
              type="button"
            >
              <Settings2 aria-hidden="true" size={15} />
              {uiText.sidebar.manageAgent}
            </button>
          </div>
        )}
      </div>

      <nav className="topic-nav">
        {topics.map((topic) => {
          const Icon = topic.icon;
          return (
            <button
              className={
                topic.id === activeTopic || (topic.id === "effective" && activeTopic === "audit")
                  ? "topic-item active"
                  : "topic-item"
              }
              key={topic.id}
              onClick={() => onSelectTopic(topic.id)}
              type="button"
            >
              <Icon size={17} />
              <span>{topic.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          aria-current={activeTopic === "settings" ? "page" : undefined}
          className={activeTopic === "settings" ? "settings-button active" : "settings-button"}
          onClick={onOpenSettings}
          type="button"
        >
          <Settings2 aria-hidden="true" size={16} />
          <span>{uiText.sidebar.settings}</span>
          {updateAvailable && (
            <span className="settings-update-badge">{uiText.sidebar.updateAvailable}</span>
          )}
        </button>
      </div>
    </aside>
  );
}
