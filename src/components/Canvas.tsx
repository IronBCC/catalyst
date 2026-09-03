"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
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

// These must match the fixed card sizes in EventNode.tsx and NumericNode.tsx.
// A card taller than the box the layout reserved for it overlaps its neighbour.
const CARD = { event: { width: 260, height: 132 }, numeric: { width: 260, height: 132 } };

/**
 * A long chain is wider than any screen, and fitting all of it makes the cards
 * unreadable. The initial fit stops here and the rest is panned to, with the
 * minimap for orientation.
 */
const FIT_MIN_ZOOM = 0.6;

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
  const { setViewport, getViewport } = useReactFlow();
  // setViewport is a no-op until React Flow has measured its container.
  const [ready, setReady] = useState(false);


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

  // The viewport is computed from the layout rather than from React Flow's fit:
  // card sizes are fixed and known, so nothing has to be measured first, and a
  // graph wider than the screen starts at its root on the left, in causal order,
  // instead of centred with the root cut off.
  const container = useRef<HTMLDivElement>(null);
  const layoutSignature = nodes.map((n) => `${n.id}:${Math.round(n.position.x)}`).join();
  useEffect(() => {
    const box = container.current?.getBoundingClientRect();
    if (!ready || !layoutSignature || !box || box.width === 0) return;
    const pad = 32;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + (n.width ?? 0));
      maxY = Math.max(maxY, n.position.y + (n.height ?? 0));
    }
    const gw = maxX - minX || 1;
    const gh = maxY - minY || 1;
    const fit = Math.min((box.width - 2 * pad) / gw, (box.height - 2 * pad) / gh);
    const zoom = Math.min(1.25, Math.max(FIT_MIN_ZOOM, fit));
    const clamped = fit < FIT_MIN_ZOOM;
    const x = clamped ? pad - minX * zoom : (box.width - gw * zoom) / 2 - minX * zoom;
    const y = (box.height - gh * zoom) / 2 - minY * zoom;
    void setViewport({ x, y, zoom });
    // nodes is derived from layoutSignature's inputs; the signature is the cheap key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, layoutSignature, setViewport]);

  // Selecting a node opens the inspector, which can push that node under it.
  // Pan just enough to keep the selected card fully visible.
  useEffect(() => {
    if (!ready || selection?.type !== "node") return;
    const frame = requestAnimationFrame(() => {
      const box = container.current?.getBoundingClientRect();
      const node = nodes.find((n) => n.id === selection.id);
      if (!box || !node) return;
      const { x, y, zoom } = getViewport();
      const pad = 24;
      const left = node.position.x * zoom + x;
      const right = left + (node.width ?? 0) * zoom;
      const top = node.position.y * zoom + y;
      const bottom = top + (node.height ?? 0) * zoom;
      let dx = 0;
      let dy = 0;
      if (right > box.width - pad) dx = box.width - pad - right;
      else if (left < pad) dx = pad - left;
      if (bottom > box.height - pad) dy = box.height - pad - bottom;
      else if (top < pad) dy = pad - top;
      if (dx || dy) void setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 200 });
    });
    return () => cancelAnimationFrame(frame);
    // nodes changes on every recompute; the selection is the trigger we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selection, getViewport, setViewport]);

  if (!graph) {
    return (
      <div data-testid="canvas" className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-md">
          <p className="font-serif text-[26px] leading-tight text-fg">
            Start with a hypothesis about the world.
          </p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
            Pick an example on the left or write your own. Catalyst maps the events it sets off,
            the market variables they move, and the mechanism behind every link.
          </p>

          {/*
           * A miniature of the thing itself. The empty state used to describe a
           * causal map in prose; showing one costs less to read and is the only
           * artwork here that is also an explanation. Decorative to a screen
           * reader — the paragraph above already says it in words.
           */}
          <svg
            viewBox="0 0 380 118"
            role="presentation"
            aria-hidden="true"
            className="mt-7 w-full text-line-strong"
          >
            <defs>
              <marker
                id="empty-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0 0 L8 4 L0 8 z" fill="currentColor" />
              </marker>
            </defs>

            <g
              stroke="currentColor"
              strokeWidth="1.25"
              fill="none"
              markerEnd="url(#empty-arrow)"
            >
              <path d="M96 26 C122 26 118 51 140 55" />
              <path d="M96 92 C122 92 118 67 140 63" />
            </g>
            <path
              d="M240 59 H278"
              stroke="var(--accent)"
              strokeWidth="1.5"
              fill="none"
              markerEnd="url(#empty-arrow)"
              className="text-accent"
            />

            <g fill="var(--panel)" stroke="currentColor" strokeWidth="1.25">
              <rect x="1" y="11" width="94" height="30" rx="7" />
              <rect x="1" y="77" width="94" height="30" rx="7" />
              <rect x="142" y="44" width="96" height="30" rx="7" />
            </g>
            <rect
              x="280"
              y="44"
              width="98"
              height="30"
              rx="7"
              fill="var(--accent-soft)"
              stroke="var(--accent)"
              strokeWidth="1.25"
            />

            <g
              fill="var(--muted)"
              fontSize="10.5"
              textAnchor="middle"
              fontFamily="var(--font-sans, inherit)"
            >
              <text x="48" y="30">an event</text>
              <text x="48" y="96">another</text>
              <text x="190" y="63">a variable</text>
              <text x="329" y="63" fill="var(--accent)">
                the outcome
              </text>
            </g>
          </svg>

          <p className="mt-6 text-[11px] leading-relaxed text-muted">
            Every link carries its mechanism and the assumptions it rests on. Nothing on screen
            is a number the model simply asserted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={container} data-testid="canvas" className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable
        edgesFocusable
        minZoom={0.1}
        onNodeClick={(_, n) => select({ type: "node", id: n.id })}
        onEdgeClick={(_, e) => select({ type: "edge", id: e.id })}
        onPaneClick={() => select(null)}
        onInit={() => setReady(true)}
      >
        <Background color="var(--line-strong)" gap={28} size={1.2} />
        <Controls showInteractive={false} position="bottom-left" />
        {/*
         * A graph wider than the screen is left clipped on purpose (FIT_MIN_ZOOM
         * keeps the cards readable), so the minimap is the only thing saying
         * there is more to the right. Its resting opacity is set in globals.css.
         */}
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          style={{ width: 140, height: 90, background: "var(--panel)" }}
          maskColor="color-mix(in srgb, var(--bg) 70%, transparent)"
          nodeColor={(node) => (node.type === "numeric" ? "var(--blue)" : "var(--accent)")}
          nodeStrokeWidth={0}
        />
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
