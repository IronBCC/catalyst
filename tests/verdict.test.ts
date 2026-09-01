import { describe, expect, it } from "vitest";

import type { Edge, EventNode, Graph, Node } from "@/lib/schema";
import { emptyFixed, propagate } from "@/lib/engine/propagate";
import { chainVerdict } from "@/lib/engine/verdict";

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

const graph = (nodes: Node[], edges: Edge[]): Graph => ({
  id: "graph",
  hypothesis: "A hypothesis",
  mode: "chain",
  target: "target",
  horizonDays: 30,
  nodes,
  edges,
  sources: [],
  model: "test",
  generatedAt: "2026-01-01T00:00:00.000Z",
  summary: null,
});

const edge = (id: string, source: string, target: string, strength: number): Edge => ({
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

describe("chainVerdict", () => {
  it("finds the strongest path, its weakest link, and the intervention lift", () => {
    const source = graph(
      [event("root", 0.5), event("middle", 0), event("target", 0)],
      [edge("root->middle", "root", "middle", 0.9), edge("middle->target", "middle", "target", 0.4)],
    );
    const result = chainVerdict(source, emptyFixed(), "root", "target");
    const whenTrue = emptyFixed();
    whenTrue.pins.set("root", true);
    const whenFalse = emptyFixed();
    whenFalse.pins.set("root", false);

    expect(result.pathEdgeIds).toEqual(["root->middle", "middle->target"]);
    expect(result.weakestEdgeId).toBe("middle->target");
    expect(result.lift).toBeCloseTo(
      propagate(source, whenTrue).events.get("target")!.p - propagate(source, whenFalse).events.get("target")!.p,
    );
  });

  it("counts both paths through a diamond", () => {
    const source = graph(
      [event("root", 0.5), event("left", 0), event("right", 0), event("target", 0)],
      [
        edge("root->left", "root", "left", 0.5),
        edge("left->target", "left", "target", 0.5),
        edge("root->right", "root", "right", 0.5),
        edge("right->target", "right", "target", 0.5),
      ],
    );

    expect(chainVerdict(source, emptyFixed(), "root", "target").pathCount).toBe(2);
  });

  it.each([
    [0.35, "strong"],
    [0.15, "plausible"],
    [0.05, "weak"],
    [0, "none"],
  ] as const)("labels a %s lift as %s", (strength, label) => {
    const source = graph(
      [event("root", 0.5), event("target", 0)],
      [edge("root->target", "root", "target", strength)],
    );

    expect(chainVerdict(source, emptyFixed(), "root", "target").label).toBe(label);
  });
});
