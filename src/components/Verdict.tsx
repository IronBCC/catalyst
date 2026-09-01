"use client";

import { useComputed } from "@/store";

const TONE: Record<string, string> = {
  strong: "text-green border-green",
  plausible: "text-blue border-blue",
  weak: "text-orange border-orange",
  none: "text-muted border-line",
};

export default function Verdict() {
  const { verdict, graph } = useComputed();
  if (!verdict || !graph) return null;

  const weakest = graph.edges.find((e) => e.id === verdict.weakestEdgeId);

  return (
    <div data-testid="verdict" className="flex flex-wrap items-center gap-2 text-xs">
      <span
        data-testid="verdict-label"
        className={`rounded border px-2 py-0.5 ${TONE[verdict.label] ?? TONE.none}`}
      >
        {verdict.label}
      </span>
      <span className="text-muted">
        lift {verdict.lift >= 0 ? "+" : ""}
        {Math.round(verdict.lift * 100)}pp · {Math.round(verdict.pIfTrue * 100)}% if true vs{" "}
        {Math.round(verdict.pIfFalse * 100)}% if false · {verdict.pathCount} path
        {verdict.pathCount === 1 ? "" : "s"}
      </span>
      {weakest ? (
        <span data-testid="weakest-link" className="text-red">
          weakest link: {weakest.mechanism}
        </span>
      ) : null}
    </div>
  );
}
