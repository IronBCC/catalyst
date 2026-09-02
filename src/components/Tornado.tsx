"use client";

import * as React from "react";

export interface TornadoRow {
  id?: string;
  nodeId?: string;
  label?: string;
  name?: string;
  low?: number;
  high?: number;
  value?: number;
}

interface TornadoProps {
  rows: TornadoRow[];
  labels: Record<string, string>;
  unit: string;
  max?: number;
}

const toNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const formatValue = (v: number, unit: string): string =>
  `${v > 0 ? "+" : ""}${v.toFixed(1)}${unit === "%" ? "%" : ""}`;

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

/**
 * One bar per driver: from the outcome with the driver off to the outcome with
 * it on, around a shared zero line. Biggest swing first is the caller's job.
 */
export function Tornado(props: TornadoProps): React.ReactElement {
  const scale = Math.max(
    1,
    props.max ?? 0,
    ...props.rows.flatMap((row) => [Math.abs(toNumber(row.low)), Math.abs(toNumber(row.high))]),
  );
  const pct = (v: number) => ((clamp(v, -scale, scale) + scale) / (scale * 2)) * 100;

  return (
    <div className="text-xs">
      <div className="num mb-1 flex justify-between text-[11px] text-muted">
        <span>{formatValue(-scale, props.unit)}</span>
        <span>0</span>
        <span>{formatValue(scale, props.unit)}</span>
      </div>
      <div className="relative flex flex-col gap-1.5">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-line-strong" aria-hidden="true" />
        {props.rows.map((row, index) => {
          const rowId = row.id ?? row.nodeId ?? `row-${index}`;
          const rowLabel = props.labels[rowId] ?? row.label ?? row.name ?? rowId;
          const low = toNumber(row.low, toNumber(row.value));
          const high = toNumber(row.high, toNumber(row.value, low));
          const lo = Math.min(low, high);
          const hi = Math.max(low, high);
          const up = high >= low;

          return (
            <div key={rowId} className="grid grid-cols-[1fr_2fr] items-center gap-3">
              <span className="truncate text-fg" title={rowLabel}>
                {rowLabel}
              </span>
              <div
                className="relative h-5"
                aria-label={`${rowLabel}: ${formatValue(low, props.unit)} when off, ${formatValue(high, props.unit)} when on`}
              >
                <div
                  className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-sm ${up ? "bg-green" : "bg-red"}`}
                  style={{ left: `${pct(lo)}%`, width: `${Math.max(0.6, pct(hi) - pct(lo))}%`, opacity: 0.85 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Tornado;
