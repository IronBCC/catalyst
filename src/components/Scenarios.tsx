"use client";

import { useMemo, useState } from "react";
import { Histogram } from "@/components/Histogram";
import Tornado from "@/components/Tornado";
import WorldsTable from "@/components/WorldsTable";
import { applyEdits, BASELINE_ID } from "@/lib/engine/worlds";
import { propagate } from "@/lib/engine/propagate";
import { stopTriggers, tornado, type Target } from "@/lib/engine/sensitivity";
import { isNumeric } from "@/lib/schema";
import { useComputed, useStore } from "@/store";

export default function Scenarios() {
  const { graph, computed, mc, diff } = useComputed();
  const worlds = useStore((s) => s.worlds);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const compareWorldId = useStore((s) => s.compareWorldId);
  const setActiveWorld = useStore((s) => s.setActiveWorld);
  const setCompareWorld = useStore((s) => s.setCompareWorld);
  const positions = useStore((s) => s.positions);
  const [focus, setFocus] = useState<string>("pnl");

  const numerics = useMemo(() => (graph?.nodes ?? []).filter(isNumeric), [graph]);

  const rows = useMemo(() => {
    if (!graph) return [];
    return worlds.map((world) => {
      const applied = applyEdits(graph, world.edits);
      const c = propagate(applied.graph, applied.fixed);
      const root = applied.graph.nodes.find((n) => n.kind === "event" && n.isRoot);
      const target = applied.graph.nodes.find((n) => n.kind === "event" && n.isTarget);
      const moves: Record<string, number> = {};
      for (const n of numerics) moves[n.id] = c.numerics.get(n.id)?.move ?? 0;
      return {
        world,
        rootP: root ? (c.events.get(root.id)?.p ?? 0) : 0,
        targetP: target ? (c.events.get(target.id)?.p ?? null) : null,
        moves,
      };
    });
  }, [graph, numerics, worlds]);

  const target: Target = useMemo(
    () => (focus === "pnl" ? { type: "pnl" } : { type: "numeric", id: focus }),
    [focus],
  );

  const tornadoRows = useMemo(() => {
    if (!graph || !computed) return [];
    const applied = applyEdits(graph, worlds.find((w) => w.id === activeWorldId)?.edits ?? []);
    return tornado(applied.graph, applied.fixed, target, positions);
  }, [activeWorldId, computed, graph, positions, target, worlds]);

  const triggers = useMemo(() => {
    const stop = positions.find((p) => p.stopPct !== null)?.stopPct;
    if (!graph || stop == null) return [];
    const applied = applyEdits(graph, worlds.find((w) => w.id === activeWorldId)?.edits ?? []);
    return stopTriggers(applied.graph, applied.fixed, positions, stop);
  }, [activeWorldId, graph, positions, worlds]);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of graph?.nodes ?? []) map[n.id] = n.kind === "event" ? n.statement : n.name;
    return map;
  }, [graph]);

  if (!graph || !mc) {
    return <p className="p-3 text-xs text-muted">Build a graph to see scenarios.</p>;
  }

  const focused =
    focus === "pnl" ? mc.pnl : (mc.numeric.get(focus) ?? null);
  const unit = focus === "pnl" ? "%" : (numerics.find((n) => n.id === focus)?.unit ?? "%");

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted" htmlFor="focus">
          distribution
        </label>
        <select
          id="focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          className="rounded border border-line bg-bg p-1 text-fg"
        >
          {positions.length ? <option value="pnl">P&amp;L</option> : null}
          {numerics.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </div>

      {focused ? (
        <section data-testid="histogram">
          <Histogram samples={focused.samples} q={focused.q} unit={unit} />
          <p className="mt-1 text-muted">
            {focus === "pnl" && mc.pnl
              ? `P(loss) ${Math.round(mc.pnl.pLoss * 100)}%` +
                (mc.pnl.pStop !== null ? ` · P(stop) ${Math.round(mc.pnl.pStop * 100)}%` : "") +
                (mc.pnl.pTarget !== null
                  ? ` · P(target) ${Math.round(mc.pnl.pTarget * 100)}%`
                  : "")
              : `p10 ${focused.q.p10.toFixed(1)} · p50 ${focused.q.p50.toFixed(1)} · p90 ${focused.q.p90.toFixed(1)}`}
          </p>
        </section>
      ) : null}

      {mc.clusters.length ? (
        <section>
          <h3 className="mb-1 text-muted">Most likely worlds</h3>
          <ul className="space-y-0.5">
            {mc.clusters.slice(0, 3).map((c, i) => (
              <li key={i} className="text-fg">
                {Object.entries(c.states)
                  .map(([id, on]) => `${labels[id] ?? id} ${on ? "✓ yes" : "✗ no"}`)
                  .join(" · ")}{" "}
                <span className="text-muted">{Math.round(c.share * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section data-testid="tornado">
        <h3 className="mb-1 text-muted">What moves it most</h3>
        <Tornado rows={tornadoRows} labels={labels} unit={unit} />
      </section>

      {triggers.length ? (
        <section>
          <h3 className="mb-1 text-muted">What hits my stop</h3>
          <ul className="space-y-0.5">
            {triggers.map((t) => (
              <li key={t.nodeId} className="text-red">
                {labels[t.nodeId] ?? t.nodeId} → {t.pnl.toFixed(1)}%
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section data-testid="worlds-table">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-muted">Worlds</h3>
          <label className="text-muted" htmlFor="compare">
            compare against
          </label>
          <select
            id="compare"
            data-testid="compare-select"
            value={compareWorldId ?? ""}
            onChange={(e) => setCompareWorld(e.target.value || null)}
            className="rounded border border-line bg-bg p-1 text-fg"
          >
            <option value="">none</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <WorldsTable
          rows={rows}
          numericIds={numerics.map((n) => ({ id: n.id, name: n.name }))}
          activeId={activeWorldId ?? BASELINE_ID}
          compareId={compareWorldId ?? ""}
          onSelect={setActiveWorld}
          onCompare={(id) => setCompareWorld(id || null)}
        />
      </section>

      {diff && diff.removedEdgeIds.size ? (
        <section data-testid="removed-edges">
          <h3 className="mb-1 text-muted">Removed vs compare</h3>
          <ul className="space-y-0.5">
            {[...diff.removedEdgeIds].map((id) => {
              const e = graph.edges.find((x) => x.id === id);
              return (
                <li key={id} className="text-orange">
                  {e ? e.mechanism : id}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
