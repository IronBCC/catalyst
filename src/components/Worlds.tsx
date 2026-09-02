"use client";

import { useMemo, useState } from "react";
import { applyEdits } from "@/lib/engine/worlds";
import { propagate } from "@/lib/engine/propagate";
import { useStore } from "@/store";

const createdAt = (value: string) =>
  `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export default function Worlds() {
  const [open, setOpen] = useState(false);
  const graph = useStore((state) => state.graph);
  const worlds = useStore((state) => state.worlds);
  const activeWorldId = useStore((state) => state.activeWorldId);
  const compareWorldId = useStore((state) => state.compareWorldId);
  const setActiveWorld = useStore((state) => state.setActiveWorld);
  const setCompareWorld = useStore((state) => state.setCompareWorld);

  const active = worlds.find((world) => world.id === activeWorldId) ?? null;
  const expanded = open && worlds.length > 0;
  const probabilities = useMemo(() => {
    const rootId = graph?.nodes.find((node) => node.kind === "event" && node.isRoot)?.id;
    if (!graph || !rootId) return new Map<string, number>();

    return new Map(
      worlds.map((world) => {
        const applied = applyEdits(graph, world.edits);
        const probability = propagate(applied.graph, applied.fixed).events.get(rootId)?.p ?? 0;
        return [world.id, probability];
      }),
    );
  }, [graph, worlds]);

  const selectWorld = (id: string) => {
    if (compareWorldId === id) setCompareWorld(null);
    setActiveWorld(id);
    setOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        data-testid="world-switcher"
        aria-expanded={expanded}
        aria-controls="world-list"
        aria-label={active ? `Current world: ${active.name}` : "No worlds"}
        disabled={!active}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-64 items-center rounded border border-line px-2 py-0.5 text-fg disabled:text-muted"
      >
        <span className="truncate">{active?.name ?? "No worlds"}</span>
        {worlds.length > 1 ? (
          <span className="shrink-0"> ({worlds.length} worlds)</span>
        ) : null}
      </button>

      {expanded ? (
        <ul
          id="world-list"
          aria-label="Worlds"
          className="absolute left-0 top-full z-30 mt-1 w-80 rounded border border-line bg-panel p-1"
        >
          {worlds.map((world) => {
            const isActive = world.id === activeWorldId;
            const isCompare = world.id === compareWorldId;
            return (
              <li
                key={world.id}
                data-testid={`world-option-${world.id}`}
                className="flex items-center gap-2 border-b border-line p-2 last:border-b-0"
              >
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`Switch to ${world.name}`}
                  onClick={() => selectWorld(world.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className={isActive ? "text-gold" : "text-fg"}>{world.name}</span>
                  {isActive ? <span className="ml-2 text-gold">active</span> : null}
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {createdAt(world.createdAt)} · {world.edits.length} edit
                    {world.edits.length === 1 ? "" : "s"} · root {Math.round((probabilities.get(world.id) ?? 0) * 100)}%
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={isCompare}
                  aria-label={
                    isActive
                      ? `${world.name} is active and cannot be compared with itself`
                      : `${isCompare ? "Stop comparing" : "Compare"} ${world.name}`
                  }
                  disabled={isActive}
                  onClick={() => setCompareWorld(isCompare ? null : world.id)}
                  className={`rounded border px-2 py-0.5 disabled:border-line disabled:text-muted ${
                    isCompare ? "border-blue text-blue" : "border-line text-muted"
                  }`}
                >
                  {isCompare ? "compared" : "compare"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function CompareStrip() {
  const worlds = useStore((state) => state.worlds);
  const activeWorldId = useStore((state) => state.activeWorldId);
  const compareWorldId = useStore((state) => state.compareWorldId);
  const setCompareWorld = useStore((state) => state.setCompareWorld);
  const active = worlds.find((world) => world.id === activeWorldId);
  const compare = worlds.find((world) => world.id === compareWorldId);

  if (!active || !compare || active.id === compare.id) return null;

  return (
    <div
      data-testid="compare-strip"
      role="status"
      className="flex items-center justify-center gap-2 border-b border-blue bg-blue/10 px-3 py-1 text-xs text-fg"
    >
      <span>
        comparing: {active.name} vs {compare.name}
      </span>
      <button
        type="button"
        data-testid="clear-compare"
        aria-label="Clear comparison"
        onClick={() => setCompareWorld(null)}
        className="rounded border border-blue px-2 py-0.5 text-blue"
      >
        clear
      </button>
    </div>
  );
}
