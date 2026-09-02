"use client";

import { useEffect, useState } from "react";
import Banner from "@/components/Banner";
import Canvas from "@/components/Canvas";
import Generating from "@/components/Generating";
import Inspector from "@/components/Inspector";
import Rail from "@/components/Rail";
import SessionId from "@/components/SessionId";
import Scenarios from "@/components/Scenarios";
import Thesis from "@/components/Thesis";
import Verdict from "@/components/Verdict";
import Worlds from "@/components/Worlds";
import { rehydrateWorkspace, useComputed, useStore } from "@/store";

const TABS = ["map", "scenarios", "thesis"] as const;

/** The ids are the selector contract; these are what a reader sees. */
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  map: "Map",
  scenarios: "Outcomes",
  thesis: "Thesis",
};

const ghostButton =
  "rounded-md border border-line-strong bg-panel px-2.5 py-1 text-xs text-muted hover:text-fg";

export default function Home() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const status = useStore((s) => s.status);
  const { graph, world } = useComputed();
  const selection = useStore((s) => s.selection);
  const worlds = useStore((s) => s.worlds);
  const parent = world?.parentId ? worlds.find((w) => w.id === world.parentId) : null;
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // The saved workspace arrives after the first paint, so server and client
  // agree on what they render before it does.
  useEffect(() => {
    rehydrateWorkspace();
  }, []);

  // A 503 from any route means there is no key: examples still work, so this is
  // a warning strip rather than an error state. Derived, not stored, so it
  // reappears if a later call fails the same way.
  const offline =
    !dismissed && status.phase === "error" && /\b503\b/.test(status.message);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {offline ? (
        <Banner
          tone="warn"
          message="Live generation is off (503). The examples still work."
          onDismiss={() => setDismissed(true)}
        />
      ) : null}

      <header className="flex h-12 items-center gap-4 border-b border-line bg-panel px-4">
        <span className="font-serif text-[19px] leading-none tracking-tight text-fg">
          Catalyst
        </span>

        <button
          type="button"
          data-testid="rail-toggle"
          aria-expanded={railOpen}
          aria-controls="rail-drawer"
          onClick={() => setRailOpen((v) => !v)}
          className={`${ghostButton} lg:hidden`}
        >
          Hypothesis
        </button>

        <nav
          className="flex rounded-md border border-line bg-bg p-0.5"
          role="tablist"
          aria-label="View"
        >
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              data-testid={`tab-${t}`}
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-[5px] px-3 py-1 text-xs transition-colors ${
                tab === t
                  ? "bg-panel text-fg shadow-[0_1px_2px_rgba(20,20,19,0.08)]"
                  : "text-muted hover:text-fg"
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </nav>

        <Worlds />

        <div className="flex-1" />

        <SessionId />

        {selection ? (
          <button
            type="button"
            data-testid="inspector-toggle"
            aria-expanded={inspectorOpen}
            aria-controls="inspector-drawer"
            onClick={() => setInspectorOpen((v) => !v)}
            className={`${ghostButton} lg:hidden`}
          >
            Details
          </button>
        ) : null}
      </header>

      {graph ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-line bg-bg px-4 py-2.5">
          <h1 className="font-serif text-[21px] leading-tight tracking-tight text-fg">
            {graph.hypothesis}
          </h1>
          {world ? (
            <p data-testid="world-context" className="text-xs text-muted">
              {world.parentId
                ? `${world.name}, forked from ${parent?.name ?? "a removed world"} with ${world.edits.length} change${world.edits.length === 1 ? "" : "s"}`
                : "Baseline, the model as generated"}
            </p>
          ) : null}
          <Verdict />
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        <div
          id="rail-drawer"
          className={`${
            railOpen ? "absolute inset-y-0 left-0 z-20 w-80 shadow-card" : "hidden"
          } shrink-0 lg:static lg:block lg:w-[300px] lg:shadow-none`}
        >
          <Rail />
        </div>

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Generating />
          <div data-testid="panel-map" hidden={tab !== "map"} className="min-h-0 flex-1">
            <Canvas />
          </div>
          <div
            data-testid="panel-scenarios"
            hidden={tab !== "scenarios"}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <Scenarios />
          </div>
          <div
            data-testid="panel-thesis"
            hidden={tab !== "thesis"}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <Thesis />
          </div>
        </main>

        {/* The inspector exists only while something is selected: the map gets
            the room the rest of the time. */}
        {selection ? (
          <div
            id="inspector-drawer"
            className={`${
              inspectorOpen ? "absolute inset-y-0 right-0 z-20 w-96 shadow-card" : "hidden"
            } shrink-0 lg:static lg:block lg:w-[380px] lg:shadow-none`}
          >
            <Inspector onClose={() => setInspectorOpen(false)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
