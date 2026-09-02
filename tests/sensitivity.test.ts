import { describe, expect, it } from "vitest";

import type { Edge, EventNode, Graph, Node, NumericNode, Position } from "@/lib/schema";
import { emptyFixed } from "@/lib/engine/propagate";
import { evalTarget, stopTriggers, tornado } from "@/lib/engine/sensitivity";

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
  sigma: 1,
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

describe("tornado", () => {
  it("leaves the traded instrument out of its own P&L drivers", () => {
    const vix = numeric("vix", { ticker: "^VIX", sigma: 10 });
    const spike = event("spike", 0.3);
    const g = graph(
      [spike, vix],
      [{ ...baseEdge, id: "spike-vix", source: "spike", target: "vix", kind: "en", impact: 20 }],
    );
    const positions: Position[] = [
      { ticker: "^VIX", side: "long", size: 1, stopPct: null, targetPct: null },
    ];

    const rows = tornado(g, emptyFixed(), { type: "pnl" }, positions);

    expect(rows.map((row) => row.nodeId)).toEqual(["spike"]);
  });

  it("ranks the root first in an event-to-numeric three-node chain", () => {
    const result = tornado(
      graph(
        [event("root", 0.5), numeric("middle", { sigma: 1 }), numeric("target", { sigma: 1 })],
        [
          { ...baseEdge, id: "root->middle", source: "root", target: "middle", kind: "en", impact: 20 },
          { ...baseEdge, id: "middle->target", source: "middle", target: "target", kind: "nn", beta: 1 },
        ],
      ),
      emptyFixed(),
      { type: "numeric", id: "target" },
      [],
    );

    expect(result[0]?.nodeId).toBe("root");
  });

  it("keeps inhibitor sensitivity negative", () => {
    const result = tornado(
      graph(
        [event("inhibitor", 0.5), event("target", 0.8)],
        [
          {
            ...baseEdge,
            id: "inhibitor->target",
            source: "inhibitor",
            target: "target",
            kind: "ee",
            polarity: "inhibit",
            strength: 0.5,
          },
        ],
      ),
      emptyFixed(),
      { type: "event", id: "target" },
      [],
    );

    expect(result[0]?.delta).toBeLessThan(0);
  });

  it("evaluates a P&L target", () => {
    const positions: Position[] = [
      { ticker: "ASSET", side: "long", size: 1, stopPct: null, targetPct: null },
    ];

    expect(
      evalTarget(
        graph([numeric("asset", { ticker: "ASSET", baselineMove: -5, sigma: 0 })], []),
        emptyFixed(),
        { type: "pnl" },
        positions,
      ),
    ).toBe(-5);
  });

  it("lists events that push P&L below the stop", () => {
    const positions: Position[] = [
      { ticker: "ASSET", side: "long", size: 1, stopPct: null, targetPct: null },
    ];
    const source = graph(
      [event("shock", 0), numeric("asset", { ticker: "ASSET", sigma: 0 })],
      [{ ...baseEdge, id: "shock->asset", source: "shock", target: "asset", kind: "en", impact: -10 }],
    );

    expect(stopTriggers(source, emptyFixed(), positions, 5)).toEqual([{ nodeId: "shock", pnl: -10 }]);
  });
});
