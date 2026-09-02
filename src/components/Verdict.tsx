"use client";

import { useComputed } from "@/store";

const TONE: Record<string, string> = {
  strong: "bg-green-soft text-green",
  plausible: "bg-blue-soft text-blue",
  weak: "bg-orange-soft text-orange",
  none: "bg-panel-2 text-muted",
};

export default function Verdict() {
  const { verdict, graph } = useComputed();
  if (!verdict || !graph) return null;

  const weakest = graph.edges.find((e) => e.id === verdict.weakestEdgeId);
  const sign = verdict.lift >= 0 ? "+" : "";

  return (
    <div data-testid="verdict" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span
        data-testid="verdict-label"
        className={`rounded-full px-2.5 py-0.5 font-medium ${TONE[verdict.label] ?? TONE.none}`}
      >
        {verdict.label}
      </span>
      <span className="text-muted">
        <span className="num text-fg">{sign}{Math.round(verdict.lift * 100)}pp</span> lift,{" "}
        <span className="num text-fg">{Math.round(verdict.pIfTrue * 100)}%</span> if true against{" "}
        <span className="num text-fg">{Math.round(verdict.pIfFalse * 100)}%</span> if false,{" "}
        <span className="num text-fg">{verdict.pathCount}</span> path{verdict.pathCount === 1 ? "" : "s"}
      </span>
      {weakest ? (
        <span data-testid="weakest-link" className="min-w-0 truncate text-muted" title={weakest.mechanism}>
          weakest link <span className="text-red">{weakest.mechanism}</span>
        </span>
      ) : null}
    </div>
  );
}
