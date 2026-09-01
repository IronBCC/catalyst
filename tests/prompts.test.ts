import { describe, expect, it } from "vitest";
import type { Graph } from "@/lib/schema";
import {
  branchPrompt,
  compactGraph,
  generatePrompt,
} from "@/lib/prompts";

const graph: Graph = {
  id: "hormuz",
  hypothesis: "The Strait of Hormuz closes",
  mode: "chain",
  target: "Brent crude rises above 100",
  horizonDays: 90,
  nodes: [
    {
      id: "closure",
      kind: "event",
      statement: "The Strait of Hormuz closes to tanker traffic",
      resolution: "Lloyd's declares a closure",
      base: 0.62,
      lagDays: [0, 3],
      rationale: "Tanker insurance costs surge after a closure",
      analogs: ["1980 Iran-Iraq tanker war"],
      assumptions: ["No diplomatic off-ramp"],
      confidence: "medium",
      marketQuery: "Strait of Hormuz closure",
      isRoot: true,
      isTarget: false,
    },
    {
      id: "brent",
      kind: "numeric",
      name: "Brent crude",
      unit: "USD/bbl",
      ticker: "BZ=F",
      current: 72.4,
      baselineMove: 15,
      sigma: 12,
      rationale: "Supply disruption reprices Brent",
      assumptions: ["OPEC spare capacity is limited"],
      confidence: "medium",
    },
  ],
  edges: [
    {
      id: "closure-brent",
      source: "closure",
      target: "brent",
      kind: "en",
      mechanism: "The closure removes seaborne supply",
      assumptions: ["Tankers cannot reroute quickly"],
      confidence: "medium",
      support: "model_assumption",
      sourceIds: [],
      impact: 35,
    },
  ],
  sources: [],
  model: "openai/gpt-5.6-luna",
  generatedAt: "2026-09-01T00:00:00.000Z",
  summary: null,
};

describe("prompts", () => {
  it("compacts every node and edge with probabilities rounded to two decimals", () => {
    const compact = compactGraph(graph, { p: { closure: 0.618, brent: 0.1 } });

    expect(compact.split("\n")).toEqual([
      "closure | event | The Strait of Hormuz closes to tanker traffic | p=0.62",
      "brent | numeric | Brent crude | p=0.10",
      "closure->brent | en | 35 | The closure removes seaborne supply",
    ]);
  });

  it("includes horizon, chain target, and positions in a generation prompt", () => {
    const prompt = generatePrompt({
      hypothesis: graph.hypothesis,
      mode: "chain",
      target: graph.target,
      horizonDays: 90,
      positions: [
        { ticker: "USO", side: "long", size: 2, stopPct: -8, targetPct: 25 },
      ],
    });

    expect(prompt).toContain("Horizon: 90 days");
    expect(prompt).toContain("Chain target: Brent crude rises above 100");
    expect(prompt).toContain("USO | long | size 2");
  });

  it("asks for low-probability black swans using a 0.05 base-rate ceiling", () => {
    const prompt = branchPrompt({
      graph,
      compact: "compact graph",
      text: null,
      attachTo: null,
      count: 3,
      blackSwan: true,
    });

    expect(prompt).toContain("0.05");
  });
});
