import { describe, expect, it } from "vitest";

import type { GenerateInput, Graph, LlmGraph, Source } from "@/lib/schema";
import { draftGraph, repairBranch, repairGraph, slugify } from "@/lib/engine/repair";

type LlmEvent = Extract<LlmGraph["nodes"][number], { kind: "event" }>;
type LlmNumeric = Extract<LlmGraph["nodes"][number], { kind: "numeric" }>;
type LlmEdge = LlmGraph["edges"][number];

const event = (id: string, extra: Partial<LlmEvent> = {}): LlmEvent => ({
  id,
  kind: "event",
  statement: id,
  resolution: id,
  base: 0.5,
  lagDays: [0, 0],
  rationale: "",
  analogs: [],
  assumptions: [],
  confidence: "medium",
  marketQuery: "",
  isRoot: false,
  isTarget: false,
  ...extra,
});

const numeric = (id: string, extra: Partial<LlmNumeric> = {}): LlmNumeric => ({
  id,
  kind: "numeric",
  name: id,
  unit: "%",
  ticker: null,
  current: null,
  baselineMove: 0,
  sigma: 1,
  rationale: "",
  assumptions: [],
  confidence: "medium",
  ...extra,
});

const edge = (extra: Partial<LlmEdge>): LlmEdge => ({
  source: "a",
  target: "b",
  mechanism: "",
  assumptions: [],
  confidence: "medium",
  sourceIds: [],
  polarity: null,
  strength: null,
  impact: null,
  beta: null,
  threshold: null,
  direction: null,
  width: null,
  ...extra,
});

const llmGraph = (nodes: LlmGraph["nodes"], edges: LlmEdge[]): LlmGraph => ({
  nodes,
  edges,
  summary: { headline: "Headline", mainUncertainty: "Uncertainty", followUps: [] },
});

const input = (extra: Partial<GenerateInput> = {}): GenerateInput => ({
  hypothesis: "A sufficiently detailed test hypothesis",
  mode: "explore",
  target: null,
  horizonDays: 30,
  positions: [],
  ...extra,
});

describe("slugify", () => {
  it("normalizes ids, prefixes digits, and stays within the id limit", () => {
    expect(slugify(" 99% Growth & Rates! ")).toBe("n-99-growth-rates");
    expect(slugify("---")).toBe("n");
    expect(slugify("a".repeat(80))).toHaveLength(64);
  });
});

