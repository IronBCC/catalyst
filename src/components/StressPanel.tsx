"use client";

import { useCallback, useState } from "react";
import { compactGraph } from "@/lib/prompts";
import type { Edge, Node } from "@/lib/schema";
import { useComputed, useStore } from "@/store";

type Candidate = { node: Node; edges: Edge[] };

/**
 * Black swans reuse /api/branch with `blackSwan: true` and `count: 3` rather
 * than a route of their own; injecting one pins it true in a fresh world.
 */
export default function StressPanel() {
  const { graph, computed } = useComputed();
  const mutate = useStore((s) => s.mutate);
  const pushLog = useStore((s) => s.pushLog);
  const setStatus = useStore((s) => s.setStatus);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);

  const stress = useCallback(async () => {
    if (!graph || !computed) return;
    setBusy(true);
    setStatus({ phase: "branching", message: "looking for black swans…" });
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          graph,
          compact: compactGraph(graph, computed),
          text: null,
          attachTo: null,
          count: 3,
          blackSwan: true,
        }),
      });
      if (!res.ok) throw new Error(`stress test failed (${res.status})`);
      const body = await res.json();
      setCandidates(body?.candidates ?? []);
      setStatus({ phase: "idle", message: "" });
    } catch (e) {
      setStatus({ phase: "error", message: (e as Error).message });
      pushLog({ kind: "error", text: `Stress test failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [computed, graph, pushLog, setStatus]);

  const inject = useCallback(
    (c: Candidate) => {
      const label = c.node.kind === "event" ? c.node.statement : c.node.name;
      mutate(
        [
          { type: "addNode", node: c.node, edges: c.edges },
          ...(c.node.kind === "event"
            ? ([{ type: "pin", nodeId: c.node.id, value: true }] as const)
            : []),
        ],
        `Black swan: ${label}`,
      );
      pushLog({ kind: "world", text: `Black swan: ${label}` });
      setCandidates([]);
    },
    [mutate, pushLog],
  );

  if (!graph) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-line pt-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-serif text-[17px] leading-tight text-fg">Stress test</h3>
          <p className="mt-0.5 text-muted">Ask the model for three black swans this map does not yet contain.</p>
        </div>
        <button
          type="button"
          data-testid="stress"
          onClick={() => void stress()}
          disabled={busy}
          className="rounded-md border border-orange/50 bg-orange-soft px-3 py-1.5 text-orange hover:border-orange disabled:opacity-50"
        >
          {busy ? "Looking…" : "Find black swans"}
        </button>
      </div>

      {candidates.length ? (
        <ul className="grid gap-2 sm:grid-cols-3">
          {candidates.map((c) => {
            const label = c.node.kind === "event" ? c.node.statement : c.node.name;
            return (
              <li
                key={c.node.id}
                data-testid="stress-candidate"
                className="flex flex-col rounded-lg border border-line bg-panel p-3"
              >
                <p className="font-serif text-[15px] leading-snug text-fg">{label}</p>
                <p className="mt-1.5 flex-1 leading-relaxed text-muted">{c.edges.map((e) => e.mechanism).join(". ")}</p>
                <button
                  type="button"
                  data-testid="inject-candidate"
                  onClick={() => inject(c)}
                  className="mt-3 self-start rounded-md border border-line-strong px-2.5 py-1 text-fg hover:border-orange hover:text-orange"
                >
                  Add to this world
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
