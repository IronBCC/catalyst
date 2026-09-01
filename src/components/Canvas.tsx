"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CausalEdge from "@/components/CausalEdge";
import EventNode from "@/components/EventNode";
import NumericNode from "@/components/NumericNode";
import { layoutLR } from "@/lib/layout";
import { isEvent } from "@/lib/schema";
import { useComputed, useStore } from "@/store";

const NODE_TYPES = { event: EventNode, numeric: NumericNode };
const EDGE_TYPES = { causal: CausalEdge };

const CARD = { event: { width: 260, height: 132 }, numeric: { width: 260, height: 112 } };

/** How thick the edge is drawn: every parameter kind squashed into 0..1. */
function weightOf(edge: { kind: string; strength?: number; impact?: number; beta?: number }) {
  if (edge.kind === "ee" || edge.kind === "ne") return edge.strength ?? 0;
  if (edge.kind === "en") return Math.min(1, Math.abs(edge.impact ?? 0) / 20);
  return Math.min(1, Math.abs(edge.beta ?? 0));
}

function Flow() {
  const { graph, computed, compare, mc, diff, verdict } = useComputed();
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const worlds = useStore((s) => s.worlds);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  const ids = graph?.nodes.map((n) => n.id).join() ?? "";

  // "adopted" means the world actually took the market's number, not merely
  // that a market was found for the node.
  const adopted = useMemo(() => {
    const world = worlds.find((w) => w.id === activeWorldId);
    const map = new Map<string, number>();
    for (const edit of world?.edits ?? []) {
      if (edit.type === "adoptMarket") map.set(edit.nodeId, edit.value);
    }
    return map;
  }, [activeWorldId, worlds]);

  const nodes = useMemo<FlowNode[]>(() => {
    if (!graph || !computed) return [];
    const boxes = graph.nodes.map((n) => ({ id: n.id, ...CARD[n.kind] }));
    const positions = layoutLR(boxes, graph.edges);
    const onPath = new Set(verdict?.pathEdgeIds ?? []);

    return graph.nodes.map((n) => {
      const position = positions.get(n.id) ?? { x: 0, y: 0 };
      const isNew = diff?.addedNodeIds.has(n.id) ?? false;
      const selected = selection?.type === "node" && selection.id === n.id;

      if (isEvent(n)) {
        const result = computed.events.get(n.id);
        return {
          id: n.id,
          type: "event",
          position,
          ...CARD.event,
          data: {
            node: n,
            result: result ?? { p: n.base, fixed: null, terms: [] },
            compareP: compare?.events.get(n.id)?.p ?? null,
            pinned: result?.fixed === "pin" ? true : null,
            adopted: adopted.has(n.id),
            adoptedPct: adopted.get(n.id) ?? null,
            isNew,
            onPath: graph.edges.some((e) => onPath.has(e.id) && (e.source === n.id || e.target === n.id)),
            selected,
          },
        } satisfies FlowNode;
      }

      const result = computed.numerics.get(n.id);
      return {
        id: n.id,
        type: "numeric",
        position,
        ...CARD.numeric,
        data: {
          node: n,
          result: result ?? { move: n.baselineMove, level: n.current, fixed: null, terms: [] },
          compareMove: compare?.numerics.get(n.id)?.move ?? null,
          strip: mc?.numeric.get(n.id)?.q ?? null,
          isNew,
          selected,
        },
      } satisfies FlowNode;
    });
  }, [adopted, compare, computed, diff, graph, mc, selection, verdict]);

  const edges = useMemo<FlowEdge[]>(() => {
    if (!graph) return [];
    const onPath = new Set(verdict?.pathEdgeIds ?? []);
    return graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "causal",
      data: {
        edge: e,
        weight: weightOf(e as never),
        onPath: onPath.has(e.id),
        weakest: verdict?.weakestEdgeId === e.id,
        selected: selection?.type === "edge" && selection.id === e.id,
      },
    }));
  }, [graph, selection, verdict]);

  // Fitting before React Flow has measured the cards produces a transform that
  // pushes the graph outside its own container.
  useEffect(() => {
    if (!ids || !nodesInitialized) return;
    void fitView({ padding: 0.2, duration: 200 });
  }, [ids, nodesInitialized, fitView]);

  if (!graph) {
    return (
      <div data-testid="canvas" className="grid h-full place-items-center text-xs text-muted">
        Pick an example or write a hypothesis to build a causal graph.
      </div>
    );
  }

  return (
    <div data-testid="canvas" className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable
        edgesFocusable
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        onNodeClick={(_, n) => select({ type: "node", id: n.id })}
        onEdgeClick={(_, e) => select({ type: "edge", id: e.id })}
        onPaneClick={() => select(null)}
      >
        <Background color="#1f262e" gap={24} />
      </ReactFlow>
    </div>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
