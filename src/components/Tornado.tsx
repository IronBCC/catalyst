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

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
};

const formatValue = (v: number, unit: string): string => {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}${unit ? ` ${unit}` : ""}`;
};

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const percentFromValue = (value: number, scale: number): number =>
  ((clamp(value, -scale, scale) + scale) / (scale * 2)) * 100;

export function Tornado(props: TornadoProps): React.ReactElement {
  const scale = Math.max(
    1,
    props.max ?? 8,
    ...props.rows.flatMap((row) => {
      const low = toNumber(row.low, toNumber(row.value));
      const high = toNumber(row.high, toNumber(row.value));
      return [Math.abs(low), Math.abs(high)];
    }),
  );

  return (
    <div className="rounded border border-line bg-panel p-3 text-fg">
      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <span>Worst</span>
        <span>Tornado</span>
        <span>Best</span>
      </div>
      <div className="relative">
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-line"
          aria-hidden="true"
        />
        {props.rows.map((row, index) => {
          const rowId = row.id ?? row.nodeId ?? `row-${index}`;
          const rowLabel =
            props.labels[rowId] ??
            row.label ??
            row.name ??
            row.nodeId ??
            row.id ??
            `Row ${index + 1}`;

          const low = toNumber(row.low, toNumber(row.value));
          const high = toNumber(row.high, toNumber(row.value, low));
          const start = percentFromValue(Math.min(low, high), scale);
          const end = percentFromValue(Math.max(low, high), scale);
          const width = Math.max(2, end - start);
          const isNegative = Math.max(low, high) < 0;
          const isCrossing = low <= 0 && high >= 0;
          const barStyle = isNegative
            ? {
                backgroundColor: "var(--color-orange)",
                backgroundImage:
                  "repeating-linear-gradient(90deg, var(--color-orange) 0 6px, transparent 6px 10px)",
              }
            : {
                backgroundColor: "var(--color-green)",
                backgroundImage: "none",
              };

          return (
            <div
              key={rowId}
              className="mb-2 rounded border border-line bg-bg px-2 py-2"
            >
              <div className="mb-1 flex items-center justify-between text-xs text-muted">
                <span>{rowLabel}</span>
                {typeof row.value === "number" ? (
                  <span
                    className={
                      row.value >= 0 ? "text-green" : "text-red"
                    }
                  >
                    {formatValue(row.value, props.unit)}
                  </span>
                ) : null}
              </div>
              <div
                className="relative h-6 w-full rounded border border-line bg-bg"
                aria-label={`${rowLabel} spread from ${formatValue(
                  Math.min(low, high),
                  props.unit,
                )} to ${formatValue(Math.max(low, high), props.unit)}`}
              >
                <div
                  className="absolute top-1/2 h-3 -translate-y-1/2 rounded"
                  style={{
                    left: `${start}%`,
                    width: `${width}%`,
                    ...barStyle,
                  }}
                />
                {isNegative ? (
                  <div className="absolute bottom-0 left-2 top-0 flex items-center text-[11px] text-muted">
                    {formatValue(high, props.unit)}
                  </div>
                ) : isCrossing ? (
                  <div className="absolute left-2 top-0 text-[11px] text-muted">
                    {formatValue(low, props.unit)}
                  </div>
                ) : (
                  <div className="absolute right-2 top-0 text-[11px] text-muted">
                    {formatValue(high, props.unit)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Tornado;
