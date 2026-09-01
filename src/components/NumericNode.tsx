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

type QuantileBarProps = {
  q: Quantiles;
  unit: string;
  current: number | null;
  width?: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function format(value: number, unit: string) {
  const abs = Math.abs(value);
  const dp = abs >= 10 ? 0 : 1;
  return `${value.toFixed(dp)}${unit}`;
}

function pBadge(compare: number | null, move: number) {
  if (compare == null) {
    return null;
  }
  const delta = move - compare;
  if (Math.abs(delta) < 1) {
    return null;
  }
  const sign = delta >= 0 ? "+" : "";
  return <span className="rounded-full bg-line px-2 py-0.5 text-xs text-fg">{`${sign}${delta.toFixed(0)}pp`}</span>;
}

function DistStrip({ q, unit, current, width = 170 }: QuantileBarProps) {
  const lo = Math.min(q.p10, q.p90);
  const hi = Math.max(q.p10, q.p90);
  const span = hi - lo || 1;
  const x = (v: number) => ((v - lo) / span) * width;
  const p10X = x(q.p10);
  const p50X = x(q.p50);
  const p90X = x(q.p90);
  const currentX = current == null ? null : x(current);

  return (
    <svg width={width + 8} height={42} role="img" aria-label="distribution strip">
      <rect x={4} y={16} width={width} height={8} rx={4} className="fill-line" />
      <rect x={4 + p10X} y={14} width={Math.max(p90X - p10X, 1)} height={12} rx={2} className="fill-blue/30" />
      <line x1={4 + p50X} y1={12} x2={4 + p50X} y2={28} className="stroke-fg" strokeWidth={2} />
      <text x={4 + p10X} y={10} className="fill-muted text-[10px]">{`${q.p10.toFixed(1)}${unit}`}</text>
      <text x={4 + p90X} y={10} className="fill-muted text-[10px]">{`${q.p90.toFixed(1)}${unit}`}</text>
      <text x={4 + p50X - 8} y={38} className="fill-muted text-[10px]">{`${q.p50.toFixed(1)}${unit}`}</text>
      {currentX != null && (
        <line x1={4 + currentX} y1={10} x2={4 + currentX} y2={30} className="stroke-gold" strokeDasharray="2 2" />
      )}
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
  const valueLine = result.level == null ? format(result.move, "%") : format(result.level, ` ${node.unit}`);
  const showCurrent = result.level == null ? `${result.move >= 0 ? "+" : ""}${result.move.toFixed(1)}%` : format(result.level, ` ${node.unit}`);
  const bounded = clamp(result.move, -999, 999);

  return (
    <div
      className={`w-[260px] rounded-md border p-3 text-xs text-fg ${selected ? "ring-2 ring-blue" : "border-line"} bg-panel`}
      tabIndex={0}
      role="button"
      aria-label={node.name}
    >
      <Handle type="target" position={Position.Top} className="!bg-line" />
      <div className="mb-2">
        <h3 className="font-semibold text-fg">{node.name}</h3>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-full bg-blue/20 px-2 py-0.5 text-blue">{valueLine}</span>
        {pBadge(compareMove, bounded)}
        {isNew && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-gold">new</span>}
      </div>
      {strip ? <DistStrip q={strip} unit={node.unit} current={result.level} /> : <p className="text-muted">level {showCurrent}</p>}
      <div className="mt-1 text-muted">{valueLine}</div>
      <div className="text-muted">compare: {showCurrent}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-line" />
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
