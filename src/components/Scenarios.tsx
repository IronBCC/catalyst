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
  // `graph` is the active world's graph; `base` is the model before any world
  // touched it. Applying a world's edits to `graph` would apply the active
  // world's edits twice.
  const { graph, base, computed, mc, diff } = useComputed();
  const worlds = useStore((s) => s.worlds);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const setActiveWorld = useStore((s) => s.setActiveWorld);
  const positions = useStore((s) => s.positions);
  const [focus, setFocus] = useState<string>("pnl");

  const numerics = useMemo(() => (graph?.nodes ?? []).filter(isNumeric), [graph]);

  const rows = useMemo(() => {
    if (!base) return [];
    return worlds.map((world) => {
      const applied = applyEdits(base, world.edits);
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
  }, [base, numerics, worlds]);

  // P&L only exists when there are positions. Without them the select falls back
  // to its first option while the state still said "pnl", which asked the engine
  // for a node that does not exist and drew a tornado of zeroes.
  const selected = focus === "pnl" && positions.length === 0 ? (numerics[0]?.id ?? "pnl") : focus;

  const target: Target = useMemo(
    () => (selected === "pnl" ? { type: "pnl" } : { type: "numeric", id: selected }),
    [selected],
  );

  const tornadoRows = useMemo(() => {
    if (!base || !computed) return [];
    const applied = applyEdits(base, worlds.find((w) => w.id === activeWorldId)?.edits ?? []);
    return tornado(applied.graph, applied.fixed, target, positions);
  }, [activeWorldId, base, computed, positions, target, worlds]);

  const triggers = useMemo(() => {
    const stop = positions.find((p) => p.stopPct !== null)?.stopPct;
    if (!base || stop == null) return [];
    const applied = applyEdits(base, worlds.find((w) => w.id === activeWorldId)?.edits ?? []);
    return stopTriggers(applied.graph, applied.fixed, positions, stop);
  }, [activeWorldId, base, positions, worlds]);

  // A tornado of twenty bars answers nothing. The few that move the outcome are
  // the answer, and each one is spelled out underneath rather than left as a bar.
  const topRows = useMemo(() => tornadoRows.slice(0, TOP_DRIVERS), [tornadoRows]);

  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const n of graph?.nodes ?? []) map[n.id] = n.kind === "event" ? n.statement : n.name;
    return map;
  }, [graph]);

  if (!graph || !mc) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <p className="font-serif text-[22px] leading-tight text-fg">No outcomes yet.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Build a causal map first. This tab shows how the outcome is distributed, which scenarios
            dominate, and what moves the number most.
          </p>
        </div>
      </div>
    );
  }

  const focused = selected === "pnl" ? mc.pnl : (mc.numeric.get(selected) ?? null);
  // Every simulated series — P&L included — is a percent move, so percent is
  // the unit of the histogram and the tornado. The node's own unit only
  // applies once a move is turned back into a level.
  const unit = "%";
  const focusedNode = selected === "pnl" ? null : (numerics.find((n) => n.id === selected) ?? null);
  const current = focusedNode?.current ?? null;
  const priceUnit = focusedNode?.unit ?? "";
  const letter = (i: number) => String.fromCharCode(65 + i);
  const card = "rounded-lg border border-line bg-panel p-4";
  const h3 = "font-serif text-[17px] leading-tight text-fg";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 text-xs">
      <section data-testid="histogram" className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className={h3}>How the outcome is distributed</h3>
          <label className="flex items-center gap-2 text-muted">
            <span id="focus-label">Variable</span>
            <select
              id="focus"
              aria-labelledby="focus-label"
              value={selected}
              onChange={(e) => setFocus(e.target.value)}
              className="rounded-md px-2 py-1 text-xs"
            >
              {positions.length ? <option value="pnl">P&amp;L</option> : null}
              {numerics.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {focused ? (
          <>
            <Histogram
              samples={focused.samples}
              q={focused.q}
              unit={unit}
              current={current}
              priceUnit={priceUnit}
            />
            {selected === "pnl" && mc.pnl ? (
              <div className="mt-3 flex flex-wrap gap-5 border-t border-line pt-3 text-muted">
                <span>
                  loss <span className="num text-[15px] text-fg">{Math.round(mc.pnl.pLoss * 100)}%</span>
                </span>
                {mc.pnl.pStop !== null ? (
                  <span>
                    hits stop <span className="num text-[15px] text-red">{Math.round(mc.pnl.pStop * 100)}%</span>
                  </span>
                ) : null}
                {mc.pnl.pTarget !== null ? (
                  <span>
                    hits target <span className="num text-[15px] text-green">{Math.round(mc.pnl.pTarget * 100)}%</span>
                  </span>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {mc.clusters.length ? (
          <section className={card}>
            <h3 className={h3}>Most likely scenarios</h3>
            <p className="mt-0.5 text-muted">
              Top {Math.min(TOP_WORLDS, mc.clusters.length)} of {mc.clusters.length} combinations the simulation landed on.
            </p>
            <ol className="mt-3 space-y-3">
              {mc.clusters.slice(0, TOP_WORLDS).map((c, i) => (
                <li key={i} className="border-t border-line pt-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-serif text-[15px] text-fg">Scenario {letter(i)}</span>
                    <span className="num text-fg">
                      {Math.round(c.share * 100)}% <span className="text-muted">of runs</span>
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {Object.entries(c.states).map(([id, on]) => (
                      <li key={id} className={`flex gap-2 ${on ? "text-fg" : "text-muted"}`}>
                        <span
                          aria-hidden="true"
                          className={`mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-green" : "bg-line-strong"}`}
                        />
                        <span>
                          <span className="sr-only">{on ? "happens: " : "does not happen: "}</span>
                          {labels[id] ?? id}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section data-testid="tornado" className={card}>
          <h3 className={h3}>What moves it most</h3>
          <p className="mt-0.5 text-muted">
            Top {Math.min(TOP_DRIVERS, tornadoRows.length)} of {tornadoRows.length} drivers, each flipped off and on. Values are percent moves.
          </p>
          <div className="mt-3">
            <Tornado rows={topRows} labels={labels} unit={unit} />
          </div>
          <ol className="mt-3 space-y-2 border-t border-line pt-3">
            {topRows.map((row) => (
              <li key={row.nodeId} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-fg" title={labels[row.nodeId] ?? row.nodeId}>
                  {labels[row.nodeId] ?? row.nodeId}
                </span>
                <span className="num shrink-0 text-muted">
                  {row.low.toFixed(1)}% → {row.high.toFixed(1)}%{" "}
                  <span className={row.delta >= 0 ? "text-green" : "text-red"}>
                    {row.delta >= 0 ? "+" : ""}
                    {row.delta.toFixed(1)}pp
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {triggers.length ? (
            <div className="mt-4 border-t border-line pt-3">
              <h4 className="text-muted">What would hit the stop</h4>
              <ul className="mt-1.5 space-y-1">
                {triggers.slice(0, TOP_TRIGGERS).map((t) => (
                  <li key={t.nodeId} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-fg">{labels[t.nodeId] ?? t.nodeId}</span>
                    <span className="num shrink-0 text-red">{t.pnl.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <section data-testid="worlds-table">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className={h3}>Every world</h3>
          <p className="text-muted">Pick one to switch to it.</p>
        </div>
        <WorldsTable
          rows={rows}
          numericIds={numerics.map((n) => ({ id: n.id, name: n.name }))}
          activeId={activeWorldId ?? BASELINE_ID}
          onSelect={setActiveWorld}
        />
      </section>

      {diff && diff.removedEdgeIds.size ? (
        <section data-testid="removed-edges" className={card}>
          <h3 className={h3}>Links this world removed</h3>
          <ul className="mt-2 space-y-1">
            {[...diff.removedEdgeIds].map((id) => {
              const e = graph.edges.find((x) => x.id === id);
              return (
                <li key={id} className="flex gap-2 text-fg">
                  <span aria-hidden="true" className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange" />
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
