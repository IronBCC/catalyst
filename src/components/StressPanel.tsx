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
    <section className="flex flex-col gap-2 border-t border-line p-3 text-xs">
      <button
        type="button"
        data-testid="stress"
        onClick={() => void stress()}
        disabled={busy}
        className="self-start rounded border border-orange px-2 py-0.5 text-orange disabled:opacity-50"
      >
        {busy ? "stress testing…" : "Stress test"}
      </button>

      {candidates.map((c) => {
        const label = c.node.kind === "event" ? c.node.statement : c.node.name;
        return (
          <div
            key={c.node.id}
            data-testid="stress-candidate"
            className="rounded border border-line p-2"
          >
            <p className="text-fg">{label}</p>
            <p className="text-muted">{c.edges.map((e) => e.mechanism).join(" · ")}</p>
            <button
              type="button"
              data-testid="inject-candidate"
              onClick={() => inject(c)}
              className="mt-1 rounded border border-orange px-2 py-0.5 text-orange"
            >
              Inject
            </button>
          </div>
        );
      })}
    </section>
  );
}
