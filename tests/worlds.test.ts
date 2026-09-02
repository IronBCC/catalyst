import { describe, expect, it } from "vitest";

import type { Edge, Edit, EventNode, Graph, Node, World } from "@/lib/schema";
import {
  applyEdits,
  BASELINE_ID,
  forkWorld,
  newWorld,
  removeEditsFor,
  worldDiff,
} from "@/lib/engine/worlds";

const event = (id: string): EventNode => ({
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
});

const edge = (id: string, source: string, target: string, strength = 0.5): Edge => ({
  id,
  source,
  target,
  mechanism: "",
  assumptions: [],
  confidence: "medium",
  support: "model_assumption",
  sourceIds: [],
  kind: "ee",
  polarity: "promote",
  strength,
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

describe("applyEdits", () => {
  it("lets the last fixed edit win for a node", () => {
    const result = applyEdits(graph([event("a")], []), [
      { type: "pin", nodeId: "a", value: true },
      { type: "override", nodeId: "a", value: 0.25 },
    ]);

    expect(result.fixed.pins.has("a")).toBe(false);
    expect(result.fixed.overrides.get("a")).toBe(0.25);
  });

  it("removes a cut edge", () => {
    const result = applyEdits(graph([event("a"), event("b")], [edge("a->b", "a", "b")]), [
      { type: "cutEdge", edgeId: "a->b" },
    ]);

    expect(result.graph.edges).toEqual([]);
  });

  it("adds only edges whose endpoints exist", () => {
    const result = applyEdits(graph([event("a")], []), [
      {
        type: "addNode",
        node: event("b"),
        edges: [edge("a->b", "a", "b"), edge("missing->b", "missing", "b")],
      },
    ]);

    expect(result.graph.nodes.map((node) => node.id)).toEqual(["a", "b"]);
    expect(result.graph.edges.map((item) => item.id)).toEqual(["a->b"]);
  });

  it("removes the weakest edge when an added node closes a cycle", () => {
    const result = applyEdits(
      graph([event("a"), event("b")], [edge("a->b", "a", "b", 0.9)]),
      [
        {
          type: "addNode",
          node: event("c"),
          edges: [edge("b->c", "b", "c", 0.8), edge("c->a", "c", "a", 0.2)],
        },
      ],
    );

    expect(result.graph.edges.map((item) => item.id)).not.toContain("c->a");
  });
});

describe("world helpers", () => {
  it("removes every fixed edit for one node", () => {
    const edits: Edit[] = [
      { type: "pin", nodeId: "a", value: true },
      { type: "override", nodeId: "a", value: 0.2 },
      { type: "adoptMarket", nodeId: "a", value: 0.3, source: "https://example.com" },
      { type: "pin", nodeId: "b", value: false },
    ];

    expect(removeEditsFor(edits, "a")).toEqual([{ type: "pin", nodeId: "b", value: false }]);
  });

  it("forks with inherited edits and a parent id", () => {
    const parent: World = {
      ...newWorld("Parent", "parent"),
      edits: [{ type: "pin", nodeId: "a", value: true }],
    };
    const edit: Edit = { type: "override", nodeId: "a", value: 0.2 };

    const child = forkWorld(parent, "Child", edit);

    expect(child.parentId).toBe("parent");
    expect(child.edits).toEqual([...parent.edits, edit]);
  });

  it("reports nodes added and edges removed by the active world", () => {
    const compare: World = {
      ...newWorld("Baseline", BASELINE_ID),
      edits: [{ type: "addNode", node: event("old"), edges: [] }],
    };
    const active: World = {
      ...newWorld("Active", "active"),
      edits: [
        { type: "addNode", node: event("new"), edges: [] },
        { type: "cutEdge", edgeId: "a->b" },
      ],
    };

    const diff = worldDiff(active, compare);

    expect(diff.addedNodeIds).toEqual(new Set(["new"]));
    expect(diff.removedEdgeIds).toEqual(new Set(["a->b"]));
  });
});

describe("addNode", () => {
  it("is idempotent: re-applying it does not duplicate the edge", () => {
    const base = graph([event("a")], []);
    const edit: Edit = {
      type: "addNode",
      node: event("b"),
      edges: [edge("b-a", "b", "a")],
    };

    const once = applyEdits(base, [edit]).graph;
    const twice = applyEdits(once, [edit]).graph;

    expect(once.edges).toHaveLength(1);
    expect(twice.edges).toHaveLength(1);
    expect(twice.nodes).toHaveLength(2);
  });
});

describe("reviseNode", () => {
  const base = graph([event("a"), event("b"), event("c")], [
    edge("a-b", "a", "b"),
    edge("b-c", "b", "c"),
  ]);

  it("swaps the node and replaces only its own edges", () => {
    const revised = { ...event("b"), statement: "b, corrected" };
    const edit: Edit = {
      type: "reviseNode",
      node: revised,
      edges: [edge("b-c-2", "b", "c", 0.9)],
    };

    const result = applyEdits(base, [edit]);

    expect(result.graph.nodes.find((n) => n.id === "b")).toMatchObject({
      statement: "b, corrected",
    });
    // a->b touched b, so it went with the revision; b->c came back restated.
    expect(result.graph.edges.map((e) => e.id)).toEqual(["b-c-2"]);
  });

  it("ignores a revision of a node the world does not have", () => {
    const edit: Edit = { type: "reviseNode", node: event("zzz"), edges: [] };
    expect(applyEdits(base, [edit]).graph).toEqual(base);
  });
});
