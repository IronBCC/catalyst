'use client';

import React, { useMemo } from "react";
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
  markers?: Marker[];
  bins?: number;
}

const DEFAULT_BINS = 40;

function formatValue(value: number, unit: string): string {
  return `${value.toFixed(2)} ${unit}`;
}

function toFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function Histogram({
  samples,
  q,
  unit,
  markers = [],
  bins = DEFAULT_BINS,
}: HistogramProps): ReactElement {
  const { bars, maxCount, width, height, min, max, p10x, p50x, p90x } = useMemo(() => {
    const finiteSamples = Array.from(samples)
      .map((value) => toFinite(value, NaN))
      .filter((value) => Number.isFinite(value));

    const allValues = [
      q.p10,
      q.p50,
      q.p90,
      ...markers.map((marker) => marker.value),
      ...finiteSamples,
    ];

    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const fallbackMin = q.p10;
    const fallbackMax = q.p90;

    const safeMin = toFinite(rawMin, fallbackMin) || fallbackMin;
    const safeMax = toFinite(rawMax, fallbackMax) || fallbackMax;
    const range = safeMax - safeMin || 1;

    const plotWidth = 720;
    const plotHeight = 160;
    const bucketCount = Math.max(1, Math.min(80, Math.floor(bins)));

    const buckets = new Array<number>(bucketCount).fill(0);
    for (const value of finiteSamples) {
      const normalized = (value - safeMin) / range;
      const clamped = Math.min(1, Math.max(0, normalized));
      const idx = Math.min(bucketCount - 1, Math.floor(clamped * bucketCount));
      buckets[idx] += 1;
    }

    const maxBucket = Math.max(...buckets, 1);

    return {
      bars: buckets,
      maxCount: maxBucket,
      width: plotWidth,
      height: plotHeight,
      min: safeMin,
      max: safeMax,
      p10x: ((q.p10 - safeMin) / range) * plotWidth,
      p50x: ((q.p50 - safeMin) / range) * plotWidth,
      p90x: ((q.p90 - safeMin) / range) * plotWidth,
    };
  }, [samples, q.p10, q.p50, q.p90, bins, markers]);

  const safeBin = Math.max(1, bars.length);
  const barW = width / safeBin;

  return (
    <div className="w-full rounded border border-line bg-bg p-2">
      <svg
        aria-label="Sample histogram with quantile markers"
        className="h-56 w-full"
        viewBox={`0 0 ${width} ${height + 24}`}
        preserveAspectRatio="none"
      >
        <rect x="0" y="0" width={width} height={height} fill="var(--color-panel)" />

        {bars.map((count, i) => {
          const x = i * barW;
          const h = (count / maxCount) * (height - 12);
          const y = height - h;
          return (
            <rect
              key={i}
              x={x + 1}
              y={y}
              width={Math.max(1, barW - 2)}
              height={h}
              fill="var(--color-blue)"
              opacity={0.25}
            />
          );
        })}

        {[
          { x: p10x, label: "p10", color: "var(--color-green)" },
          { x: p50x, label: "p50", color: "var(--color-gold)" },
          { x: p90x, label: "p90", color: "var(--color-orange)" },
        ].map((marker) => (
          <g key={marker.label}>
            <line
              x1={marker.x}
              x2={marker.x}
              y1={0}
              y2={height}
              stroke={marker.color}
              strokeWidth={2}
            />
            <text
              x={marker.x + 4}
              y={12}
              fill="var(--color-fg)"
              className="text-xs"
              style={{ fontSize: "10px" }}
            >
              {marker.label}
            </text>
          </g>
        ))}

        {markers.map((marker) => {
          const x = ((marker.value - min) / (max - min || 1)) * width;
          return (
            <g key={`${marker.label}-${marker.value}`}>
              <line
                x1={x}
                x2={x}
                y1={0}
                y2={height}
                stroke="var(--color-red)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text
                x={x + 4}
                y={24}
                fill="var(--color-fg)"
                className="text-xs"
                style={{ fontSize: "10px" }}
              >
                {marker.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
        <span className="text-green">p10: {formatValue(q.p10, unit)}</span>
        <span className="text-gold">p50: {formatValue(q.p50, unit)}</span>
        <span className="text-orange">p90: {formatValue(q.p90, unit)}</span>
      </div>
    </div>
  );
}
