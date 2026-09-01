"use client";

import { memo } from "react";

export type Quantiles = {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
};

export interface DistStripProps {
  q: Quantiles;
  unit: string;
  current: number | null;
  width?: number;
}

function clamp(v: number, lo: number, hi: number) {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

export function DistStrip({
  q,
  unit,
  current,
  width = 240,
}: DistStripProps) {
  const minValue = Math.min(q.p10, q.p90, q.p50, q.mean, current ?? q.p50);
  const maxValue = Math.max(q.p10, q.p90, q.p50, q.mean, current ?? q.p50);
  const span = Math.max(1, maxValue - minValue);
  const x10 = ((q.p10 - minValue) / span) * width;
  const x90 = ((q.p90 - minValue) / span) * width;
  const x50 = ((q.p50 - minValue) / span) * width;
  const xCurrent = current === null ? null : ((current - minValue) / span) * width;

  const rangeStart = Math.min(x10, x90);
  const rangeWidth = Math.abs(x90 - x10) || width;
  const toLabel = (v: number) => `${v.toFixed(1)} ${unit}`.trim();

  return (
    <div className="w-full rounded border border-line bg-panel p-2 text-xs">
      <svg width={width} viewBox={`0 0 ${width} 56`} role="img" aria-label="Distribution band">
        <line
          x1={0}
          y1={28}
          x2={width}
          y2={28}
          className="stroke-line"
          strokeWidth={1}
        />
        <rect
          x={rangeStart}
          y={22}
          width={rangeWidth}
          height={12}
          fill="var(--color-blue)"
          opacity={0.2}
          rx={4}
        />
        <line
          x1={x50}
          y1={14}
          x2={x50}
          y2={42}
          stroke="var(--color-blue)"
          strokeWidth={2}
        />
        {xCurrent !== null ? (
          <line
            x1={clamp(xCurrent, 0, width)}
            y1={10}
            x2={clamp(xCurrent, 0, width)}
            y2={46}
            stroke="var(--color-gold)"
            strokeWidth={2}
          />
        ) : null}
      </svg>
      <div className="mt-1 flex justify-between text-muted">
        <span>{toLabel(q.p10)}</span>
        <span>{toLabel(q.p90)}</span>
      </div>
      <div className="mt-1 text-muted">50th: {toLabel(q.p50)}</div>
    </div>
  );
}

export default memo(DistStrip);
