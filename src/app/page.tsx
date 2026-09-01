"use client";

import { useState } from "react";
import Banner from "@/components/Banner";
import Canvas from "@/components/Canvas";
import Inspector from "@/components/Inspector";
import Rail from "@/components/Rail";
import Scenarios from "@/components/Scenarios";
import Thesis from "@/components/Thesis";
import Verdict from "@/components/Verdict";
import { useStore } from "@/store";

const TABS = ["map", "scenarios", "thesis"] as const;

export default function Home() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const status = useStore((s) => s.status);
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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
          message="live generation off (503), examples work"
          onDismiss={() => setDismissed(true)}
        />
      ) : null}

      <header className="flex items-center gap-3 border-b border-line px-3 py-2 text-xs">
        <span className="text-gold">catalyst</span>

        <button
          type="button"
          data-testid="rail-toggle"
          aria-expanded={railOpen}
          aria-controls="rail-drawer"
          onClick={() => setRailOpen((v) => !v)}
          className="rounded border border-line px-2 py-0.5 text-muted lg:hidden"
        >
          rail
        </button>

        <nav className="flex gap-1" role="tablist" aria-label="View">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              data-testid={`tab-${t}`}
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded border px-2 py-0.5 ${
                tab === t ? "border-gold text-gold" : "border-line text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="flex-1">
          <Verdict />
        </div>

        <button
          type="button"
          data-testid="inspector-toggle"
          aria-expanded={inspectorOpen}
          aria-controls="inspector-drawer"
          onClick={() => setInspectorOpen((v) => !v)}
          className="rounded border border-line px-2 py-0.5 text-muted lg:hidden"
        >
          inspector
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div
          id="rail-drawer"
          className={`${
            railOpen ? "fixed inset-y-0 left-0 z-20 w-80" : "hidden"
          } shrink-0 lg:static lg:block lg:w-80`}
        >
          <Rail />
        </div>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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

        <div
          id="inspector-drawer"
          className={`${
            inspectorOpen ? "fixed inset-y-0 right-0 z-20 w-96" : "hidden"
          } shrink-0 lg:static lg:block lg:w-96`}
        >
          <Inspector />
        </div>
      </div>
    </div>
  );
}
