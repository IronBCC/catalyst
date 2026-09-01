import { LlmBranchItem, LlmGraph } from "@/lib/schema";
import type { z } from "zod";
import type {
  Confidence,
  Edge,
  EventNode,
  GenerateInput,
  Graph,
  Node,
  NumericNode,
  Source,
} from "@/lib/schema";
import { breakCycles } from "@/lib/engine/topo";

type RawGraph = z.infer<typeof LlmGraph>;
type RawNode = RawGraph["nodes"][number];
type RawEdge = RawGraph["edges"][number];
type RawBranchItem = z.infer<typeof LlmBranchItem>;

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const confidence = (value: unknown): Confidence =>
  value === "low" || value === "medium" || value === "high" ? value : "medium";

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const prefixed = /^[a-z]/.test(slug) ? slug : `n-${slug}`;
  return prefixed.slice(0, 64).replace(/-+$/g, "") || "n";
}

function uniqueId(value: string, used: Set<string>) {
  const base = slugify(value);
  let id = base;
  for (let suffix = 2; used.has(id); suffix += 1) {
    const tail = `-${suffix}`;
    id = `${base.slice(0, 64 - tail.length).replace(/-+$/g, "") || "n"}${tail}`;
  }
  used.add(id);
  return id;
}

function lagDays(value: unknown): [number, number] {
  const days = Array.isArray(value) ? value : [];
  return [Math.max(0, finite(days[0], 0)), Math.max(0, finite(days[1], 0))];
}

function repairNode(raw: RawNode, id: string): Node {
  if (raw.kind === "event") {
    return {
      id,
      kind: "event",
      statement: text(raw.statement, id),
      resolution: text(raw.resolution, id),
      base: clamp(finite(raw.base, 0.5), 0, 1),
      lagDays: lagDays(raw.lagDays),
      rationale: text(raw.rationale),
      analogs: strings(raw.analogs),
      assumptions: strings(raw.assumptions),
      confidence: confidence(raw.confidence),
      marketQuery: text(raw.marketQuery),
      isRoot: raw.isRoot === true,
      isTarget: raw.isTarget === true,
    };
  }
  return {
    id,
    kind: "numeric",
    name: text(raw.name, id),
    unit: text(raw.unit, "%"),
    ticker: typeof raw.ticker === "string" ? raw.ticker : null,
    current: typeof raw.current === "number" && Number.isFinite(raw.current) ? raw.current : null,
    baselineMove: clamp(finite(raw.baselineMove, 0), -100, 100),
    sigma: clamp(finite(raw.sigma, 0), 0, 200),
    rationale: text(raw.rationale),
    assumptions: strings(raw.assumptions),
    confidence: confidence(raw.confidence),
  };
}

function repairNodes(rawNodes: RawNode[]) {
  const used = new Set<string>();
  const ids = new Map<string, string>();
  const nodes = rawNodes.map((raw) => {
    const id = uniqueId(raw.id, used);
    if (!ids.has(raw.id)) ids.set(raw.id, id);
    const slug = slugify(raw.id);
    if (!ids.has(slug)) ids.set(slug, id);
    return repairNode(raw, id);
  });
  return { nodes, ids, used };
}

const edgeWeight = (edge: Edge) => {
  if (edge.kind === "ee" || edge.kind === "ne") return edge.strength;
  if (edge.kind === "en") return Math.abs(edge.impact);
  return Math.abs(edge.beta);
};

