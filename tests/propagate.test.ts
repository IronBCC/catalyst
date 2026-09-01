import { describe, expect, it } from "vitest";

import type { Edge, EventNode, Graph, Node, NumericNode } from "@/lib/schema";
import { causeQ, emptyFixed, propagate, sigmoid } from "@/lib/engine/propagate";

const event = (id: string, base: number, extra: Partial<EventNode> = {}): EventNode => ({
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
  ...extra,
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

const edge = (edge: Edge): Edge => edge;

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

describe("propagate", () => {
  it("combines promote and inhibit event causes with an audit term per parent", () => {
    const result = propagate(
      graph(
        [event("promote", 0.85), event("inhibit", 0.3), event("child", 0.2)],
        [
          edge({
            ...baseEdge,
            id: "promote->child",
            source: "promote",
            target: "child",
            kind: "ee",
            polarity: "promote",
            strength: 0.7,
          }),
          edge({
            ...baseEdge,
            id: "inhibit->child",
            source: "inhibit",
            target: "child",
            kind: "ee",
            polarity: "inhibit",
            strength: 0.5,
          }),
        ],
      ),
      emptyFixed(),
    );

    expect(result.events.get("child")?.p).toBeCloseTo(0.5746, 8);
    expect(result.events.get("child")?.terms).toHaveLength(3);
  });

  it("lets a pin ignore parents", () => {
    const fixed = emptyFixed();
    fixed.pins.set("child", true);

    const result = propagate(
      graph(
        [event("parent", 0), event("child", 0)],
        [
          edge({
            ...baseEdge,
            id: "parent->child",
            source: "parent",
            target: "child",
            kind: "ee",
            polarity: "promote",
            strength: 1,
          }),
        ],
      ),
      fixed,
    );

    expect(result.events.get("child")).toMatchObject({ p: 1, fixed: "pin" });
  });

  it("uses an override exactly", () => {
    const fixed = emptyFixed();
    fixed.overrides.set("child", 0.12);

    const result = propagate(graph([event("child", 0.9)], []), fixed);

    expect(result.events.get("child")).toMatchObject({ p: 0.12, fixed: "override" });
  });

  it("propagates event and numeric moves through a numeric chain", () => {
    const result = propagate(
      graph(
        [event("event", 0.5), numeric("first"), numeric("second", { current: 100 })],
        [
          edge({
            ...baseEdge,
            id: "event->first",
            source: "event",
            target: "first",
            kind: "en",
            impact: -10,
          }),
          edge({
            ...baseEdge,
            id: "first->second",
            source: "first",
            target: "second",
            kind: "nn",
            beta: 0.6,
          }),
        ],
      ),
      emptyFixed(),
    );

    expect(result.numerics.get("first")?.move).toBe(-5);
    expect(result.numerics.get("second")).toMatchObject({ move: -3, level: 97 });
  });

  it("maps a below-threshold numeric level through the sigmoid", () => {
    const below = edge({
      ...baseEdge,
      id: "price->event",
      source: "price",
      target: "event",
      kind: "ne",
      threshold: 70,
      direction: "below",
      width: 5,
      strength: 1,
    });
    const result = propagate(
      graph([numeric("price", { current: 65 }), event("event", 0)], [below]),
      emptyFixed(),
    );

    expect(causeQ(below, result.numerics.get("price")!, numeric("price", { current: 65 }))).toBeCloseTo(
      sigmoid(1),
      8,
    );
    expect(result.events.get("event")?.p).toBeCloseTo(0.73105858, 8);
  });

  it("clamps probabilities and turns NaN into a finite probability", () => {
    const result = propagate(graph([event("nan", Number.NaN), event("high", 2)], []), emptyFixed());

    expect(result.events.get("nan")?.p).toBe(0);
    expect(result.events.get("high")?.p).toBe(1);
  });
});
