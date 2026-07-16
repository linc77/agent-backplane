import {
  BotMessageSquare,
  BookOpen,
  Bot,
  Blocks,
  Home,
  SearchCheck,
} from "lucide-react";
import type { ComponentType } from "react";
import { localeOptions, type Locale, type UiText } from "../lib/i18n";
import type { MemoryView } from "../lib/memoryViews";

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
    { id: "agentManager", label: uiText.views.agentManager, icon: BotMessageSquare },
    { id: "audit", label: uiText.views.audit, icon: SearchCheck },
  ];
}

export function Sidebar({
  activeTopic,
  locale,
  uiText,
  onLocaleChange,
  onSelectTopic,
}: {
  activeTopic: MemoryView;
  locale: Locale;
  uiText: UiText;
  onLocaleChange: (locale: Locale) => void;
  onSelectTopic: (topic: MemoryView) => void;
}) {
  const topics = navItems(uiText);

  return (
    <aside className="sidebar">
      <div className="brand">
        <Bot size={22} />
        <div>
          <strong>{uiText.sidebar.brandTitle}</strong>
          <span>{uiText.sidebar.brandSubtitle}</span>
        </div>
      </div>

      <nav className="topic-nav">
        {topics.map((topic) => {
          const Icon = topic.icon;
          return (
            <button
              className={topic.id === activeTopic ? "topic-item active" : "topic-item"}
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
        <div className="language-switch" role="group" aria-label={uiText.sidebar.languageLabel}>
          {localeOptions.map((option) => (
            <button
              aria-pressed={option.locale === locale}
              className={option.locale === locale ? "language-option active" : "language-option"}
              key={option.locale}
              onClick={() => onLocaleChange(option.locale)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
