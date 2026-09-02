import { describe, expect, it } from "vitest";

import type { Edge, EventNode, Graph, Node, NumericNode } from "@/lib/schema";
import {
  baseRatesAreCalibrated,
  chainIsSound,
  checkGraph,
  hasCounterForce,
  resolutionsAreCheckable,
  rootReaches,
  runsAreStable,
  signsMatchMechanisms,
  tickersResolve,
} from "@/lib/quality";

const GOOD_RESOLUTION = "Reuters reports the final settlement figures for the quarter";

const event = (id: string, over: Partial<EventNode> = {}): EventNode => ({
  id,
  kind: "event",
  statement: id,
  resolution: GOOD_RESOLUTION,
  base: 0.3,
  lagDays: [0, 0],
  rationale: "",
  analogs: [],
  assumptions: [],
  confidence: "medium",
  marketQuery: "",
  isRoot: false,
  isTarget: false,
  ...over,
});

const numeric = (id: string, over: Partial<NumericNode> = {}): NumericNode => ({
  id,
  kind: "numeric",
  name: id,
  unit: "usd",
  ticker: null,
  current: 100,
  baselineMove: 0,
  sigma: 10,
  rationale: "",
  assumptions: [],
  confidence: "medium",
  ...over,
});

const graph = (nodes: Node[], edges: Edge[], over: Partial<Graph> = {}): Graph => ({
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
  ...over,
});

const eeEdge = (
  id: string,
  source: string,
  target: string,
  mechanism: string,
  over: { polarity?: "promote" | "inhibit"; strength?: number } = {},
): Edge => ({
  id,
  source,
  target,
  mechanism,
  assumptions: [],
  confidence: "medium",
  support: "model_assumption",
  sourceIds: [],
  kind: "ee",
  polarity: over.polarity ?? "promote",
  strength: over.strength ?? 0.6,
});

const enEdge = (id: string, source: string, target: string, mechanism: string, impact: number): Edge => ({
  id,
  source,
  target,
  mechanism,
  assumptions: [],
  confidence: "medium",
  support: "model_assumption",
  sourceIds: [],
  kind: "en",
  impact,
});

const nnEdge = (id: string, source: string, target: string, mechanism: string, beta: number): Edge => ({
  id,
  source,
  target,
  mechanism,
  assumptions: [],
  confidence: "medium",
  support: "model_assumption",
  sourceIds: [],
  kind: "nn",
  beta,
});

/* 1 tickersResolve --------------------------------------------------- */

describe("tickersResolve", () => {
  it("passes when every ticker has a resolved quote", () => {
    const g = graph([numeric("n1", { ticker: "AAPL" })], []);
    const result = tickersResolve(g, { AAPL: { price: 100 } });
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when a ticker is missing from the resolved quotes", () => {
    const g = graph([numeric("n1", { ticker: "AAPL" })], []);
    const result = tickersResolve(g, {});
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0);
  });

  it("fails with score 0 when no numeric node carries a ticker", () => {
    const g = graph([numeric("n1", { ticker: null })], []);
    const result = tickersResolve(g, {});
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0);
  });
});

/* 2 rootReaches ------------------------------------------------------- */

describe("rootReaches", () => {
  it("passes when every node is reachable from the root", () => {
    const g = graph(
      [event("root", { isRoot: true }), event("child")],
      [eeEdge("e1", "root", "child", "")],
    );
    const result = rootReaches(g);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when a node is disconnected from the root entirely", () => {
    const g = graph(
      [event("root", { isRoot: true }), event("child"), event("orphan")],
      [eeEdge("e1", "root", "child", "")],
    );
    const result = rootReaches(g);
    expect(result.ok).toBe(false);
    // One of the two parts fails: the graph has a loose node but no stranded numeric.
    expect(result.score).toBe(0.5);
    expect(result.detail).toContain("disconnected");
  });

  it("accepts an upstream precursor that feeds the root", () => {
    const g = graph(
      [event("precursor"), event("root", { isRoot: true })],
      [eeEdge("e1", "precursor", "root", "")],
    );
    const result = rootReaches(g);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when a numeric node is not downstream of the root", () => {
    const g = graph(
      [event("root", { isRoot: true }), numeric("brent")],
      [eeEdge("e1", "root", "root", "")],
    );
    g.edges = [
      {
        id: "e1",
        kind: "en",
        source: "brent",
        target: "root",
        mechanism: "priced in",
        assumptions: [],
        confidence: "medium",
        support: "model_assumption",
        sourceIds: [],
        impact: 5,
      },
    ];
    const result = rootReaches(g);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("cannot reach");
  });

  it("fails with score 0 when there is no root", () => {
    const g = graph([event("solo")], []);
    const result = rootReaches(g);
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0);
  });
});

/* 3 signsMatchMechanisms ----------------------------------------------- */

describe("signsMatchMechanisms", () => {
  it("passes when dampening and amplifying mechanisms match their sign", () => {
    const g = graph(
      [event("root", { isRoot: true }), numeric("n1"), numeric("n2")],
      [
        enEdge("e1", "root", "n1", "eases the pressure", -8),
        nnEdge("e2", "n1", "n2", "boosts the rally", 3),
      ],
    );
    const result = signsMatchMechanisms(g);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when a sign contradicts its mechanism", () => {
    const g = graph(
      [event("root", { isRoot: true }), numeric("n1"), numeric("n2"), numeric("n3")],
      [
        enEdge("e1", "root", "n1", "eases the pressure", 10),
        enEdge("e2", "root", "n2", "boosts the rally", -5),
        nnEdge("e3", "n1", "n3", "affects the market broadly", 5),
      ],
    );
    const result = signsMatchMechanisms(g);
    expect(result.ok).toBe(false);
    expect(result.score).toBeCloseTo(1 / 3);
  });
});

