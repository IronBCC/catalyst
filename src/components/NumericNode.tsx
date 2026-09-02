"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type NumericNode = {
  name: string;
  unit: string;
  current: number | null;
};

type NumericResult = {
  move: number;
  level: number | null;
  fixed: "override" | null;
  terms?: unknown[];
};

type Quantiles = {
  p10: number;
  p50: number;
  p90: number;
};

type NumericNodeData = {
  node: NumericNode;
  result: NumericResult;
  compareMove: number | null;
  strip: Quantiles | null;
  isNew: boolean;
  selected: boolean;
};

function format(value: number, unit: string) {
  const abs = Math.abs(value);
  const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toFixed(dp)}${unit}`;
}

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function deltaBadge(compare: number | null, move: number) {
  if (compare == null) {
    return null;
  }
  const delta = move - compare;
  if (Math.abs(delta) < 1) {
    return null;
  }
  const up = delta >= 0;
  return (
    <span
      className={`num rounded-full px-1.5 py-px text-[11px] ${up ? "bg-green-soft text-green" : "bg-red-soft text-red"}`}
    >{`${up ? "+" : ""}${delta.toFixed(0)}pp`}</span>
  );
}

/**
 * p10–p90 band with the median, in percent moves.
 *
 * `today` marks a zero move: the quantiles are moves, so plotting a price level
 * beside them would put the marker off the end of the strip.
 */
function DistStrip({ q, today, width = 220 }: { q: Quantiles; today: boolean; width?: number }) {
  const values = [q.p10, q.p90, q.p50, ...(today ? [0] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (v: number) => 4 + ((v - lo) / span) * width;

  return (
    <svg width={width + 8} height={30} role="img" aria-label="distribution strip" className="mt-1 block">
      <line x1={4} y1={9} x2={width + 4} y2={9} stroke="var(--line)" strokeWidth={1} />
      <rect x={x(q.p10)} y={5} width={Math.max(x(q.p90) - x(q.p10), 2)} height={8} rx={2} fill="var(--blue)" opacity={0.35} />
      <line x1={x(q.p50)} y1={2} x2={x(q.p50)} y2={16} stroke="var(--fg)" strokeWidth={2} />
      {today && (
        <line x1={x(0)} y1={2} x2={x(0)} y2={16} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="2 2" />
      )}
      <text x={x(q.p10)} y={27} fill="var(--muted)" fontSize={9} textAnchor={x(q.p10) < 30 ? "start" : "middle"} className="num">
        {format(q.p10, "")}
      </text>
      <text x={x(q.p90)} y={27} fill="var(--muted)" fontSize={9} textAnchor={x(q.p90) > width - 26 ? "end" : "middle"} className="num">
        {format(q.p90, "")}
      </text>
    </svg>
  );
}

function NumericNodeInner({
  node,
  result,
  compareMove,
  strip,
  isNew,
  selected,
}: {
  node: NumericNode;
  result: NumericResult;
  compareMove: number | null;
  strip: Quantiles | null;
  isNew: boolean;
  selected: boolean;
}) {
  const headline = result.level == null ? signed(result.move) : format(result.level, "");
  const sub = result.level == null ? "expected move" : `${node.unit} · ${signed(result.move)}`;

  return (
    <div
      className={`relative flex h-[132px] w-[260px] flex-col overflow-hidden rounded-lg pl-4 pr-3 py-3 text-xs text-fg ${
        isNew ? "new-card bg-accent-soft/60 shadow-pop" : "bg-panel shadow-card"
      } ${selected ? "ring-2 ring-accent" : isNew ? "ring-2 ring-accent/60" : "ring-1 ring-line"}`}
      tabIndex={0}
      role="button"
      aria-label={node.name}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-blue" />
      <Handle type="target" position={Position.Left} />
      {isNew && (
        <span
          data-testid="node-new"
          className="absolute right-0 top-0 rounded-bl-lg bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
        >
          New
        </span>
      )}
      <h3 className="line-clamp-1 font-serif text-[15px] leading-[1.25] text-fg" title={node.name}>
        {node.name}
      </h3>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="num text-[22px] leading-none tracking-tight text-fg">{headline}</span>
        <span className="num text-[11px] text-muted">{sub}</span>
        {deltaBadge(compareMove, result.move)}
      </div>
      {strip ? (
        <DistStrip q={strip} today={node.current !== null} />
      ) : (
        <p className="mt-2 text-[11px] text-muted">No distribution yet.</p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export default memo(function NumericNodeCard(props: NodeProps) {
  const { data, selected } = props as unknown as { data: NumericNodeData; selected?: boolean };
  return (
    <div data-testid={`node-${props.id}`}>
      <NumericNodeInner
        node={data.node}
        result={data.result}
        compareMove={data.compareMove}
        strip={data.strip}
        isNew={data.isNew}
        selected={selected || data.selected}
      />
    </div>
  );
});
