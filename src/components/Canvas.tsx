"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
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
  const markets = useStore((s) => s.markets);
  const { fitView } = useReactFlow();

  const ids = graph?.nodes.map((n) => n.id).join() ?? "";

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
          data: {
            node: n,
            result: result ?? { p: n.base, fixed: null, terms: [] },
            compareP: compare?.events.get(n.id)?.p ?? null,
            pinned: result?.fixed === "pin" ? true : null,
            adopted: (markets[n.id]?.length ?? 0) > 0,
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
  }, [compare, computed, diff, graph, markets, mc, selection, verdict]);

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

  useEffect(() => {
    if (!ids) return;
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 50);
    return () => clearTimeout(t);
  }, [ids, fitView]);

  if (!graph) {
    return (
      <div className="grid h-full place-items-center text-xs text-muted">
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
        onNodeClick={(_, n) => select({ type: "node", id: n.id })}
        onEdgeClick={(_, e) => select({ type: "edge", id: e.id })}
        onPaneClick={() => select(null)}
        fitView
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
