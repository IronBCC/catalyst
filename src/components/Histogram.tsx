"use client";

import { useMemo } from "react";
import type { ReactElement } from "react";

interface Quantiles {
  p10: number;
  p50: number;
  p90: number;
}

interface Marker {
  label: string;
  value: number;
}

interface HistogramProps {
  samples: Float64Array;
  q: Quantiles;
  unit: string;
  /** Today's level, when the variable has a price. Turns a move into a level. */
  current?: number | null;
  /** The unit that level is quoted in, e.g. USD/oz. */
  priceUnit?: string;
  markers?: Marker[];
  bins?: number;
}

const DEFAULT_BINS = 40;

const dp = (v: number) => (Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2);

/**
 * Every simulated series is a percent move, so that is what the readout leads
 * with. When the variable has a price, the level follows — the same pair the
 * map card shows, so the two screens can be read against each other.
 */
function formatValue(value: number, unit: string, current?: number | null, priceUnit?: string): string {
  const move = `${value > 0 ? "+" : ""}${value.toFixed(dp(value))}${unit === "%" ? "%" : ` ${unit}`}`;
  if (unit !== "%" || current == null || !Number.isFinite(current)) return move;
  const level = current * (1 + value / 100);
  return `${move} · ${level.toFixed(dp(level))}${priceUnit ? ` ${priceUnit}` : ""}`;
}

function toFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function Histogram({
  samples,
  q,
  unit,
  current = null,
  priceUnit = "",
  markers = [],
  bins = DEFAULT_BINS,
}: HistogramProps): ReactElement {
  const { bars, maxCount, width, height, min, max, x } = useMemo(() => {
    const finiteSamples = Array.from(samples).filter((value) => Number.isFinite(value));

    const allValues = [q.p10, q.p50, q.p90, ...markers.map((marker) => marker.value), ...finiteSamples];

    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const safeMin = toFinite(rawMin, q.p10) || q.p10;
    const safeMax = toFinite(rawMax, q.p90) || q.p90;
    const range = safeMax - safeMin || 1;

    const plotWidth = 720;
    const plotHeight = 140;
    const bucketCount = Math.max(1, Math.min(80, Math.floor(bins)));

    const buckets = new Array<number>(bucketCount).fill(0);
    for (const value of finiteSamples) {
      const normalized = (value - safeMin) / range;
      const clamped = Math.min(1, Math.max(0, normalized));
      const idx = Math.min(bucketCount - 1, Math.floor(clamped * bucketCount));
      buckets[idx] += 1;
    }

    return {
      bars: buckets,
      maxCount: Math.max(...buckets, 1),
      width: plotWidth,
      height: plotHeight,
      min: safeMin,
      max: safeMax,
      x: (v: number) => ((v - safeMin) / range) * plotWidth,
    };
  }, [samples, q.p10, q.p50, q.p90, bins, markers]);

  const barW = width / Math.max(1, bars.length);
  const inBand = (i: number) => {
    const v = min + ((i + 0.5) / bars.length) * (max - min);
    return v >= q.p10 && v <= q.p90;
  };

  return (
    <div className="w-full">
      <svg
        aria-label="Sample histogram with quantile markers"
        className="h-44 w-full"
        viewBox={`0 0 ${width} ${height + 20}`}
        preserveAspectRatio="none"
      >
        {bars.map((count, i) => {
          const h = (count / maxCount) * (height - 8);
          return (
            <rect
              key={i}
              x={i * barW + 1}
              y={height - h}
              width={Math.max(1, barW - 2)}
              height={h}
              rx={1.5}
              fill={inBand(i) ? "var(--blue)" : "var(--line-strong)"}
              opacity={inBand(i) ? 0.75 : 0.7}
            />
          );
        })}
        <line x1={0} x2={width} y1={height} y2={height} stroke="var(--line-strong)" />

        <line x1={x(q.p50)} x2={x(q.p50)} y1={0} y2={height} stroke="var(--fg)" strokeWidth={2} />
        {[
          { v: q.p10, label: "p10" },
          { v: q.p90, label: "p90" },
        ].map((m) => (
          <line key={m.label} x1={x(m.v)} x2={x(m.v)} y1={0} y2={height} stroke="var(--fg)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        ))}

        {markers.map((marker) => {
          const mx = x(marker.value);
          return (
            <g key={`${marker.label}-${marker.value}`}>
              <line x1={mx} x2={mx} y1={0} y2={height} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={mx + 4} y={12} fill="var(--accent)" fontSize={11} fontFamily="var(--font-mono)">
                {marker.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-1 grid grid-cols-3 text-xs">
        <div>
          <div className="text-muted">p10</div>
          <div className="num text-[15px] text-fg">{formatValue(q.p10, unit, current, priceUnit)}</div>
        </div>
        <div className="text-center">
          <div className="text-muted">median</div>
          <div className="num text-[15px] text-fg">{formatValue(q.p50, unit, current, priceUnit)}</div>
        </div>
        <div className="text-right">
          <div className="text-muted">p90</div>
          <div className="num text-[15px] text-fg">{formatValue(q.p90, unit, current, priceUnit)}</div>
        </div>
      </div>
    </div>
  );
}
