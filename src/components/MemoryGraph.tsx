import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { hierarchy, packEnclose, packSiblings, tree } from "d3-hierarchy";
import {
  BrainCircuit,
  ExternalLink,
  FileText,
  FolderOpen,
  Layers3,
  PencilLine,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { UiText } from "../lib/i18n";
import {
  sourceForEntry,
  truthItemForEvidence,
  type MemoryTruthModel,
  type MemoryTruthStatus,
} from "../lib/memoryTruth";
import {
  memoryEvidenceTrustStatus,
  memoryProfileSectionState,
  memoryTruthDisplayText,
  type ProfileSectionState,
} from "../lib/memoryReview";
import type {
  MemoryEntry,
  MemoryProfile,
  MemoryProfileSection,
  MemorySource,
  MemoryTopic,
} from "../lib/types";

type MemoryGraphLayout = "radial" | "cluster" | "tree";
type MemoryGraphTheme = "amber" | "ocean" | "violet" | "light";
type MemoryGraphNodeKind = "root" | "group" | "section" | "evidence";

type MemoryGraphNodeData = Record<string, unknown> & {
  kind: MemoryGraphNodeKind;
  label: string;
  caption: string;
  status?: ProfileSectionState | MemoryTruthStatus;
  sectionId?: string;
  entryId?: string;
  expanded?: boolean;
};

type MemoryFlowNode = Node<MemoryGraphNodeData, "memoryGraphNode">;

interface LayoutDatum {
  id: string;
  children?: LayoutDatum[];
}

interface Point {
  x: number;
  y: number;
}

interface PositionedGroup {
  id: string;
  label: string;
  count: number;
  point: Point;
  size: number;
}

interface GraphPositions {
  root: Point | null;
  sections: Map<string, Point>;
  evidence: Map<string, Point>;
  groups: PositionedGroup[];
}

const ROOT_NODE_ID = "memory-root";
const ROOT_SIZE = 142;
const SECTION_WIDTH = 220;
const SECTION_HEIGHT = 116;
const EVIDENCE_WIDTH = 218;
const EVIDENCE_HEIGHT = 96;
const SECTION_RADIUS = 360;
const EVIDENCE_DISTANCE = 230;

const graphThemeDots: Record<MemoryGraphTheme, string> = {
  amber: "#394048",
  ocean: "#24435d",
  violet: "#46365d",
  light: "#c8d0dc",
};

const handlePositions = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
] as const;

function MemoryGraphNode({ data }: NodeProps<MemoryFlowNode>) {
  const Icon = data.kind === "root"
    ? BrainCircuit
    : data.kind === "group"
      ? FolderOpen
      : data.kind === "section"
        ? Layers3
        : FileText;

  return (
    <div className={`memory-flow-node ${data.kind} ${data.status ?? ""}`}>
      {handlePositions.map(([id, position]) => (
        <Handle
          className="memory-flow-handle"
          id={`target-${id}`}
          isConnectable={false}
          key={`target-${id}`}
          position={position}
          type="target"
        />
      ))}
      <span className="memory-flow-node-icon">
        <Icon aria-hidden="true" size={data.kind === "root" ? 27 : 17} />
      </span>
      <strong>{data.label}</strong>
      <span className="memory-flow-node-caption">{data.caption}</span>
      {data.kind === "section" && data.expanded && (
        <span className="memory-flow-expanded-dot" aria-hidden="true" />
      )}
      {handlePositions.map(([id, position]) => (
        <Handle
          className="memory-flow-handle"
          id={`source-${id}`}
          isConnectable={false}
          key={`source-${id}`}
          position={position}
          type="source"
        />
      ))}
    </div>
  );
}

const nodeTypes = { memoryGraphNode: MemoryGraphNode };

function polarPoint(angle: number, radius: number): Point {
  return {
    x: Math.cos(angle - Math.PI / 2) * radius,
    y: Math.sin(angle - Math.PI / 2) * radius,
  };
}

function positionFromCenter(point: Point, width: number, height: number) {
  return { x: point.x - width / 2, y: point.y - height / 2 };
}