/* 4 baseRatesAreCalibrated --------------------------------------------- */

describe("baseRatesAreCalibrated", () => {
  it("passes with spread, a tail and distinct values", () => {
    const g = graph([event("a", { base: 0.1 }), event("b", { base: 0.5 }), event("c", { base: 0.9 })], []);
    const result = baseRatesAreCalibrated(g);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails on degenerate, unspread, undiverse base rates (partial score)", () => {
    const g = graph([event("a", { base: 0 }), event("b", { base: 0 })], []);
    const result = baseRatesAreCalibrated(g);
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.25);
  });

  it("fails when no event sits at or below 0.15", () => {
    const g = graph([event("a", { base: 0.4 }), event("b", { base: 0.7 })], []);
    const result = baseRatesAreCalibrated(g);
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.75);
  });
});

/* 5 hasCounterForce ------------------------------------------------------ */

describe("hasCounterForce", () => {
  it("passes with an inhibiting edge and a negative numeric edge", () => {
    const g = graph(
      [event("root", { isRoot: true }), event("t"), event("e"), numeric("n")],
      [eeEdge("e1", "root", "t", "", { polarity: "inhibit" }), enEdge("e2", "e", "n", "", -5)],
    );
    const result = hasCounterForce(g);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });

  it("half-passes with only an inhibiting edge", () => {
    const g = graph(
      [event("root", { isRoot: true }), event("t")],
      [eeEdge("e1", "root", "t", "", { polarity: "inhibit" })],
    );
    const result = hasCounterForce(g);
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.5);
  });
});

/* 6 resolutionsAreCheckable --------------------------------------------- */

describe("resolutionsAreCheckable", () => {
  it("passes when resolutions name a number or an authority", () => {
    const g = graph([event("a")], []);
    const result = resolutionsAreCheckable(g);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });

  it('fails on a vague resolution like "it happens"', () => {
    const g = graph([event("a", { resolution: "it happens" })], []);
    const result = resolutionsAreCheckable(g);
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0);
  });

  it("partially fails when only one of two resolutions is vague", () => {
    const g = graph([event("a"), event("b", { resolution: "it happens" })], []);
    const result = resolutionsAreCheckable(g);
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.5);
  });
});

/* 7 chainIsSound ---------------------------------------------------------- */

describe("chainIsSound", () => {
  it("is not applicable in explore mode", () => {
    const g = graph([], [], { mode: "explore" });
    const result = chainIsSound(g);
    expect(result.ok).toBe(true);
    expect(result.detail).toBe("explore mode, not applicable");
  });

  it("fails when there is no target node", () => {
    const g = graph([event("root", { isRoot: true })], [], { mode: "chain" });
    const result = chainIsSound(g);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("no target node");
  });

  it("fails when there is no root node", () => {
    const g = graph([event("target", { isTarget: true })], [], { mode: "chain" });
    const result = chainIsSound(g);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe("no root node");
  });

  it("passes on a simple two-event chain with a positive lift", () => {
    const g = graph(
      [event("root", { isRoot: true }), event("target", { isTarget: true, base: 0.2 })],
      [eeEdge("e1", "root", "target", "promotes the target outcome", { strength: 0.6 })],
      { mode: "chain", target: "target" },
    );
    const result = chainIsSound(g);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });
});

/* 8 runsAreStable ----------------------------------------------------------- */

describe("runsAreStable", () => {
  it("passes when two runs share topic words and root probability", () => {
    const a = graph([event("root", { isRoot: true, base: 0.3, statement: "Oil prices spike sharply this quarter" })], []);
    const b = graph([event("root", { isRoot: true, base: 0.3, statement: "Oil prices spike sharply next quarter" })], []);
    const result = runsAreStable(a, b);
    expect(result.ok).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails when the two runs describe unrelated topics", () => {
    const a = graph([event("root", { isRoot: true, base: 0.4, statement: "Wheat harvest fails across Ukraine region entirely" })], []);
    const b = graph([event("root", { isRoot: true, base: 0.4, statement: "Central bank raises benchmark interest rates today" })], []);
    const result = runsAreStable(a, b);
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.5);
  });

  it("fails when the root probability drifts more than 25 points", () => {
    const a = graph([event("root", { isRoot: true, base: 0.1, statement: "Oil prices spike after the strait closes" })], []);
    const b = graph([event("root", { isRoot: true, base: 0.6, statement: "Oil prices spike after the strait closes" })], []);
    const result = runsAreStable(a, b);
    expect(result.ok).toBe(false);
    expect(result.score).toBe(0.5);
  });
});

/* checkGraph ------------------------------------------------------------------ */

describe("checkGraph", () => {
  it("returns exactly 7 checks with unique ids", () => {
    const g = graph(
      [
        event("root", { isRoot: true, base: 0.5 }),
        event("spike", { base: 0.15 }),
        event("relief", { base: 0.85 }),
        numeric("oil-price", { ticker: "cl", current: 80 }),
      ],
      [
        eeEdge("e1", "root", "spike", "raises the odds of a spike"),
        eeEdge("e2", "root", "relief", "the safety valve eases the shortage risk", { polarity: "inhibit" }),
        enEdge("e3", "spike", "oil-price", "increases oil prices sharply", 15),
        enEdge("e4", "relief", "oil-price", "the relief effort reduces oil prices", -10),
      ],
    );
    const result = checkGraph(g, { cl: { price: 80 } });
    expect(result).toHaveLength(7);
    expect(new Set(result.map((c) => c.id)).size).toBe(7);
  });
});