function repairEdge(
  raw: RawEdge,
  nodes: Map<string, Node>,
  ids: Map<string, string>,
  knownSources: Set<string>,
): Edge | null {
  const source = ids.get(raw.source) ?? ids.get(slugify(raw.source));
  const target = ids.get(raw.target) ?? ids.get(slugify(raw.target));
  if (!source || !target || source === target) return null;
  const sourceNode = nodes.get(source);
  const targetNode = nodes.get(target);
  if (!sourceNode || !targetNode) return null;
  const sourceIds = strings(raw.sourceIds).filter((id) => knownSources.has(id));
  const base = {
    id: `${source}->${target}`,
    source,
    target,
    mechanism: text(raw.mechanism),
    assumptions: strings(raw.assumptions),
    confidence: confidence(raw.confidence),
    support: sourceIds.length > 0 ? ("evidence" as const) : ("model_assumption" as const),
    sourceIds,
  };

  if (sourceNode.kind === "event" && targetNode.kind === "event") {
    return {
      ...base,
      kind: "ee",
      polarity: raw.polarity === "inhibit" ? "inhibit" : "promote",
      strength: clamp(finite(raw.strength, 0.5), 0, 1),
    };
  }
  if (sourceNode.kind === "event" && targetNode.kind === "numeric") {
    if (typeof raw.impact !== "number" || !Number.isFinite(raw.impact)) return null;
    return { ...base, kind: "en", impact: clamp(raw.impact, -100, 100) };
  }
  if (sourceNode.kind === "numeric" && targetNode.kind === "numeric") {
    if (typeof raw.beta !== "number" || !Number.isFinite(raw.beta)) return null;
    return { ...base, kind: "nn", beta: clamp(raw.beta, -10, 10) };
  }
  if (typeof raw.threshold !== "number" || !Number.isFinite(raw.threshold)) return null;
  return {
    ...base,
    kind: "ne",
    threshold: raw.threshold,
    direction: raw.direction === "below" ? "below" : "above",
    width:
      typeof raw.width === "number" && Number.isFinite(raw.width)
        ? Math.max(0, raw.width)
        : Math.max(1, 0.1 * Math.abs(raw.threshold)),
    strength: clamp(finite(raw.strength, 0.5), 0, 1),
  };
}

function repairEdges(rawEdges: RawEdge[], nodes: Node[], ids: Map<string, string>, sources: Source[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const knownSources = new Set(sources.map((source) => source.id));
  const edges = rawEdges.flatMap((raw) => {
    const edge = repairEdge(raw, nodeMap, ids, knownSources);
    return edge ? [edge] : [];
  });
  return breakCycles(
    nodes.map((node) => node.id),
    edges,
    edgeWeight,
  ).edges;
}

function syntheticEvent(id: string, statement: string, base: number, isRoot: boolean, isTarget: boolean): EventNode {
  return {
    id,
    kind: "event",
    statement,
    resolution: statement,
    base,
    lagDays: [0, 0],
    rationale: "Synthesized to complete the causal graph.",
    analogs: [],
    assumptions: [],
    confidence: "low",
    marketQuery: "",
    isRoot,
    isTarget,
  };
}

function ensureRoot(nodes: Node[], used: Set<string>, hypothesis: string) {
  let events = nodes.filter((node): node is EventNode => node.kind === "event");
  if (events.length === 0) {
    const root = syntheticEvent(uniqueId("root", used), hypothesis, 0.5, true, false);
    nodes = [...nodes, root];
    events = [root];
  }
  const rootId = events.find((node) => node.isRoot)?.id ?? events[0].id;
  return {
    nodes: nodes.map((node) => (node.kind === "event" ? { ...node, isRoot: node.id === rootId } : node)),
    rootId,
  };
}

const tokens = (value: string) => new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);

function jaccard(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  return [...left].filter((token) => right.has(token)).length / union.size;
}

function ensureChainTarget(nodes: Node[], edges: Edge[], used: Set<string>, input: GenerateInput, rootId: string) {
  if (input.mode !== "chain") return { nodes, edges };
  const events = nodes.filter((node): node is EventNode => node.kind === "event");
  let target = events.find((node) => node.isTarget);
  if (!target && input.target) {
    const targetTokens = tokens(input.target);
    let score = 0;
    for (const event of events) {
      const candidate = jaccard(targetTokens, tokens(event.statement));
      if (candidate > score) {
        target = event;
        score = candidate;
      }
    }
  }
  if (!target) {
    const statement = input.target ?? "Target event";
    target = syntheticEvent(uniqueId(input.target ?? "target", used), statement, 0.3, false, true);
    nodes = [...nodes, target];
    edges = [
      ...edges,
      {
        id: `${rootId}->${target.id}`,
        source: rootId,
        target: target.id,
        mechanism: "Synthesized chain link",
        assumptions: [],
        confidence: "low",
        support: "model_assumption",
        sourceIds: [],
        kind: "ee",
        polarity: "promote",
        strength: 0.3,
      },
    ];
  }
  return {
    nodes: nodes.map((node) => (node.kind === "event" ? { ...node, isTarget: node.id === target.id } : node)),
    edges,
  };
}

