"use client";

import { memo, type ReactNode } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type Confidence = "low" | "medium" | "high";

type EventNode = {
  statement: string;
  resolution: string;
  lagDays: [number, number];
  confidence: Confidence;
  isRoot: boolean;
  isTarget: boolean;
};

type EventResult = {
  p: number;
  fixed: "pin" | "override" | null;
  terms?: unknown[];
};

type EventNodeData = {
  node: EventNode;
  result: EventResult;
  compareP: number | null;
  pinned: boolean | null;
  adopted: boolean;
  adoptedPct?: number | null;
  isNew: boolean;
  onPath: boolean;
  selected: boolean;
};

export interface EventNodeProps {
  data: EventNodeData;
  selected?: boolean;
}

export interface EventNodeComponentProps {
  node: EventNode;
  result: EventResult;
  compareP: number | null;
  pinned: boolean | null;
  adopted: boolean;
  adoptedPct?: number | null;
  isNew: boolean;
  onPath: boolean;
  selected: boolean;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

function compareBadge(compareP: number | null, p: number): ReactNode | null {
  if (compareP == null) {
    return null;
  }
  const delta = (p - compareP) * 100;
  if (Math.abs(delta) < 1) {
    return null;
  }
  const sign = delta >= 0 ? "+" : "";
  return (
    <span data-testid="node-delta" className="rounded-full bg-line px-2 py-0.5 text-xs text-fg">{`${sign}${delta.toFixed(0)}pp`}</span>
  );
}

function confidenceDot(confidence: Confidence): string {
  if (confidence === "high") {
    return "bg-green";
  }
  if (confidence === "low") {
    return "bg-red";
  }
  return "bg-blue";
}

const EventNodeInner = ({
  node,
  result,
  compareP,
  pinned,
  adopted,
  adoptedPct,
  isNew,
  onPath,
  selected,
}: EventNodeComponentProps) => {
  const isCompareUp = compareP === null || result.p >= compareP;
  const [lagMin, lagMax] = node.lagDays;
  const p = clamp(Number.isFinite(result.p) ? result.p : 0);

  return (
    <div
      className={`flex h-[168px] w-[260px] flex-col overflow-hidden rounded-md border p-3 text-xs text-fg ${selected ? "ring-2 ring-blue" : "border-line"} bg-panel ${
        node.isTarget ? "ring-2 ring-gold" : ""
      }`}
      tabIndex={0}
      role="button"
      aria-label={node.statement}
    >
      <Handle type="target" position={Position.Left} className="!bg-line" />
      {/* The card is a map label, not the whole record: full text lives in the
          inspector, so everything here is clamped to keep the box a fixed size. */}
      <div className="mb-2 min-h-0 flex-1 space-y-1 overflow-hidden">
        <h3
          className={`line-clamp-2 font-semibold ${node.isRoot ? "text-gold" : "text-fg"}`}
          title={node.statement}
        >
          {node.statement}
        </h3>
        <p className="line-clamp-2 text-muted" title={node.resolution}>
          {node.resolution}
        </p>
        <p className="text-muted">
          lag +{lagMin}–{lagMax}d
        </p>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span data-testid="node-probability" className={`rounded-full px-2 py-0.5 ${isCompareUp ? "bg-green/20 text-green" : "bg-red/20 text-red"}`}>{pct(p)}</span>
        {compareBadge(compareP, p)}
        {result.fixed !== null && <span className="text-muted">pin</span>}
        <span className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${confidenceDot(node.confidence)}`} title={`confidence: ${node.confidence}`} />
          {node.confidence}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {pinned !== null && <span className="rounded-full bg-line px-2 py-0.5 text-muted">🔒 pinned</span>}
        {adopted && (
          <span data-testid="node-market" className="rounded-full bg-blue/20 px-2 py-0.5 text-blue">
            {adoptedPct === null || adoptedPct === undefined
              ? "market"
              : `Polymarket ${Math.round(adoptedPct * 1000) / 10}%`}
          </span>
        )}
        {isNew && (
          <span data-testid="node-new" className="rounded-full bg-gold/20 px-2 py-0.5 text-gold">
            new
          </span>
        )}
        {onPath && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-gold">path</span>}
      </div>
      {pinned === true && <p className="text-muted text-[11px]">intervention: pinned</p>}
      <Handle type="source" position={Position.Right} className="!bg-line" />
    </div>
  );
};

export default memo(function EventNodeCard(props: NodeProps) {
  const { data, selected } = props as unknown as { data: EventNodeData; selected?: boolean };
  // The testid lives on a wrapper because React Flow owns the outer element.
  return (
    <div data-testid={`node-${props.id}`}>
    <EventNodeInner
      node={data.node}
      result={data.result}
      compareP={data.compareP}
      pinned={data.pinned}
      adopted={data.adopted}
      adoptedPct={data.adoptedPct}
      isNew={data.isNew}
      onPath={data.onPath}
      selected={selected || data.selected}
    />
    </div>
  );
});

export { EventNodeInner as EventNode };
