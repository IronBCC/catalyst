import type { Edge, Edit, Graph, World } from "@/lib/schema";
import { breakCycles } from "@/lib/engine/topo";
import { emptyFixed } from "@/lib/engine/propagate";
import type { Fixed } from "@/lib/engine/propagate";

export const BASELINE_ID = "baseline";

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const edgeWeight = (edge: Edge) => {
  if (edge.kind === "ee" || edge.kind === "ne") return edge.strength;
  if (edge.kind === "en") return Math.abs(edge.impact);
  return Math.abs(edge.beta);
};

function setEdgeParam(edge: Edge, edit: Extract<Edit, { type: "setEdgeParam" }>): Edge {
  if (edge.id !== edit.edgeId) return edge;
  if (edit.param === "strength" && (edge.kind === "ee" || edge.kind === "ne")) {
    return { ...edge, strength: clamp(edit.value, 0, 1) };
  }
  if (edit.param === "impact" && edge.kind === "en") {
    return { ...edge, impact: clamp(edit.value, -100, 100) };
  }
  if (edit.param === "beta" && edge.kind === "nn") {
    return { ...edge, beta: clamp(edit.value, -10, 10) };
  }
  return edge;
}

export function applyEdits(graph: Graph, edits: Edit[]): { graph: Graph; fixed: Fixed } {
  let nodes = [...graph.nodes];
  let edges = [...graph.edges];
  const fixed = emptyFixed();

  for (const edit of edits) {
    switch (edit.type) {
      case "pin":
        fixed.overrides.delete(edit.nodeId);
        fixed.pins.set(edit.nodeId, edit.value);
        break;
      case "override":
      case "adoptMarket":
        fixed.pins.delete(edit.nodeId);
        fixed.overrides.set(edit.nodeId, edit.value);
        break;
      case "cutEdge":
        edges = edges.filter((edge) => edge.id !== edit.edgeId);
        break;
      case "setEdgeParam":
        edges = edges.map((edge) => setEdgeParam(edge, edit));
        break;
      case "reviseNode": {
        if (!nodes.some((node) => node.id === edit.node.id)) break;
        nodes = nodes.map((node) => (node.id === edit.node.id ? edit.node : node));
        const known = new Set(nodes.map((node) => node.id));
        // The revised edge set replaces the node's own links; the rest of the
        // graph keeps its own.
        edges = [
          ...edges.filter(
            (edge) => edge.source !== edit.node.id && edge.target !== edit.node.id,
          ),
          ...edit.edges.filter((edge) => known.has(edge.source) && known.has(edge.target)),
        ];
        edges = breakCycles(
          nodes.map((node) => node.id),
          edges,
          edgeWeight,
        ).edges;
        break;
      }
      case "addNode": {
        if (!nodes.some((node) => node.id === edit.node.id)) nodes = [...nodes, edit.node];
        const known = new Set(nodes.map((node) => node.id));
        // Applying the same edit twice must be the same as applying it once:
        // the node was already guarded, and a repeated edge would double the
        // branch's effect on everything downstream.
        const present = new Set(edges.map((edge) => edge.id));
        edges = [
          ...edges,
          ...edit.edges.filter(
            (edge) => !present.has(edge.id) && known.has(edge.source) && known.has(edge.target),
          ),
        ];
        edges = breakCycles(
          nodes.map((node) => node.id),
          edges,
          edgeWeight,
        ).edges;
        break;
      }
    }
  }

  return { graph: { ...graph, nodes, edges }, fixed };
}

export function removeEditsFor(edits: Edit[], nodeId: string): Edit[] {
  return edits.filter(
    (edit) =>
      !(
        (edit.type === "pin" || edit.type === "override" || edit.type === "adoptMarket") &&
        edit.nodeId === nodeId
      ),
  );
}

export function forkWorld(parent: World, name: string, edit: Edit | Edit[]): World {
  return {
    id: crypto.randomUUID(),
    name,
    parentId: parent.id,
    edits: [...parent.edits, ...(Array.isArray(edit) ? edit : [edit])],
    createdAt: new Date().toISOString(),
  };
}

export function newWorld(name: string, id = crypto.randomUUID()): World {
  return { id, name, parentId: null, edits: [], createdAt: new Date().toISOString() };
}

export function worldDiff(active: World, compare: World): {
  addedNodeIds: Set<string>;
  removedEdgeIds: Set<string>;
} {
  const addedBy = (world: World) =>
    new Set(world.edits.flatMap((edit) => (edit.type === "addNode" ? [edit.node.id] : [])));
  const removedBy = (world: World) =>
    new Set(world.edits.flatMap((edit) => (edit.type === "cutEdge" ? [edit.edgeId] : [])));
  const compareAdded = addedBy(compare);
  const compareRemoved = removedBy(compare);

  return {
    addedNodeIds: new Set([...addedBy(active)].filter((id) => !compareAdded.has(id))),
    removedEdgeIds: new Set([...removedBy(active)].filter((id) => !compareRemoved.has(id))),
  };
}
