"use client";

import { useCallback, useMemo, useState } from "react";
import StressPanel from "@/components/StressPanel";
import { buildThesis, toMarkdown } from "@/lib/thesis";
import { safeHref } from "@/lib/safeUrl";
import { BASELINE_ID } from "@/lib/engine/worlds";
import { useComputed, useStore } from "@/store";

export default function Thesis() {
  const { graph, computed, mc, verdict, world } = useComputed();
  const positions = useStore((s) => s.positions);
  const quotes = useStore((s) => s.quotes);
  const markets = useStore((s) => s.markets);
  const thesisByWorld = useStore((s) => s.thesis);
  const setThesis = useStore((s) => s.setThesis);
  const pushLog = useStore((s) => s.pushLog);
  const activeWorldId = useStore((s) => s.activeWorldId) ?? BASELINE_ID;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = useMemo(() => {
    if (!graph || !computed || !mc) return null;
    return buildThesis(
      graph,
      computed,
      mc,
      verdict,
      positions,
      quotes,
      markets,
      world?.edits ?? [],
      world?.name ?? "Baseline",
    );
  }, [computed, graph, markets, mc, positions, quotes, verdict, world]);

  const narrative = thesisByWorld[activeWorldId] ?? null;

  const write = useCallback(async () => {
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/thesis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`narrative failed (${res.status})`);
      setThesis(activeWorldId, await res.json());
    } catch (e) {
      // The previous narrative stays on screen; only the error line is new.
      setError((e as Error).message);
      pushLog({ kind: "error", text: `Narrative failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [activeWorldId, input, pushLog, setThesis]);

  if (!input) return <p className="p-3 text-xs text-muted">Build a graph to write a thesis.</p>;

  const leg = input.primary;

  return (
    <div data-testid="thesis-card" className="flex flex-col gap-3 p-3 text-xs">
      <header>
        <h2 className="text-sm text-fg">{input.hypothesis}</h2>
        <p className="text-muted">
          {input.worldName} · {input.horizonDays}d horizon
        </p>
      </header>

      {leg ? (
        <section className="rounded border border-line p-2">
          <p className="text-fg">
            {leg.direction} {leg.ticker} — {leg.name}
          </p>
          <p className="text-muted">
            expected {leg.expectedMove >= 0 ? "+" : ""}
            {leg.expectedMove.toFixed(1)}% · p10 {leg.p10.toFixed(1)}% · p90 {leg.p90.toFixed(1)}%
          </p>
          <dl className="mt-1 grid grid-cols-3 gap-2">
            <div>
              <dt className="text-muted">entry</dt>
              <dd data-testid="thesis-entry" className="text-fg">
                {leg.entry === null ? "—" : leg.entry.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">stop</dt>
              <dd data-testid="thesis-stop" className="text-red">
                {leg.stop === null ? "—" : leg.stop.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">take profit</dt>
              <dd data-testid="thesis-take-profit" className="text-green">
                {leg.takeProfit === null ? "—" : leg.takeProfit.toFixed(2)}
              </dd>
            </div>
          </dl>
          <p data-testid="thesis-quantile-note" className="mt-1 text-muted">
            Monte-Carlo quantiles, not advice.
          </p>
        </section>
      ) : null}

      {input.marketView.length ? (
        <section>
          <h3 className="mb-1 text-muted">Model vs market</h3>
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr>
                <th>claim</th>
                <th>model</th>
                <th>market</th>
                <th>edge</th>
              </tr>
            </thead>
            <tbody>
              {input.marketView.map((m) => {
                const href = safeHref(m.url);
                return (
                  <tr key={m.statement}>
                    <td className="pr-2 text-fg">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                          {m.statement}
                        </a>
                      ) : (
                        m.statement
                      )}
                    </td>
                    <td>{Math.round(m.model * 100)}%</td>
                    <td>{Math.round(m.market * 100)}%</td>
                    <td className={m.edge >= 0 ? "text-green" : "text-red"}>
                      {m.edge >= 0 ? "+" : ""}
                      {Math.round(m.edge * 100)}pp
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <section>
          <h3 className="mb-1 text-muted">Invalidated by</h3>
          <ul className="space-y-0.5">
            {input.invalidation.map((i) => (
              <li key={i.nodeId} className="text-red">
                {i.statement} ({i.deltaPnl >= 0 ? "+" : ""}
                {i.deltaPnl.toFixed(1)}%)
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-1 text-muted">Confirmed by</h3>
          <ul className="space-y-0.5">
            {input.confirmation.map((i) => (
              <li key={i.nodeId} className="text-green">
                {i.statement} ({i.deltaPnl >= 0 ? "+" : ""}
                {i.deltaPnl.toFixed(1)}%)
              </li>
            ))}
          </ul>
        </section>
      </div>

      {input.risks.length ? (
        <section>
          <h3 className="mb-1 text-muted">Tail risks</h3>
          <ul className="space-y-0.5">
            {input.risks.map((r) => (
              <li key={r.nodeId} className="text-orange">
                {r.statement} · base {Math.round(r.base * 100)}%
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="write-narrative"
          onClick={() => void write()}
          disabled={busy}
          className="rounded border border-gold px-2 py-0.5 text-gold disabled:opacity-50"
        >
          {busy ? "writing…" : "Write narrative"}
        </button>
        <button
          type="button"
          data-testid="copy-markdown"
          onClick={() => void navigator.clipboard.writeText(toMarkdown(input, narrative))}
          className="rounded border border-line px-2 py-0.5 text-muted hover:text-fg"
        >
          Copy Markdown
        </button>
      </div>

      {error ? <p className="text-red">{error}</p> : null}

      {narrative ? (
        <section data-testid="thesis-narrative" className="rounded border border-line p-2">
          <p className="text-fg">{narrative.thesis}</p>
          <p className="mt-1 text-muted">{narrative.rationale}</p>
          <p className="mt-1 text-muted">{narrative.marketView}</p>
        </section>
      ) : null}

      <StressPanel />
    </div>
  );
}
