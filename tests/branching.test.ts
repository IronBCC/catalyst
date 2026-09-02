import { describe, expect, it } from "vitest";
import { atNodeLimit, looksLikeEvent, MAX_GRAPH_NODES, nodeBudget } from "@/lib/branching";
import type { Graph, Node } from "@/lib/schema";

const node = (id: string): Node => ({
  id,
  kind: "event",
  statement: "something happens",
  resolution: "someone reports it",
  base: 0.2,
  lagDays: [0, 1],
  rationale: "",
  analogs: [],
  assumptions: [],
  confidence: "medium",
  marketQuery: "",
  isRoot: false,
  isTarget: false,
});

const graphOf = (count: number): Graph => ({
  id: "g",
  hypothesis: "h",
  mode: "explore",
  target: null,
  horizonDays: 30,
  nodes: Array.from({ length: count }, (_, i) => node(`n${i}`)),
  edges: [],
  sources: [],
  model: "test",
  generatedAt: "2026-09-01T00:00:00.000Z",
  summary: null,
});

describe("node limit", () => {
  it("is not reached by a normal graph", () => {
    expect(atNodeLimit(graphOf(12))).toBe(false);
    expect(nodeBudget(graphOf(12))).toBe(MAX_GRAPH_NODES - 12);
  });

  it("is reached exactly at the cap", () => {
    expect(atNodeLimit(graphOf(MAX_GRAPH_NODES))).toBe(true);
    expect(nodeBudget(graphOf(MAX_GRAPH_NODES))).toBe(0);
  });

  it("treats a missing graph as empty", () => {
    expect(atNodeLimit(null)).toBe(false);
    expect(nodeBudget(null)).toBe(MAX_GRAPH_NODES);
  });
});

describe("looksLikeEvent", () => {
  it("accepts outcomes", () => {
    expect(looksLikeEvent("Brent settles above $100 within the horizon")).toBe(true);
    expect(looksLikeEvent("The Strait of Hormuz closes to tanker traffic")).toBe(true);
    expect(looksLikeEvent("OPEC announces an emergency production increase")).toBe(true);
  });

  it("rejects the research actions the model returns as follow-ups", () => {
    expect(looksLikeEvent("Track UKMTO incident reports and war-risk quotes weekly")).toBe(false);
    expect(looksLikeEvent("Monitor US-Iran back-channel for interim-deal signals")).toBe(false);
    expect(looksLikeEvent("Watch Saudi/UAE bypass pipeline utilization data")).toBe(false);
    expect(looksLikeEvent("Set USO stop discipline")).toBe(false);
  });

  it("rejects fragments and prose with no outcome verb", () => {
    expect(looksLikeEvent("oil")).toBe(false);
    expect(looksLikeEvent("some general thoughts about the region")).toBe(false);
  });
});