function sideForVector(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function oppositeSide(side: string) {
  if (side === "left") return "right";
  if (side === "right") return "left";
  if (side === "top") return "bottom";
  return "top";
}

function graphEdge(
  id: string,
  source: string,
  target: string,
  sourcePoint: Point,
  targetPoint: Point,
  active = false,
): Edge {
  const sourceSide = sideForVector(sourcePoint, targetPoint);
  return {
    id,
    source,
    target,
    sourceHandle: `source-${sourceSide}`,
    targetHandle: `target-${oppositeSide(sourceSide)}`,
    type: "bezier",
    animated: active,
    className: active ? "memory-flow-edge active" : "memory-flow-edge",
  };
}

function evidenceKey(sectionId: string, entryId: string) {
  return `${sectionId}:${entryId}`;
}

function radialPositions(profile: MemoryProfile, expandedSectionId: string | null): GraphPositions {
  const sections = new Map<string, Point>();
  const evidence = new Map<string, Point>();
  const rootLayout = tree<LayoutDatum>().size([Math.PI * 2, SECTION_RADIUS])(
    hierarchy<LayoutDatum>({
      id: ROOT_NODE_ID,
      children: profile.sections.map((section) => ({ id: section.id })),
    }),
  );
  const sectionAngles = new Map<string, number>();

  for (const child of rootLayout.children ?? []) {
    sectionAngles.set(child.data.id, child.x);
    sections.set(child.data.id, polarPoint(child.x, child.y));
  }

  const expanded = profile.sections.find((section) => section.id === expandedSectionId);
  const baseAngle = expanded ? sectionAngles.get(expanded.id) : undefined;
  if (expanded && baseAngle !== undefined && expanded.evidence.length > 0) {
    const spread = Math.min(Math.PI * 0.9, Math.max(Math.PI * 0.24, expanded.evidence.length * 0.2));
    const evidenceLayout = tree<LayoutDatum>().size([spread, EVIDENCE_DISTANCE])(
      hierarchy<LayoutDatum>({
        id: expanded.id,
        children: expanded.evidence.map((item) => ({ id: item.entryId })),
      }),
    );
    for (const child of evidenceLayout.children ?? []) {
      const angle = baseAngle - spread / 2 + child.x;
      evidence.set(evidenceKey(expanded.id, child.data.id), polarPoint(angle, SECTION_RADIUS + child.y));
    }
  }

  return { root: { x: 0, y: 0 }, sections, evidence, groups: [] };
}

function treePositions(profile: MemoryProfile, expandedSectionId: string | null): GraphPositions {
  const sections = new Map<string, Point>();
  const evidence = new Map<string, Point>();
  const layout = tree<LayoutDatum>().nodeSize([132, 340])(
    hierarchy<LayoutDatum>({
      id: ROOT_NODE_ID,
      children: profile.sections.map((section) => ({
        id: section.id,
        children: section.id === expandedSectionId
          ? section.evidence.map((item) => ({ id: item.entryId }))
          : undefined,
      })),
    }),
  );

  for (const node of layout.descendants()) {
    const point = { x: node.y - 340, y: node.x };
    if (node.depth === 1) {
      sections.set(node.data.id, point);
    } else if (node.depth === 2 && node.parent) {
      evidence.set(evidenceKey(node.parent.data.id, node.data.id), point);
    }
  }

  return { root: { x: -340, y: 0 }, sections, evidence, groups: [] };
}

function sectionTopic(section: MemoryProfileSection, truth: MemoryTruthModel): MemoryTopic {
  const counts = new Map<MemoryTopic, number>();
  for (const evidence of section.evidence) {
    const topic = truthItemForEvidence(truth, evidence)?.entry.topic;
    if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "profile";
}

function clusterPositions(
  profile: MemoryProfile,
  expandedSectionId: string | null,
  truth: MemoryTruthModel,
  uiText: UiText,
): GraphPositions {
  const grouped = new Map<MemoryTopic, MemoryProfileSection[]>();
  for (const section of profile.sections) {
    const topic = sectionTopic(section, truth);
    grouped.set(topic, [...(grouped.get(topic) ?? []), section]);
  }

  const packedGroups = [...grouped.entries()].map(([topic, topicSections]) => {
    const circles = topicSections.map((section) => ({
      sectionId: section.id,
      x: 0,
      y: 0,
      r: 118,
    }));
    packSiblings(circles);
    const enclosure = packEnclose(circles);
    return {
      topic,
      topicSections,
      circles,
      enclosure,
      x: 0,
      y: 0,
      r: enclosure.r + 42,
    };
  });
  packSiblings(packedGroups);

  const sections = new Map<string, Point>();
  const evidence = new Map<string, Point>();
  const groups: PositionedGroup[] = packedGroups.map((group) => {
    for (const circle of group.circles) {
      sections.set(circle.sectionId, {
        x: group.x + circle.x - group.enclosure.x,
        y: group.y + circle.y - group.enclosure.y,
      });
    }
    return {
      id: `group:${group.topic}`,
      label: uiText.memoryCards[group.topic],
      count: group.topicSections.length,
      point: { x: group.x, y: group.y },
      size: group.r * 2,
    };
  });

  const expanded = profile.sections.find((section) => section.id === expandedSectionId);
  const sectionPoint = expanded ? sections.get(expanded.id) : undefined;
  if (expanded && sectionPoint && expanded.evidence.length > 0) {
    const outwardAngle = sectionPoint.x === 0 && sectionPoint.y === 0
      ? 0
      : Math.atan2(sectionPoint.y, sectionPoint.x) + Math.PI / 2;
    const spread = Math.min(Math.PI * 0.8, Math.max(Math.PI * 0.24, expanded.evidence.length * 0.2));
    const evidenceLayout = tree<LayoutDatum>().size([spread, EVIDENCE_DISTANCE])(
      hierarchy<LayoutDatum>({
        id: expanded.id,
        children: expanded.evidence.map((item) => ({ id: item.entryId })),
      }),
    );
    for (const child of evidenceLayout.children ?? []) {
      const offset = polarPoint(outwardAngle - spread / 2 + child.x, child.y);
      evidence.set(evidenceKey(expanded.id, child.data.id), {
        x: sectionPoint.x + offset.x,
        y: sectionPoint.y + offset.y,
      });
    }
  }

  return { root: null, sections, evidence, groups };
}

function buildGraph({
  agentLabel,
  expandedSectionId,
  layout,
  profile,
  sources,
  truth,
  uiText,
}: {
  agentLabel: string;
  expandedSectionId: string | null;
  layout: MemoryGraphLayout;
  profile: MemoryProfile;
  sources: MemorySource[];
  truth: MemoryTruthModel;
  uiText: UiText;
}) {
  const positions = layout === "radial"
    ? radialPositions(profile, expandedSectionId)
    : layout === "tree"
      ? treePositions(profile, expandedSectionId)
      : clusterPositions(profile, expandedSectionId, truth, uiText);
  const nodes: MemoryFlowNode[] = positions.groups.map((group) => ({
    id: group.id,
    type: "memoryGraphNode",
    position: positionFromCenter(group.point, group.size, group.size),
    style: { width: group.size, height: group.size },
    data: {
      kind: "group",
      label: group.label,
      caption: uiText.memorySummary.graphGroupCount(group.count),
    },
    ariaLabel: `${group.label} · ${uiText.memorySummary.graphGroupCount(group.count)}`,
    draggable: false,
    selectable: false,
    zIndex: -1,
  }));
  if (positions.root) {
    nodes.push({
      id: ROOT_NODE_ID,
      type: "memoryGraphNode",
      position: positionFromCenter(positions.root, ROOT_SIZE, ROOT_SIZE),
      style: { width: ROOT_SIZE, height: ROOT_SIZE },
      data: {
        kind: "root",
        label: uiText.memorySummary.graphRootLabel(agentLabel),
        caption: uiText.memorySummary.graphRootCaption(
          profile.sections.length,
          profile.metadata.currentEntries,
        ),
      },
      ariaLabel: uiText.memorySummary.graphRootLabel(agentLabel),
    });
  }
  const edges: Edge[] = [];

  for (const section of profile.sections) {
    const sectionPoint = positions.sections.get(section.id);
    if (!sectionPoint) continue;
    const sectionNodeId = `section:${section.id}`;
    const state = memoryProfileSectionState(section, sources, truth);
    nodes.push({
      id: sectionNodeId,
      type: "memoryGraphNode",
      position: positionFromCenter(sectionPoint, SECTION_WIDTH, SECTION_HEIGHT),
      style: { width: SECTION_WIDTH, height: SECTION_HEIGHT },
      data: {
        kind: "section",
        label: section.title,
        caption: uiText.memorySummary.evidenceCount(section.evidence.length),
        status: state,
        sectionId: section.id,
        expanded: expandedSectionId === section.id,
      },
      ariaLabel: `${section.title} · ${uiText.memorySummary.sectionState[state]}`,
    });
    if (positions.root) {
      edges.push(graphEdge(
        `edge:root:${section.id}`,
        ROOT_NODE_ID,
        sectionNodeId,
        positions.root,
        sectionPoint,
        expandedSectionId === section.id,
      ));
    }

    if (expandedSectionId !== section.id || section.evidence.length === 0) continue;
    for (const evidence of section.evidence) {
      const point = positions.evidence.get(evidenceKey(section.id, evidence.entryId));
      if (!point) continue;
      const nodeId = `evidence:${section.id}:${evidence.entryId}`;
      const truthItem = truthItemForEvidence(truth, evidence);
      const source = sources.find((item) => item.relativePath === evidence.sourcePath);
      const status = memoryEvidenceTrustStatus(evidence, source, truth);
      nodes.push({
        id: nodeId,
        type: "memoryGraphNode",
        position: positionFromCenter(point, EVIDENCE_WIDTH, EVIDENCE_HEIGHT),
        style: { width: EVIDENCE_WIDTH, height: EVIDENCE_HEIGHT },
        data: {
          kind: "evidence",
          label: evidence.summary,
          caption: truthItem
            ? uiText.memoryCards[truthItem.entry.topic]
            : uiText.memorySummary.unknownSource,
          status,
          sectionId: section.id,
          entryId: evidence.entryId,
        },
        ariaLabel: `${evidence.summary} · ${uiText.memorySummary.evidenceTrust[status]}`,
      });
      edges.push(
        graphEdge(
          `edge:${section.id}:${evidence.entryId}`,
          sectionNodeId,
          nodeId,
          sectionPoint,
          point,
          true,
        ),
      );
    }
  }

  return { edges, nodes };
}

function GraphInspector({
  expandedSectionId,
  onDraftEntryCorrection,
  onDraftProfileCorrection,
  onOpenSource,
  onToggleSection,
  profile,
  profileStale,
  regenerating,
  selectedNode,
  sources,
  truth,
  uiText,
  writable,
}: {
  expandedSectionId: string | null;
  onDraftEntryCorrection: (entry: MemoryEntry) => void;
  onDraftProfileCorrection: (section: MemoryProfileSection) => void;
  onOpenSource: (path: string) => void;
  onToggleSection: (sectionId: string) => void;
  profile: MemoryProfile;
  profileStale: boolean;
  regenerating: boolean;
  selectedNode: MemoryFlowNode | undefined;
  sources: MemorySource[];
  truth: MemoryTruthModel;
  uiText: UiText;
  writable: boolean;
}) {
  const data = selectedNode?.data;
  const section = data?.sectionId
    ? profile.sections.find((item) => item.id === data.sectionId)
    : undefined;
  const evidence = section && data?.entryId
    ? section.evidence.find((item) => item.entryId === data.entryId)
    : undefined;
  const truthItem = evidence ? truthItemForEvidence(truth, evidence) : undefined;
  const entry = truthItem?.entry;
  const source = entry
    ? sourceForEntry(sources, entry)
    : evidence
      ? sources.find((item) => item.relativePath === evidence.sourcePath)
      : undefined;

  if (!data || data.kind === "root") {
    return null;
  }

  if (data.kind === "section" && section) {
    const state = memoryProfileSectionState(section, sources, truth);
    const expanded = expandedSectionId === section.id;
    return (
      <aside aria-label={uiText.memorySummary.graphInspectorLabel} className="memory-graph-inspector">
        <span className={`profile-state ${state}`}>
          {uiText.memorySummary.sectionState[state]}
        </span>
        <h2>{section.title}</h2>
        <p>{section.body}</p>
        <div className="memory-graph-certainty">
          <span>{uiText.memorySummary.stability[section.stability]}</span>
          <span>{uiText.memorySummary.confidence[section.confidence]}</span>
          <span>{uiText.memorySummary.evidenceCount(section.evidence.length)}</span>
        </div>
        <div className="memory-graph-inspector-actions">
          <button className="memory-graph-primary-action" onClick={() => onToggleSection(section.id)} type="button">
            <Layers3 aria-hidden="true" size={14} />
            {expanded
              ? uiText.memorySummary.graphCollapseEvidence
              : uiText.memorySummary.graphExpandEvidence(section.evidence.length)}
          </button>
          {writable && (
            <button
              disabled={profileStale || regenerating}
              onClick={() => onDraftProfileCorrection(section)}
              type="button"
            >
              <PencilLine aria-hidden="true" size={14} />
              {uiText.memorySummary.editMemory}
            </button>
          )}
        </div>
      </aside>
    );
  }

  if (data.kind === "evidence" && section && evidence) {
    const status = memoryEvidenceTrustStatus(evidence, source, truth);
    const displayText = truthItem ? memoryTruthDisplayText(truthItem, uiText) : undefined;
    return (
      <aside aria-label={uiText.memorySummary.graphInspectorLabel} className="memory-graph-inspector">
        <span className={`evidence-status ${status}`}>
          {uiText.memorySummary.evidenceTrust[status]}
        </span>
        <h2>{evidence.summary}</h2>
        {entry && (
          <div className="memory-graph-original">
            <span>{uiText.memorySummary.graphOriginalMemory}</span>
            <strong>{entry.title}</strong>
            <p>{entry.summary}</p>
          </div>
        )}
        {truthItem && (
          <div className={`memory-graph-decision ${truthItem.status}`}>
            <strong>{uiText.inspector.decisionPath}</strong>
            <span>
              {uiText.truthStatuses[truthItem.status]} · {Math.round(truthItem.confidence * 100)}%
            </span>
            <p>{displayText?.decision}</p>
            {displayText?.reviewReason && (
              <>
                <strong>{uiText.inspector.reviewReason}</strong>
                <p>{displayText.reviewReason}</p>
              </>
            )}
          </div>
        )}
        <div className="memory-graph-inspector-actions">
          {source && (
            <button onClick={() => onOpenSource(source.path)} type="button">
              <ExternalLink aria-hidden="true" size={14} />
              {uiText.memorySummary.graphOpenSource}
            </button>
          )}
          {writable && entry && (
            <button onClick={() => onDraftEntryCorrection(entry)} type="button">
              <PencilLine aria-hidden="true" size={14} />
              {uiText.memorySummary.editMemory}
            </button>
          )}
        </div>
        <span className="memory-graph-source-path">
          {uiText.format.evidence(evidence.sourcePath, evidence.startLine, evidence.endLine)}
        </span>
      </aside>
    );
  }

  return null;
}

function MemoryGraphCanvas({
  agentLabel,
  onDraftEntryCorrection,
  onDraftProfileCorrection,
  onOpenSource,
  profile,
  profileStale,
  regenerating,
  sources,
  truth,
  uiText,
  writable,
}: MemoryGraphProps) {
  const [layout, setLayout] = useState<MemoryGraphLayout>("radial");
  const [theme, setTheme] = useState<MemoryGraphTheme>("light");
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState(ROOT_NODE_ID);
  const graph = useMemo(
    () => buildGraph({ agentLabel, expandedSectionId, layout, profile, sources, truth, uiText }),
    [agentLabel, expandedSectionId, layout, profile, sources, truth, uiText],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<MemoryFlowNode>(graph.nodes);
  const { fitView } = useReactFlow<MemoryFlowNode>();

  useEffect(() => {
    setNodes(graph.nodes);
  }, [graph.nodes, setNodes]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void fitView({ duration: 320, maxZoom: 1.05, padding: 0.16 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expandedSectionId, fitView, layout, profile.sourceHash]);

  useEffect(() => {
    if (!graph.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(ROOT_NODE_ID);
    }
  }, [graph.nodes, selectedNodeId]);

  function toggleSection(sectionId: string) {
    setExpandedSectionId((current) => current === sectionId ? null : sectionId);
    setSelectedNodeId(`section:${sectionId}`);
  }

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId);
  const renderedNodes = nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId }));

  return (
    <section
      className={`memory-graph-shell theme-${theme}`}
      aria-label={uiText.memorySummary.graphLabel}
    >
      <div className="memory-graph-canvas">
        <ReactFlow<MemoryFlowNode>
          colorMode={theme === "light" ? "light" : "dark"}
          edges={graph.edges}
          fitView
          fitViewOptions={{ maxZoom: 1.05, padding: 0.16 }}
          maxZoom={1.7}
          minZoom={0.4}
          nodeTypes={nodeTypes}
          nodes={renderedNodes}
          nodesConnectable={false}
          onNodeClick={(_, node) => {
            if (node.data.kind === "group") return;
            setSelectedNodeId(node.id);
            if (node.data.kind === "section" && node.data.sectionId) {
              setExpandedSectionId((current) =>
                current === node.data.sectionId ? null : node.data.sectionId!,
              );
            }
          }}
          onNodesChange={onNodesChange}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={graphThemeDots[theme]} gap={18} size={1.15} variant={BackgroundVariant.Dots} />
          <Panel className="memory-graph-layout-panel" position="top-left">
            <div className="memory-graph-panel-row">
              <span>{uiText.memorySummary.graphLayoutLabel}</span>
              <div aria-label={uiText.memorySummary.graphLayoutLabel} role="group">
                {([
                  ["radial", uiText.memorySummary.graphRadialLayout],
                  ["cluster", uiText.memorySummary.graphClusterLayout],
                  ["tree", uiText.memorySummary.graphTreeLayout],
                ] as const).map(([value, label]) => (
                  <button
                    aria-pressed={layout === value}
                    className={layout === value ? "active" : ""}
                    key={value}
                    onClick={() => setLayout(value)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="memory-graph-panel-row theme-row">
              <span>{uiText.memorySummary.graphThemeLabel}</span>
              <div aria-label={uiText.memorySummary.graphThemeLabel} role="group">
                {([
                  ["amber", uiText.memorySummary.graphAmberTheme],
                  ["ocean", uiText.memorySummary.graphOceanTheme],
                  ["violet", uiText.memorySummary.graphVioletTheme],
                  ["light", uiText.memorySummary.graphLightTheme],
                ] as const).map(([value, label]) => (
                  <button
                    aria-label={label}
                    aria-pressed={theme === value}
                    className={`memory-graph-theme-swatch ${value}${theme === value ? " active" : ""}`}
                    key={value}
                    onClick={() => setTheme(value)}
                    title={label}
                    type="button"
                  >
                    <span aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>
      <GraphInspector
        expandedSectionId={expandedSectionId}
        onDraftEntryCorrection={onDraftEntryCorrection}
        onDraftProfileCorrection={onDraftProfileCorrection}
        onOpenSource={onOpenSource}
        onToggleSection={toggleSection}
        profile={profile}
        profileStale={profileStale}
        regenerating={regenerating}
        selectedNode={selectedNode}
        sources={sources}
        truth={truth}
        uiText={uiText}
        writable={writable}
      />
    </section>
  );
}

interface MemoryGraphProps {
  agentLabel: string;
  onDraftEntryCorrection: (entry: MemoryEntry) => void;
  onDraftProfileCorrection: (section: MemoryProfileSection) => void;
  onOpenSource: (path: string) => void;
  profile: MemoryProfile;
  profileStale: boolean;
  regenerating: boolean;
  sources: MemorySource[];
  truth: MemoryTruthModel;
  uiText: UiText;
  writable: boolean;
}

export function MemoryGraph(props: MemoryGraphProps) {
  return (
    <ReactFlowProvider>
      <MemoryGraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
