import { describe, expect, it } from "vitest";

import type { Graph, NumericNode, ThesisInput } from "@/lib/schema";
import type { Computed } from "@/lib/engine/propagate";
import type { McResult, Quantiles } from "@/lib/engine/mc";
import type { Quote } from "@/lib/market";
import { buildThesis, toMarkdown } from "@/lib/thesis";

const numeric = (id: string, ticker: string | null, current: number | null = null): NumericNode => ({
  id,
  kind: "numeric",
  name: id,
  unit: "%",
  ticker,
  current,
  baselineMove: 0,
  sigma: 0,
  rationale: "",
  assumptions: [],
  confidence: "medium",
});

const graph = (nodes: NumericNode[]): Graph => ({
  id: "graph",
  hypothesis: "A test hypothesis",
  mode: "explore",
  target: null,
  horizonDays: 30,
  nodes,
  edges: [],
  sources: [],
  model: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: null,
});

const quantile = (p10: number, p50: number, p90: number): Quantiles => ({
  p10,
  p25: (p10 + p50) / 2,
  p50,
  p75: (p50 + p90) / 2,
  p90,
  mean: p50,
});

const computed = (values: Record<string, Quantiles>): Computed => ({
  order: Object.keys(values),
  events: new Map(),
  numerics: new Map(
    Object.entries(values).map(([id, q]) => [id, { move: q.p50, level: null, fixed: null, terms: [] }]),
  ),
});

const simulation = (values: Record<string, Quantiles>): McResult => ({
  n: 5,
  eventP: new Map(),
  numeric: new Map(
    Object.entries(values).map(([id, q]) => [id, { q, samples: new Float64Array([q.p10, q.p50, q.p90]) }]),
  ),
  pnl: null,
  clusters: [],
});

const quote = (price: number): Quote => ({
  symbol: "ASSET",
  price,
  changePct: 0,
  currency: "USD",
  time: "2026-01-01T00:00:00.000Z",
});

describe("buildThesis", () => {
  it("ranks the largest confident move first", () => {
    const values = {
      uncertain: quantile(-30, 10, 40),
      confident: quantile(1, 4, 6),
    };

    const result = buildThesis(
      graph([numeric("uncertain", "UNC"), numeric("confident", "CON")]),
      computed(values),
      simulation(values),
      null,
      [],
      {},
      {},
      [],
      "Baseline",
    );

    expect(result.candidates[0]?.ticker).toBe("CON");
    expect(result.primary?.ticker).toBe("CON");
  });

  it("uses p10 as a long stop and p90 as a long take-profit", () => {
    const values = { asset: quantile(-10, 5, 20) };
    const result = buildThesis(
      graph([numeric("asset", "ASSET")]),
      computed(values),
      simulation(values),
      null,
      [],
      { ASSET: quote(100) },
      {},
      [],
      "Baseline",
    );

    expect(result.primary).toMatchObject({ direction: "long", stop: 90, takeProfit: 120 });
  });

  it("flips stop and take-profit quantiles for a short", () => {
    const values = { asset: quantile(-20, -5, 10) };
    const result = buildThesis(
      graph([numeric("asset", "ASSET")]),
      computed(values),
      simulation(values),
      null,
      [],
      { ASSET: quote(100) },
      {},
      [],
      "Baseline",
    );

    expect(result.primary?.direction).toBe("short");
    expect(result.primary?.stop).toBeCloseTo(110);
    expect(result.primary?.takeProfit).toBeCloseTo(80);
  });

  it("leaves stop and take-profit empty without an entry", () => {
    const values = { asset: quantile(-10, 5, 20) };
    const result = buildThesis(
      graph([numeric("asset", "ASSET")]),
      computed(values),
      simulation(values),
      null,
      [],
      { ASSET: null },
      {},
      [],
      "Baseline",
    );

    expect(result.primary).toMatchObject({ entry: null, stop: null, takeProfit: null });
  });
});

describe("toMarkdown", () => {
  it("includes every section and ends with the required disclaimer", () => {
    const input: ThesisInput = {
      hypothesis: "A test hypothesis",
      horizonDays: 30,
      worldName: "Baseline",
      primary: {
        ticker: "ASSET",
        name: "Asset",
        direction: "long",
        expectedMove: 5,
        p10: -10,
        p90: 20,
        entry: 100,
        stop: 90,
        takeProfit: 120,
      },
      candidates: [],
      invalidation: [{ nodeId: "risk", statement: "Risk", deltaPnl: -2 }],
      confirmation: [{ nodeId: "confirm", statement: "Confirm", deltaPnl: 2 }],
      risks: [{ nodeId: "tail", statement: "Tail", base: 0.1 }],
      marketView: [{ statement: "Market", model: 0.6, market: 0.5, edge: 0.1, url: "https://example.com" }],
      mc: { pProfit: 0.6, ev: 5, p5: -10 },
      verdict: {
        lift: 0.2,
        pIfTrue: 0.6,
        pIfFalse: 0.4,
        label: "plausible",
        pathEdgeIds: ["a->b"],
        weakestEdgeId: "a->b",
        pathCount: 1,
      },
    };
    const markdown = toMarkdown(input, {
      thesis: "Thesis",
      rationale: "Rationale",
      invalidation: ["Invalidate"],
      confirmation: ["Confirm"],
      risks: ["Risk"],
      marketView: "Market view",
    });

    for (const heading of [
      "## Trade",
      "## Candidates",
      "## Invalidation",
      "## Confirmation",
      "## Tail risks",
      "## Model vs market",
      "## Monte Carlo",
      "## Chain verdict",
      "## Narrative",
    ]) {
      expect(markdown).toContain(heading);
    }
    expect(markdown.endsWith("Model estimates, not investment advice. Stops and targets are Monte-Carlo quantiles.")).toBe(
      true,
    );
  });
});