describe("repairGraph", () => {
  it("deduplicates normalized ids", () => {
    const result = repairGraph(llmGraph([event("Rate Cuts"), event("rate cuts")], []), input(), "model");

    expect(result.nodes.map((node) => node.id)).toEqual(["rate-cuts", "rate-cuts-2"]);
  });

  it("drops self-loops and unknown endpoints, then breaks the weakest cycle edge", () => {
    const result = repairGraph(
      llmGraph(
        [event("a"), event("b")],
        [
          edge({ source: "a", target: "a", strength: 0.1 }),
          edge({ source: "a", target: "missing", strength: 0.1 }),
          edge({ source: "a", target: "b", strength: 0.9 }),
          edge({ source: "b", target: "a", strength: 0.2 }),
        ],
      ),
      input(),
      "model",
    );

    expect(result.edges.map((item) => item.id)).toEqual(["a->b"]);
  });

  it("infers edge kinds, defaults permitted parameters, drops missing required ones, and clamps values", () => {
    const result = repairGraph(
      llmGraph(
        [event("a", { isRoot: true, base: 2 }), event("b"), numeric("n"), numeric("m")],
        [
          edge({ source: "a", target: "b" }),
          edge({ source: "a", target: "n" }),
          edge({ source: "b", target: "n", impact: 200 }),
          edge({ source: "n", target: "m" }),
          edge({ source: "m", target: "n", beta: 20 }),
          edge({ source: "n", target: "b" }),
          edge({ source: "m", target: "b", threshold: 70 }),
        ],
      ),
      input(),
      "model",
    );
    const byId = new Map(result.edges.map((item) => [item.id, item]));

    expect(result.nodes.find((node) => node.id === "a")).toMatchObject({ base: 1 });
    expect(byId.get("a->b")).toMatchObject({ kind: "ee", polarity: "promote", strength: 0.5 });
    expect(byId.has("a->n")).toBe(false);
    expect(byId.get("b->n")).toMatchObject({ kind: "en", impact: 100 });
    expect(byId.has("n->m")).toBe(false);
    expect(byId.get("m->n")).toMatchObject({ kind: "nn", beta: 10 });
    expect(byId.has("n->b")).toBe(false);
    expect(byId.get("m->b")).toMatchObject({ kind: "ne", direction: "above", width: 7 });
  });

  it("sets exactly one root and chooses a chain target by token overlap or synthesizes one", () => {
    const selected = repairGraph(
      llmGraph(
        [
          event("first", { isRoot: true }),
          event("rate-cut", { statement: "Federal Reserve rate cut decision", isRoot: true }),
          event("inflation"),
        ],
        [],
      ),
      input({ mode: "chain", target: "rate cut" }),
      "model",
    );
    const synthesized = repairGraph(
      llmGraph([numeric("price")], []),
      input({ mode: "chain", target: "unmatched destination" }),
      "model",
    );

    expect(selected.nodes.filter((node) => node.kind === "event" && node.isRoot)).toHaveLength(1);
    expect(selected.nodes.find((node) => node.kind === "event" && node.isTarget)?.id).toBe("rate-cut");
    expect(synthesized.nodes.find((node) => node.kind === "event" && node.isRoot)).toMatchObject({ base: 0.5 });
    expect(synthesized.nodes.find((node) => node.kind === "event" && node.isTarget)).toMatchObject({ base: 0.3 });
  });

  it("filters dangling source ids into model assumptions", () => {
    const result = repairGraph(
      llmGraph([event("a", { isRoot: true }), event("b")], [edge({ sourceIds: ["gone"] })]),
      input(),
      "model",
    );

    expect(result.sources).toEqual([]);
    expect(result.edges[0]).toMatchObject({ sourceIds: [], support: "model_assumption", id: "a->b" });
    expect(result.id).toEqual(expect.any(String));
    expect(result.generatedAt).toEqual(expect.any(String));
  });

  it("preserves valid fixture-shaped content apart from normalized ids", () => {
    const result = repairGraph(
      llmGraph(
        [
          event("Fed Decision", {
            statement: "The Federal Reserve cuts rates",
            resolution: "Rate cut announced",
            base: 0.4,
            lagDays: [1, 3],
            rationale: "Policy easing",
            analogs: ["2019"],
            assumptions: ["Inflation cools"],
            confidence: "high",
            marketQuery: "Fed rate cut odds",
            isRoot: true,
          }),
          numeric("S&P 500", {
            name: "S&P 500",
            unit: "%",
            ticker: "SPY",
            current: 500,
            baselineMove: 2,
            sigma: 3,
            rationale: "Risk appetite",
            assumptions: ["No recession"],
            confidence: "medium",
          }),
        ],
        [edge({ source: "Fed Decision", target: "S&P 500", impact: 2, mechanism: "Easier policy" })],
      ),
      input(),
      "model",
    );

    expect(result.nodes).toMatchObject([
      { id: "fed-decision", statement: "The Federal Reserve cuts rates", base: 0.4, confidence: "high" },
      { id: "s-p-500", ticker: "SPY", current: 500, baselineMove: 2, sigma: 3 },
    ]);
    expect(result.edges).toMatchObject([{ id: "fed-decision->s-p-500", kind: "en", impact: 2 }]);
  });
});

describe("repairBranch", () => {
  it("keeps verified source ids as evidence and turns dangling ids into assumptions", () => {
    const source: Source = {
      id: "source",
      title: "Source",
      url: "https://example.com",
      publisher: "Example",
      publishedAt: null,
    };
    const graph: Graph = {
      ...repairGraph(
        llmGraph([event("root", { isRoot: true }), event("other")], []),
        input(),
        "model",
      ),
      sources: [source],
    };
    const item = {
      node: event("branch"),
      edges: [
        edge({ source: "root", target: "branch", strength: 0.4, sourceIds: ["source", "gone"] }),
        edge({ source: "branch", target: "other", strength: 0.4, sourceIds: ["gone"] }),
      ],
    };

    const result = repairBranch(item, graph);

    expect(result.edges[0]).toMatchObject({ sourceIds: ["source"], support: "evidence" });
    expect(result.edges[1]).toMatchObject({ sourceIds: [], support: "model_assumption" });
  });
});

describe("draftGraph", () => {
  it("keeps minimally identifiable streaming nodes, defaults numbers, filters invalid edges, and returns null without nodes", () => {
    const draft = draftGraph(
      {
        nodes: [
          { id: "Fast News", kind: "event", statement: "Fast news" },
          { id: "Price", kind: "numeric", name: "Price" },
        ],
        edges: [
          { source: "Fast News", target: "Price", impact: -10 },
          { source: "Price", target: "Fast News", threshold: "not-a-number" },
        ],
      },
      input(),
    );

    expect(draft?.nodes).toMatchObject([
      { id: "fast-news", kind: "event", base: 0.5 },
      { id: "price", kind: "numeric", baselineMove: 0, sigma: 0 },
    ]);
    expect(draft?.edges).toMatchObject([{ id: "fast-news->price", kind: "en", impact: -10 }]);
    expect(draftGraph({ nodes: [] }, input())).toBeNull();
  });
});
