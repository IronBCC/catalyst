"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const setActiveWorld = useStore((state) => state.setActiveWorld);

  const active = worlds.find((world) => world.id === activeWorldId) ?? null;
  const expanded = open && worlds.length > 0;
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [expanded]);
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
    setActiveWorld(id);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        data-testid="world-switcher"
        aria-expanded={expanded}
        aria-controls="world-list"
        aria-label={active ? `Current world: ${active.name}` : "No worlds"}
        disabled={!active}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-64 items-center gap-1.5 rounded-md border border-line-strong bg-panel px-2.5 py-1 text-xs text-fg hover:border-fg/40 disabled:border-line disabled:text-faint"
      >
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${active ? "bg-accent" : "bg-line-strong"}`}
        />
        <span className="truncate">{active?.name ?? "No worlds"}</span>
        {worlds.length > 1 ? (
          <span className="shrink-0 text-muted"> ({worlds.length} worlds)</span>
        ) : null}
        {active ? (
          <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className="text-muted">
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        ) : null}
      </button>

      {expanded ? (
        <ul
          id="world-list"
          aria-label="Worlds"
          className="absolute left-0 top-full z-30 mt-1.5 w-80 rounded-lg border border-line bg-panel p-1 shadow-card"
        >
          {worlds.map((world) => {
            const isActive = world.id === activeWorldId;
            return (
              <li
                key={world.id}
                data-testid={`world-option-${world.id}`}
                className={`flex items-center gap-2 rounded-md p-2 ${isActive ? "bg-accent-soft/60" : "hover:bg-panel-2"}`}
              >
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`Switch to ${world.name}`}
                  onClick={() => selectWorld(world.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-xs text-fg">{world.name}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {world.parentId
                      ? `from ${worlds.find((w) => w.id === world.parentId)?.name ?? "a removed world"} · `
                      : "the untouched model · "}
                    {world.edits.length} change{world.edits.length === 1 ? "" : "s"} · root{" "}
                    <span className="num">{Math.round((probabilities.get(world.id) ?? 0) * 100)}%</span>
                    <span className="sr-only"> · {createdAt(world.createdAt)}</span>
                  </span>
                </button>
                {isActive ? (
                  <span className="shrink-0 text-[11px] text-accent">active</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
