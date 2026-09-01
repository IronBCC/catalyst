import { isEvent } from "@/lib/schema";
import type { Edge, Graph, Verdict } from "@/lib/schema";
import { propagate } from "@/lib/engine/propagate";
import type { Fixed } from "@/lib/engine/propagate";
import { toposort } from "@/lib/engine/topo";

const edgeWeight = (edge: Edge) => {
  if (edge.kind === "ee" || edge.kind === "ne") return edge.strength;
  if (edge.kind === "en") return Math.min(1, Math.abs(edge.impact) / 100);
  return Math.min(1, Math.abs(edge.beta));
};

function bestPath(graph: Graph, rootId: string, targetId: string): Edge[] {
  const ids = graph.nodes.map((node) => node.id);
  const outgoing = new Map(ids.map((id) => [id, [] as Edge[]]));
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge);
  const distance = new Map(ids.map((id) => [id, Number.POSITIVE_INFINITY]));
  const previous = new Map<string, Edge>();
  const unvisited = new Set(ids);
  distance.set(rootId, 0);

  while (unvisited.size > 0) {
    let current: string | null = null;
    for (const id of unvisited) {
      if (current === null || (distance.get(id) ?? Infinity) < (distance.get(current) ?? Infinity)) current = id;
    }
    if (current === null || !Number.isFinite(distance.get(current))) break;
    unvisited.delete(current);
    if (current === targetId) break;
    for (const edge of outgoing.get(current) ?? []) {
      const weight = edgeWeight(edge);
      if (weight <= 0 || !unvisited.has(edge.target)) continue;
      const candidate = (distance.get(current) ?? Infinity) - Math.log(weight);
      if (candidate < (distance.get(edge.target) ?? Infinity)) {
        distance.set(edge.target, candidate);
        previous.set(edge.target, edge);
      }
    }
  }

  const path: Edge[] = [];
  for (let node = targetId; node !== rootId; ) {
    const edge = previous.get(node);
    if (!edge) return [];
    path.unshift(edge);
    node = edge.source;
  }
  return path;
}

function countPaths(graph: Graph, rootId: string, targetId: string): number {
  const order = toposort(graph.nodes.map((node) => node.id), graph.edges);
  const counts = new Map(order.map((id) => [id, 0]));
  counts.set(rootId, 1);
  const outgoing = new Map(order.map((id) => [id, [] as Edge[]]));
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge);
  for (const id of order) {
    const count = counts.get(id) ?? 0;
    for (const edge of outgoing.get(id) ?? []) {
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + count);
    }
  }
  return counts.get(targetId) ?? 0;
}

function intervene(graph: Graph, fixed: Fixed, rootId: string, value: boolean): Fixed {
  const result: Fixed = { pins: new Map(fixed.pins), overrides: new Map(fixed.overrides) };
  const root = graph.nodes.find((node) => node.id === rootId);
  if (!root) return result;
  if (isEvent(root)) {
    result.overrides.delete(rootId);
    result.pins.set(rootId, value);
  } else {
    result.pins.delete(rootId);
    result.overrides.set(rootId, value ? 1 : 0);
  }
  return result;
}

const probability = (graph: Graph, fixed: Fixed, targetId: string) => propagate(graph, fixed).events.get(targetId)?.p ?? 0;

export function chainVerdict(graph: Graph, fixed: Fixed, rootId: string, targetId: string): Verdict {
  const pIfTrue = probability(graph, intervene(graph, fixed, rootId, true), targetId);
  const pIfFalse = probability(graph, intervene(graph, fixed, rootId, false), targetId);
  const lift = pIfTrue - pIfFalse;
  const path = bestPath(graph, rootId, targetId);
  const weakest = path.reduce<Edge | null>(
    (lowest, edge) => (lowest === null || edgeWeight(edge) < edgeWeight(lowest) ? edge : lowest),
    null,
  );

  return {
    lift,
    pIfTrue,
    pIfFalse,
    label: lift >= 0.3 ? "strong" : lift >= 0.1 ? "plausible" : lift > 0 ? "weak" : "none",
    pathEdgeIds: path.map((edge) => edge.id),
    weakestEdgeId: weakest?.id ?? null,
    pathCount: countPaths(graph, rootId, targetId),
  };
}
