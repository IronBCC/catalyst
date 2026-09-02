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

const TOP_DRIVERS = 5;
const TOP_WORLDS = 3;
const TOP_TRIGGERS = 5;

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

  // P&L only exists when there are positions. Without them the select falls back
  // to its first option while the state still said "pnl", which asked the engine
  // for a node that does not exist and drew a tornado of zeroes.
  const selected = focus === "pnl" && positions.length === 0 ? (numerics[0]?.id ?? "pnl") : focus;

  const target: Target = useMemo(
    () => (selected === "pnl" ? { type: "pnl" } : { type: "numeric", id: selected }),
    [selected],
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

  // A tornado of twenty bars answers nothing. The few that move the outcome are
  // the answer, and each one is spelled out underneath rather than left as a bar.
  const topRows = useMemo(() => tornadoRows.slice(0, TOP_DRIVERS), [tornadoRows]);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of graph?.nodes ?? []) map[n.id] = n.kind === "event" ? n.statement : n.name;
    return map;
  }, [graph]);

  if (!graph || !mc) {
    return <p className="p-3 text-xs text-muted">Build a graph to see scenarios.</p>;
  }

  const focused = selected === "pnl" ? mc.pnl : (mc.numeric.get(selected) ?? null);
  const unit =
    selected === "pnl" ? "%" : (numerics.find((n) => n.id === selected)?.unit ?? "%");

  return (
    <div className="flex flex-col gap-4 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted" htmlFor="focus">
          distribution
        </label>
        <select
          id="focus"
          value={selected}
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
            {selected === "pnl" && mc.pnl
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
          <h3 className="mb-1 text-muted">
            Most likely worlds
            <span className="ml-2 text-muted">
              top {Math.min(TOP_WORLDS, mc.clusters.length)} of {mc.clusters.length}
            </span>
          </h3>
          <ol className="space-y-1">
            {mc.clusters.slice(0, TOP_WORLDS).map((c, i) => (
              <li key={i} className="rounded border border-line p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-fg">world {i + 1}</span>
                  <span className="text-gold">{Math.round(c.share * 100)}% of runs</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(c.states).map(([id, on]) => (
                    <li key={id} className={on ? "text-green" : "text-muted"}>
                      {on ? "yes" : "no"} · {labels[id] ?? id}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section data-testid="tornado">
        <h3 className="mb-1 text-muted">
          What moves it most
          <span className="ml-2 text-muted">
            top {Math.min(TOP_DRIVERS, tornadoRows.length)} of {tornadoRows.length}
          </span>
        </h3>
        <Tornado rows={topRows} labels={labels} unit={unit} />
        <ol className="mt-2 space-y-1">
          {topRows.map((row) => (
            <li key={row.nodeId} className="rounded border border-line p-2">
              <p className="text-fg">{labels[row.nodeId] ?? row.nodeId}</p>
              <p className="text-muted">
                off {row.low.toFixed(1)}
                {unit} · on {row.high.toFixed(1)}
                {unit} ·{" "}
                <span className={row.delta >= 0 ? "text-green" : "text-red"}>
                  swing {row.delta >= 0 ? "+" : ""}
                  {row.delta.toFixed(1)}
                  {unit}
                </span>
              </p>
            </li>
          ))}
        </ol>
      </section>

      {triggers.length ? (
        <section>
          <h3 className="mb-1 text-muted">
            What hits my stop
            <span className="ml-2 text-muted">
              top {Math.min(TOP_TRIGGERS, triggers.length)} of {triggers.length}
            </span>
          </h3>
          <ul className="space-y-0.5">
            {triggers.slice(0, TOP_TRIGGERS).map((t) => (
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