export function repairGraph(llm: z.infer<typeof LlmGraph>, input: GenerateInput, model: string): Graph {
  const repaired = repairNodes(llm.nodes);
  const rooted = ensureRoot(repaired.nodes, repaired.used, input.hypothesis);
  const edges = repairEdges(llm.edges, rooted.nodes, repaired.ids, []);
  const chained = ensureChainTarget(rooted.nodes, edges, repaired.used, input, rooted.rootId);
  const acyclic = breakCycles(
    chained.nodes.map((node) => node.id),
    chained.edges,
    edgeWeight,
  ).edges;

  return {
    id: crypto.randomUUID(),
    hypothesis: input.hypothesis,
    mode: input.mode,
    target: input.target,
    horizonDays: input.horizonDays,
    nodes: chained.nodes,
    edges: acyclic,
    sources: [],
    model,
    generatedAt: new Date().toISOString(),
    summary: llm.summary,
  };
}

export function repairBranch(
  item: z.infer<typeof LlmBranchItem>,
  graph: Graph,
): { node: Node; edges: Edge[] } {
  const used = new Set(graph.nodes.map((node) => node.id));
  const node = repairNode(item.node, uniqueId(item.node.id, used));
  const nodes = [...graph.nodes, node];
  const ids = new Map(graph.nodes.map((existing) => [existing.id, existing.id]));
  ids.set(item.node.id, node.id);
  ids.set(slugify(item.node.id), node.id);
  const candidates = repairEdges(item.edges, nodes, ids, graph.sources);
  const accepted: Edge[] = [];
  let combined = [...graph.edges];
  for (const candidate of candidates) {
    const result = breakCycles(
      nodes.map((entry) => entry.id),
      [...combined, candidate],
      edgeWeight,
    );
    if (result.removed.length > 0) continue;
    combined = [...combined, candidate];
    accepted.push(candidate);
  }
  return { node, edges: accepted };
}

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const optionalNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

function draftNode(value: unknown): RawNode | null {
  const raw = object(value);
  if (!raw || typeof raw.id !== "string") return null;
  if (raw.kind === "event" && typeof raw.statement === "string") {
    return {
      id: raw.id,
      kind: "event",
      statement: raw.statement,
      resolution: text(raw.resolution, raw.statement),
      base: clamp(finite(raw.base, 0.5), 0, 1),
      lagDays: lagDays(raw.lagDays),
      rationale: text(raw.rationale),
      analogs: strings(raw.analogs),
      assumptions: strings(raw.assumptions),
      confidence: confidence(raw.confidence),
      marketQuery: text(raw.marketQuery),
      isRoot: raw.isRoot === true,
      isTarget: raw.isTarget === true,
    };
  }
  if (raw.kind === "numeric" && typeof raw.name === "string") {
    return {
      id: raw.id,
      kind: "numeric",
      name: raw.name,
      unit: text(raw.unit, "%"),
      ticker: typeof raw.ticker === "string" ? raw.ticker : null,
      current: optionalNumber(raw.current),
      baselineMove: clamp(finite(raw.baselineMove, 0), -100, 100),
      sigma: clamp(finite(raw.sigma, 0), 0, 200),
      rationale: text(raw.rationale),
      assumptions: strings(raw.assumptions),
      confidence: confidence(raw.confidence),
    };
  }
  return null;
}

function draftEdge(value: unknown): RawEdge | null {
  const raw = object(value);
  if (!raw || typeof raw.source !== "string" || typeof raw.target !== "string") return null;
  return {
    source: raw.source,
    target: raw.target,
    mechanism: text(raw.mechanism),
    assumptions: strings(raw.assumptions),
    confidence: confidence(raw.confidence),
    sourceIds: strings(raw.sourceIds),
    polarity: raw.polarity === "promote" || raw.polarity === "inhibit" ? raw.polarity : null,
    strength: optionalNumber(raw.strength),
    impact: optionalNumber(raw.impact),
    beta: optionalNumber(raw.beta),
    threshold: optionalNumber(raw.threshold),
    direction: raw.direction === "above" || raw.direction === "below" ? raw.direction : null,
    width: optionalNumber(raw.width),
  };
}

export function draftGraph(partial: unknown, input: GenerateInput): Graph | null {
  const raw = object(partial);
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes.flatMap((node) => {
    const parsed = draftNode(node);
    return parsed ? [parsed] : [];
  }) : [];
  if (nodes.length === 0) return null;
  const edges = Array.isArray(raw?.edges) ? raw.edges.flatMap((edge) => {
    const parsed = draftEdge(edge);
    return parsed ? [parsed] : [];
  }) : [];
  const graph = repairGraph(
    {
      nodes,
      edges,
      summary: { headline: "", mainUncertainty: "", followUps: [] },
    },
    input,
    "draft",
  );
  return { ...graph, summary: null };
}
