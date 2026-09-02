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

const CONFIDENCE_RULE: Record<Confidence, string> = {
  high: "bg-green",
  medium: "bg-blue",
  low: "bg-orange",
};

function compareBadge(compareP: number | null, p: number): ReactNode | null {
  if (compareP == null) {
    return null;
  }
  const delta = (p - compareP) * 100;
  if (Math.abs(delta) < 1) {
    return null;
  }
  const up = delta >= 0;
  return (
    <span
      data-testid="node-delta"
      className={`num rounded-full px-1.5 py-px text-[11px] ${up ? "bg-green-soft text-green" : "bg-red-soft text-red"}`}
    >{`${up ? "+" : ""}${delta.toFixed(0)}pp`}</span>
  );
}

const pill = "rounded-full px-1.5 py-px text-[10px] leading-4";

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
  const [lagMin, lagMax] = node.lagDays;
  const p = clamp(Number.isFinite(result.p) ? result.p : 0);

  return (
    <div
      className={`relative flex h-[132px] w-[260px] flex-col overflow-hidden rounded-lg pl-4 pr-3 py-3 text-xs text-fg ${
        isNew ? "new-card bg-accent-soft/60 shadow-pop" : "bg-panel shadow-card"
      } ${
        selected ? "ring-2 ring-accent" : isNew || onPath ? "ring-2 ring-accent/60" : "ring-1 ring-line"
      } ${node.isTarget ? "outline-dashed outline-1 outline-offset-2 outline-fg/40" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={node.statement}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${CONFIDENCE_RULE[node.confidence]}`}
      />
      <Handle type="target" position={Position.Left} />
      {isNew && (
        <span
          data-testid="node-new"
          className="absolute right-0 top-0 rounded-bl-lg bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
        >
          New
        </span>
      )}
      {/* The card is a map label, not the whole record: full text lives in the
          inspector, so everything here is clamped to keep the box a fixed size. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <h3
          className={`line-clamp-3 font-serif text-[15px] leading-[1.25] ${node.isRoot ? "text-accent" : "text-fg"}`}
          title={node.statement}
        >
          {node.statement}
        </h3>
      </div>

      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span data-testid="node-probability" className="num text-[22px] leading-none tracking-tight text-fg">
            {pct(p)}
          </span>
          {compareBadge(compareP, p)}
        </div>
        <span className="num text-[11px] text-muted" title={`confidence: ${node.confidence}`}>
          +{lagMin}–{lagMax}d
        </span>
      </div>

      {pinned !== null || adopted || result.fixed === "override" ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {pinned !== null && <span className={`${pill} bg-panel-2 text-muted`}>pinned</span>}
          {result.fixed === "override" && <span className={`${pill} bg-panel-2 text-muted`}>set by hand</span>}
          {adopted && (
            <span data-testid="node-market" className={`${pill} bg-blue-soft text-blue`}>
              {adoptedPct === null || adoptedPct === undefined
                ? "market"
                : `Polymarket ${Math.round(adoptedPct * 1000) / 10}%`}
            </span>
          )}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
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
