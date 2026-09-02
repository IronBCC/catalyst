"use client";

import { useEffect } from "react";
import { safeHref } from "@/lib/safeUrl";
import { scoreMatch, type MarketMatch } from "@/lib/market";
import type { EventNode } from "@/lib/schema";
import { useStore } from "@/store";

interface MarketSaysProps {
  node: EventNode;
  modelP: number;
  onAdopt(value: number, source: string): void;
}

export default function MarketSays({ node, modelP, onAdopt }: MarketSaysProps) {
  const markets = useStore((s) => s.markets);
  const setMarkets = useStore((s) => s.setMarkets);
  const matches = markets[node.id];

  useEffect(() => {
    if (matches !== undefined || !node.marketQuery) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/markets?q=${encodeURIComponent(node.marketQuery)}`);
        const body = await res.json();
        if (!cancelled) setMarkets(node.id, (body?.data as MarketMatch[]) ?? []);
      } catch {
        if (!cancelled) setMarkets(node.id, []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matches, node.id, node.marketQuery, setMarkets]);

  if (!matches?.length) return null;

  const ranked = [...matches].sort(
    (a, b) => scoreMatch(node.statement, b.title) - scoreMatch(node.statement, a.title),
  );
  const [best, ...rest] = ranked;
  const href = safeHref(best.url);
  const edge = Math.round((modelP - best.yes) * 100);

  return (
    <section data-testid="market-says" className="rounded-lg border border-line bg-bg p-3 text-xs">
      <h3 className="text-muted">Polymarket says</h3>
      <p className="mt-1 text-fg">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:decoration-fg">
            {best.title}
          </a>
        ) : (
          best.title
        )}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <div className="text-muted">market</div>
          <div className="num text-[15px] text-fg">{Math.round(best.yes * 100)}%</div>
        </div>
        <div>
          <div className="text-muted">model</div>
          <div className="num text-[15px] text-fg">{Math.round(modelP * 100)}%</div>
        </div>
        <div>
          <div className="text-muted">edge</div>
          <div className={`num text-[15px] ${edge >= 0 ? "text-green" : "text-red"}`}>
            {edge >= 0 ? "+" : ""}
            {edge}pp
          </div>
        </div>
      </div>
      <p className="num mt-1 text-[11px] text-muted">
        volume {Math.round(best.volume).toLocaleString()}
        {best.endDate ? ` · ends ${best.endDate.slice(0, 10)}` : ""}
      </p>
      <button
        type="button"
        data-testid="adopt-market"
        onClick={() => onAdopt(best.yes, best.url)}
        className="mt-2 rounded-md border border-blue/50 bg-blue-soft px-2.5 py-1 text-blue hover:border-blue"
      >
        Use the market&apos;s {Math.round(best.yes * 1000) / 10}%
      </button>
      {rest.length ? (
        <details className="mt-2 text-muted">
          <summary className="cursor-pointer">{rest.length} other matches</summary>
          <ul className="mt-1 space-y-0.5">
            {rest.map((m, i) => {
              const alt = safeHref(m.url);
              return (
                // The same market can match twice under different titles, so the
                // url alone is not a unique key.
                <li key={`${m.url}-${i}`}>
                  {alt ? (
                    <a href={alt} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2">
                      {m.title}
                    </a>
                  ) : (
                    m.title
                  )}{" "}
                  <span className="num">{Math.round(m.yes * 100)}%</span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
