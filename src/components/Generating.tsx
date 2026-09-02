"use client";

import { useStore } from "@/store";

const SKELETON = [0, 1, 2];

/**
 * What a long call looks like from the outside.
 *
 * A regenerate leaves the previous map on screen until the first partial
 * arrives, which reads as nothing happening. This sits over the panel for the
 * whole call, says which hypothesis is being worked on, and counts nodes as
 * they stream in.
 */
export default function Generating() {
  const status = useStore((s) => s.status);
  const graph = useStore((s) => s.graph);
  const draft = useStore((s) => s.draft);

  const busy = status.phase === "generating" || status.phase === "branching" || status.phase === "thesis";
  if (!busy) return null;

  const heading =
    status.phase === "branching"
      ? "Exploring a branch"
      : status.phase === "thesis"
        ? "Writing the narrative"
        : "Mapping causes";
  const subject = draft?.hypothesis ?? graph?.hypothesis ?? null;
  const count = draft?.nodes.length ?? 0;

  return (
    <div
      data-testid="generating"
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-30 flex items-center justify-center bg-bg/75 backdrop-blur-[2px] p-6"
    >
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-5 shadow-card">
        <p className="flex items-center gap-2 text-xs text-muted">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          {status.message || "working…"}
        </p>
        <h2 className="mt-1 font-serif text-[22px] leading-tight tracking-tight text-fg">{heading}</h2>
        {subject ? <p className="mt-1 text-xs leading-relaxed text-muted">{subject}</p> : null}

        <div className="mt-4 h-1 overflow-hidden rounded-full bg-panel-2">
          <div className="sweep h-full w-1/3 rounded-full bg-accent" />
        </div>

        <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
          {SKELETON.map((row) => (
            <div
              key={row}
              className="flex items-center gap-3 rounded-lg border border-line bg-bg p-3"
              style={{ opacity: 1 - row * 0.25 }}
            >
              <div className="h-8 w-1 rounded-full bg-accent-soft" />
              <div className="flex-1">
                <div className="shimmer h-2 w-3/4 rounded-full bg-panel-2" />
                <div className="shimmer mt-1.5 h-2 w-1/2 rounded-full bg-panel-2" />
              </div>
              <div className="shimmer h-5 w-10 rounded-md bg-panel-2" />
            </div>
          ))}
        </div>

        {count > 0 ? (
          <p data-testid="generating-count" className="num mt-3 text-xs text-muted">
            {count} node{count === 1 ? "" : "s"} so far
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted">
            The map below is the previous answer until the new one arrives.
          </p>
        )}
      </div>
    </div>
  );
}
