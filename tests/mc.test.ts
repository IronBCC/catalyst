import { describe, expect, it } from "vitest";

import type { Edge, EventNode, Graph, Node, NumericNode, Position } from "@/lib/schema";
import { emptyFixed, propagate } from "@/lib/engine/propagate";
import { monteCarlo, quantiles } from "@/lib/engine/mc";

const event = (id: string, base: number): EventNode => ({
  id,
  kind: "event",
  statement: id,
  resolution: id,
  base,
  lagDays: [0, 0],
  rationale: "",
  analogs: [],
  assumptions: [],
  confidence: "medium",
  marketQuery: "",
  isRoot: false,
  isTarget: false,
});

const numeric = (id: string, extra: Partial<NumericNode> = {}): NumericNode => ({
  id,
  kind: "numeric",
  name: id,
  unit: "%",
  ticker: null,
  current: null,
  baselineMove: 0,
  sigma: 0,
  rationale: "",
  assumptions: [],
  confidence: "medium",
  ...extra,
});

const graph = (nodes: Node[], edges: Edge[]): Graph => ({
  id: "graph",
  hypothesis: "A hypothesis",
  mode: "explore",
  target: null,
  horizonDays: 30,
  nodes,
  edges,
  sources: [],
  model: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: null,
});

const baseEdge = {
  mechanism: "",
  assumptions: [],
  confidence: "medium" as const,
  support: "model_assumption" as const,
  sourceIds: [],
};

const run = (source: Graph, positions: Position[] = [], keyNodeIds: string[] = []) =>
  monteCarlo(source, emptyFixed(), { n: 200, seed: 17, positions, keyNodeIds });

describe("monteCarlo", () => {
  it("returns identical samples for the same seed", () => {
    const source = graph([event("a", 0.4), numeric("n", { sigma: 3 })], []);

    const first = run(source);
    const second = run(source);

    expect(Array.from(first.numeric.get("n")!.samples)).toEqual(
      Array.from(second.numeric.get("n")!.samples),
    );
    expect(first.eventP).toEqual(second.eventP);
  });

  it("keeps pinned events at exact probabilities", () => {
    const fixed = emptyFixed();
    fixed.pins.set("off", false);
    fixed.pins.set("on", true);

    const result = monteCarlo(graph([event("off", 0.5), event("on", 0.5)], []), fixed, {
      n: 20,
      seed: 2,
      positions: [],
      keyNodeIds: ["off", "on"],
    });

    expect(result.eventP.get("off")).toBe(0);
    expect(result.eventP.get("on")).toBe(1);
  });

  it("matches expectation propagation on a tree", () => {
    const source = graph(
      [event("root", 0.6), event("child", 0.2)],
      [
        {
          ...baseEdge,
          id: "root->child",
          source: "root",
          target: "child",
          kind: "ee",
          polarity: "promote",
          strength: 0.7,
        },
      ],
    );

    const result = monteCarlo(source, emptyFixed(), {
      n: 20_000,
      seed: 8,
      positions: [],
      keyNodeIds: [],
    });

    expect(result.eventP.get("child")).toBeCloseTo(propagate(source, emptyFixed()).events.get("child")!.p, 2);
  });

  it("keeps zero-sigma numeric quantiles at the baseline move", () => {
    const result = run(graph([numeric("n", { baselineMove: 4, sigma: 0 })], []));

    expect(result.numeric.get("n")!.q).toEqual({ p10: 4, p25: 4, p50: 4, p75: 4, p90: 4, mean: 4 });
  });

  it("returns monotone quantiles", () => {
    const q = quantiles(new Float64Array([5, 1, 9, 3, 7]));

    expect([q.p10, q.p25, q.p50, q.p75, q.p90]).toEqual([... [q.p10, q.p25, q.p50, q.p75, q.p90]].sort((a, b) => a - b));
  });

  it("makes a fixed long loss certain", () => {
    const result = run(
      graph([numeric("asset", { ticker: "ASSET", baselineMove: -5, sigma: 0 })], []),
      [{ ticker: "ASSET", side: "long", size: 1, stopPct: null, targetPct: null }],
    );

    expect(result.pnl?.pLoss).toBe(1);
  });

  it("returns at most three descending cluster shares", () => {
    const result = run(graph([event("a", 0.4), event("b", 0.6)], []), [], ["a", "b"]);

    expect(result.clusters).toHaveLength(3);
    expect(result.clusters.reduce((sum, cluster) => sum + cluster.share, 0)).toBeLessThanOrEqual(1);
    expect(result.clusters.map((cluster) => cluster.share)).toEqual(
      [...result.clusters.map((cluster) => cluster.share)].sort((a, b) => b - a),
    );
  });
});
