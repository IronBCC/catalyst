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
    <section data-testid="market-says" className="rounded border border-line p-2">
      <h3 className="mb-1 text-muted">Market says</h3>
      <p className="text-fg">{best.title}</p>
      <p className="text-muted">
        {Math.round(best.yes * 100)}% yes · volume {Math.round(best.volume).toLocaleString()}
        {best.endDate ? ` · ends ${best.endDate}` : ""}
      </p>
      <p className={edge >= 0 ? "text-green" : "text-red"}>
        model {Math.round(modelP * 100)}% · edge {edge >= 0 ? "+" : ""}
        {edge}pp
      </p>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          data-testid="adopt-market"
          onClick={() => onAdopt(best.yes, best.url)}
          className="rounded border border-blue px-2 py-0.5 text-blue"
        >
          Adopt {Math.round(best.yes * 1000) / 10}%
        </button>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue underline"
          >
            open market
          </a>
        ) : null}
      </div>
      {rest.length ? (
        <details className="mt-1 text-muted">
          <summary>{rest.length} other matches</summary>
          <ul className="mt-1 space-y-0.5">
            {rest.map((m) => {
              const alt = safeHref(m.url);
              return (
                <li key={m.url}>
                  {alt ? (
                    <a href={alt} target="_blank" rel="noopener noreferrer" className="underline">
                      {m.title}
                    </a>
                  ) : (
                    m.title
                  )}{" "}
                  · {Math.round(m.yes * 100)}%
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
