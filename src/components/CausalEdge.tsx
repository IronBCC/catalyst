"use client";

import { useMemo, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
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

  // Orthogonal routing rather than a bezier: in a layered graph a curve
  // crossing four columns is unreadable, a stepped line is followable.
  const [pathD, labelX, labelY] = useMemo(
    () =>
      getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        borderRadius: 12,
      }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition],
  );

  const showLabel = selected || hovered || focused;
  const color = edgeData?.onPath
    ? "var(--accent)"
    : polarity === "inhibit"
      ? "var(--orange)"
      : "var(--line-strong)";
  const stroke = edgeData?.weakest ? "var(--red)" : selected || hovered || focused ? "var(--fg)" : color;
  const dash = polarity === "inhibit" || edgeData?.weakest ? "6 4" : undefined;
  const strokeWidth = Math.max(1.25, 1.25 + 3 * weight);
  const emphasised = Boolean(edgeData?.onPath || edgeData?.weakest || selected || hovered || focused);
  const opacity = emphasised ? 1 : 0.8;
  const markerId = `arrow-${polarity === "inhibit" ? "inhibit" : "promote"}${edgeData?.weakest ? "-weak" : edgeData?.onPath ? "-path" : ""}`;
  const label =
    `${mechanism}` +
    (polarity === "inhibit" ? " (inhibit)" : " (promote)");
  const verb = polarity === "inhibit" ? "inhibits" : "promotes";

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill={stroke} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={pathD}
        markerEnd={markerEnd ?? `url(#${markerId})`}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray: dash,
          opacity,
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
            className="pointer-events-none max-w-[280px] rounded-md bg-fg px-2.5 py-1.5 text-[11px] leading-snug text-bg shadow-card"
            style={{
              position: "absolute",
              transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 8}px)`,
              zIndex: 5,
            }}
          >
            <span className={polarity === "inhibit" ? "text-orange" : "text-accent"}>{verb}</span>{" "}
            {mechanism}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export default CausalEdge;
