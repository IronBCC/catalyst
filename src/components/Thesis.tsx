"use client";

import { useCallback, useMemo, useState } from "react";
import StressPanel from "@/components/StressPanel";
import { buildThesis, toMarkdown } from "@/lib/thesis";
import { safeHref } from "@/lib/safeUrl";
import { BASELINE_ID } from "@/lib/engine/worlds";
import { useComputed, useStore } from "@/store";

export default function Thesis() {
  // buildThesis applies the world's edits itself, so it needs the untouched
  // model, not the active world's graph.
  const { base, computed, mc, verdict, world } = useComputed();
  const positions = useStore((s) => s.positions);
  const quotes = useStore((s) => s.quotes);
  const markets = useStore((s) => s.markets);
  const thesisByWorld = useStore((s) => s.thesis);
  const setThesis = useStore((s) => s.setThesis);
  const pushLog = useStore((s) => s.pushLog);
  const activeWorldId = useStore((s) => s.activeWorldId) ?? BASELINE_ID;
  const [busy, setBusy] = useState(false);
  // Which candidate the card is showing. Null means the ranked pick.
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input = useMemo(() => {
    if (!base || !computed || !mc) return null;
    return buildThesis(
      base,
      computed,
      mc,
      verdict,
      positions,
      quotes,
      markets,
      world?.edits ?? [],
      world?.name ?? "Baseline",
    );
  }, [base, computed, markets, mc, positions, quotes, verdict, world]);

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

  if (!input) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-sm">
          <p className="font-serif text-[22px] leading-tight text-fg">No thesis yet.</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Build a causal map first. The thesis card turns it into a leg, an entry, a stop and a
            take-profit, with what would confirm or invalidate it.
          </p>
        </div>
      </div>
    );
  }

  const leg = (chosen ? input.candidates.find((c) => c.ticker === chosen) : null) ?? input.primary;
  const others = input.candidates.filter((c) => c.ticker !== leg?.ticker);
  const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const h3 = "text-muted";
  const Dot = ({ tone }: { tone: "red" | "green" | "orange" }) => (
    <span
      aria-hidden="true"
      className={`mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
        tone === "red" ? "bg-red" : tone === "green" ? "bg-green" : "bg-orange"
      }`}
    />
  );

  return (
    <div data-testid="thesis-card" className="mx-auto flex max-w-3xl flex-col gap-6 p-5 text-xs">
      <header className="border-b border-line pb-4">
        <p className="text-muted">
          {input.worldName} · {input.horizonDays}-day horizon
        </p>
        <h2 className="mt-1 font-serif text-[26px] leading-tight tracking-tight text-fg">{input.hypothesis}</h2>
      </header>

      {leg ? (
        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-serif text-[19px] text-fg">
              <span className={leg.direction === "long" ? "text-green" : "text-red"}>{leg.direction}</span>{" "}
              {leg.ticker}
              <span className="ml-2 font-sans text-xs text-muted">{leg.name}</span>
            </p>
            <p className="num text-muted">
              expected <span className="text-fg">{signedPct(leg.expectedMove)}</span> · p10 {signedPct(leg.p10)} · p90 {signedPct(leg.p90)}
            </p>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
            <div>
              <dt className="text-muted">entry</dt>
              <dd data-testid="thesis-entry" className="num text-[19px] text-fg">
                {leg.entry === null ? "–" : leg.entry.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">stop</dt>
              <dd data-testid="thesis-stop" className="num text-[19px] text-red">
                {leg.stop === null ? "–" : leg.stop.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">take profit</dt>
              <dd data-testid="thesis-take-profit" className="num text-[19px] text-green">
                {leg.takeProfit === null ? "–" : leg.takeProfit.toFixed(2)}
              </dd>
            </div>
          </dl>
          <p data-testid="thesis-quantile-note" className="mt-2 text-muted">
            Levels come from the Monte-Carlo quantiles. Model estimates, not advice.
          </p>
        </section>
      ) : null}

      {others.length ? (
        <section data-testid="thesis-candidates">
          <h3 className={h3}>Other outcomes on the map</h3>
          <p className="mt-0.5 text-muted">
            Every market variable the map contains, ranked by how far it moves and how far that move
            sits from zero. Pick one to price it as the trade.
          </p>
          <table className="mt-2 w-full text-left">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-3 font-normal">variable</th>
                <th className="num py-1.5 pr-3 text-right font-normal">expected</th>
                <th className="num py-1.5 pr-3 text-right font-normal">p10</th>
                <th className="num py-1.5 pr-3 text-right font-normal">p90</th>
                <th className="num py-1.5 pr-3 text-right font-normal">entry</th>
                <th className="num py-1.5 pr-3 text-right font-normal">stop</th>
                <th className="num py-1.5 text-right font-normal">target</th>
              </tr>
            </thead>
            <tbody>
              {others.map((c) => (
                <tr key={c.ticker} className="border-b border-line align-top hover:bg-panel">
                  <td className="py-1.5 pr-3 text-fg">
                    <button
                      type="button"
                      data-testid={`thesis-candidate-${c.ticker}`}
                      onClick={() => setChosen(c.ticker)}
                      aria-label={`Price ${c.name} as the trade`}
                      className="text-left hover:text-accent"
                    >
                      <span className={c.direction === "long" ? "text-green" : "text-red"}>
                        {c.direction}
                      </span>{" "}
                      {c.ticker}
                      <span className="ml-2 text-muted">{c.name}</span>
                    </button>
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-fg">{signedPct(c.expectedMove)}</td>
                  <td className="num py-1.5 pr-3 text-right text-muted">{signedPct(c.p10)}</td>
                  <td className="num py-1.5 pr-3 text-right text-muted">{signedPct(c.p90)}</td>
                  <td className="num py-1.5 pr-3 text-right text-muted">
                    {c.entry === null ? "–" : c.entry.toFixed(2)}
                  </td>
                  <td className="num py-1.5 pr-3 text-right text-red">
                    {c.stop === null ? "–" : c.stop.toFixed(2)}
                  </td>
                  <td className="num py-1.5 text-right text-green">
                    {c.takeProfit === null ? "–" : c.takeProfit.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {chosen ? (
            <button
              type="button"
              onClick={() => setChosen(null)}
              className="mt-2 rounded-md border border-line-strong px-2 py-0.5 text-muted hover:text-fg"
            >
              Back to the ranked pick
            </button>
          ) : null}
        </section>
      ) : null}

      {input.marketView.length ? (
        <section>
          <h3 className={h3}>Model against market</h3>
          <table className="mt-1.5 w-full text-left">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="py-1.5 pr-3 font-normal">claim</th>
                <th className="num py-1.5 pr-3 text-right font-normal">model</th>
                <th className="num py-1.5 pr-3 text-right font-normal">market</th>
                <th className="num py-1.5 text-right font-normal">edge</th>
              </tr>
            </thead>
            <tbody>
              {input.marketView.map((m) => {
                const href = safeHref(m.url);
                return (
                  <tr key={m.statement} className="border-b border-line align-top">
                    <td className="py-1.5 pr-3 text-fg">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:decoration-fg">
                          {m.statement}
                        </a>
                      ) : (
                        m.statement
                      )}
                    </td>
                    <td className="num py-1.5 pr-3 text-right text-fg">{Math.round(m.model * 100)}%</td>
                    <td className="num py-1.5 pr-3 text-right text-fg">{Math.round(m.market * 100)}%</td>
                    <td className={`num py-1.5 text-right ${m.edge >= 0 ? "text-green" : "text-red"}`}>
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

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h3 className={h3}>Invalidated by</h3>
          <ul className="mt-1.5 space-y-1.5">
            {input.invalidation.map((i) => (
              <li key={i.nodeId} className="flex gap-2 text-fg">
                <Dot tone="red" />
                <span>
                  {i.statement} <span className="num text-red">{signedPct(i.deltaPnl)}</span>
                </span>
              </li>
            ))}
          </ul>
          {input.invalidation.length ? null : (
            <p className="mt-1.5 text-muted">
              Nothing left to flip — a pinned or hand-set node is fixed, so it cannot be a driver.
            </p>
          )}
        </section>
        <section>
          <h3 className={h3}>Confirmed by</h3>
          <ul className="mt-1.5 space-y-1.5">
            {input.confirmation.map((i) => (
              <li key={i.nodeId} className="flex gap-2 text-fg">
                <Dot tone="green" />
                <span>
                  {i.statement} <span className="num text-green">{signedPct(i.deltaPnl)}</span>
                </span>
              </li>
            ))}
          </ul>
          {input.confirmation.length ? null : (
            <p className="mt-1.5 text-muted">
              Nothing left to flip — a pinned or hand-set node is fixed, so it cannot be a driver.
            </p>
          )}
        </section>
      </div>

      {input.risks.length ? (
        <section>
          <h3 className={h3}>Tail risks</h3>
          <ul className="mt-1.5 space-y-1.5">
            {input.risks.map((r) => (
              <li key={r.nodeId} className="flex gap-2 text-fg">
                <Dot tone="orange" />
                <span>
                  {r.statement} <span className="num text-muted">base {Math.round(r.base * 100)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          type="button"
          data-testid="write-narrative"
          onClick={() => void write()}
          disabled={busy}
          className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:brightness-95 disabled:opacity-50"
        >
          {busy ? "Writing…" : narrative ? "Rewrite the narrative" : "Write the narrative"}
        </button>
        <button
          type="button"
          data-testid="copy-markdown"
          onClick={() => void navigator.clipboard.writeText(toMarkdown(input, narrative))}
          className="rounded-md border border-line-strong px-3 py-1.5 text-fg hover:bg-panel"
        >
          Copy as Markdown
        </button>
        {error ? <p className="text-red">{error}</p> : null}
      </div>

      {narrative ? (
        <section data-testid="thesis-narrative" className="border-l-2 border-accent pl-4">
          <p className="font-serif text-[17px] leading-snug text-fg">{narrative.thesis}</p>
          <p className="mt-2 leading-relaxed text-fg">{narrative.rationale}</p>
          <p className="mt-2 leading-relaxed text-muted">{narrative.marketView}</p>
        </section>
      ) : null}

      <StressPanel />
    </div>
  );
}
