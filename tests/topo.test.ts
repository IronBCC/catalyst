import { describe, expect, it } from "vitest";

import { breakCycles, CycleError, toposort } from "@/lib/engine/topo";

describe("toposort", () => {
  it("orders a chain from cause to effect", () => {
    expect(
      toposort(["a", "b", "c"], [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ]),
    ).toEqual(["a", "b", "c"]);
  });

  it("keeps the root first and leaf last in a diamond", () => {
    const order = toposort(["a", "b", "c", "d"], [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "d" },
      { source: "c", target: "d" },
    ]);

    expect(order[0]).toBe("a");
    expect(order.at(-1)).toBe("d");
  });

  it("throws a CycleError that names a cycle", () => {
    expect(() =>
      toposort(["a", "b"], [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ]),
    ).toThrow(CycleError);
  });
});

describe("breakCycles", () => {
  it("removes the lowest-weight edge in a cycle", () => {
    const edges = [
      { id: "a-b", source: "a", target: "b", weight: 0.9 },
      { id: "b-a", source: "b", target: "a", weight: 0.2 },
    ];

    const result = breakCycles(["a", "b"], edges, (edge) => edge.weight);

    expect(result.removed.map((edge) => edge.id)).toEqual(["b-a"]);
    expect(result.edges.map((edge) => edge.id)).toEqual(["a-b"]);
  });

  it("breaks every independent cycle", () => {
    const edges = [
      { id: "a-b", source: "a", target: "b", weight: 0.9 },
      { id: "b-a", source: "b", target: "a", weight: 0.2 },
      { id: "c-d", source: "c", target: "d", weight: 0.8 },
      { id: "d-c", source: "d", target: "c", weight: 0.1 },
    ];

    const result = breakCycles(["a", "b", "c", "d"], edges, (edge) => edge.weight);

    expect(result.removed).toHaveLength(2);
    expect(toposort(["a", "b", "c", "d"], result.edges)).toHaveLength(4);
  });
});
