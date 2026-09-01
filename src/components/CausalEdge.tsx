"use client";

import { useMemo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
  type Edge,
} from "@xyflow/react";

export type CausalEdgeData = {
  edge: (Edge & {
    mechanism?: string;
    polarity?: "promote" | "inhibit" | null;
  }) | null;
  weight: number;
  onPath: boolean;
  weakest: boolean;
  selected: boolean;
};

function clamp01(v: number) {
  if (Number.isNaN(v)) return 0.5;
  return Math.min(1, Math.max(0, v));
}

export function CausalEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const edgeData = (data ?? {}) as CausalEdgeData;
  const mechanism = edgeData?.edge?.mechanism ?? "Mechanism not available";
  const polarity = edgeData?.edge?.polarity ?? "promote";
  const weight = clamp01(edgeData?.weight ?? 0);

  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const [pathD, labelX, labelY] = useMemo(
    () =>
      getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition],
  );

  const showLabel = selected || hovered || focused || edgeData?.onPath;
  const color = edgeData?.onPath
    ? "var(--color-gold)"
    : polarity === "inhibit"
      ? "var(--color-orange)"
      : "var(--color-blue)";
  const stroke = edgeData?.weakest ? "var(--color-red)" : color;
  const dash = polarity === "inhibit" || edgeData?.weakest ? "6 4" : undefined;
  const strokeWidth = Math.max(1, 1 + 4 * weight);
  const label =
    `${mechanism}` +
    (polarity === "inhibit" ? " (inhibit)" : " (promote)");

  return (
    <>
      <BaseEdge
        id={id}
        path={pathD}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray: dash,
        }}
      >
        <path
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          tabIndex={0}
            role="button"
            aria-label={label}
            className="focus:outline-none"
            d={pathD}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
        />
      </BaseEdge>
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none rounded border border-line bg-panel px-2 py-1 text-xs text-muted shadow-sm"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 10}px)`,
              whiteSpace: "nowrap",
              zIndex: 5,
            }}
          >
            <span className="font-semibold text-fg">{label}</span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export default CausalEdge;
