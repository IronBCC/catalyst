import { describe, expect, it } from "vitest";
import { layoutLR } from "@/lib/layout";

const box = (id: string) => ({ id, width: 260, height: 120 });

describe("layoutLR", () => {
  it("puts a child to the right of its parent", () => {
    const pos = layoutLR([box("a"), box("b")], [{ source: "a", target: "b" }]);
    expect(pos.get("a")!.x).toBeLessThan(pos.get("b")!.x);
  });

  it("gives two nodes in the same rank distinct y", () => {
    const pos = layoutLR(
      [box("a"), box("b"), box("c")],
      [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
      ],
    );
    expect(pos.get("b")!.y).not.toBe(pos.get("c")!.y);
    expect(pos.get("b")!.x).toBe(pos.get("c")!.x);
  });

  it("ranks a diamond in three columns", () => {
    const pos = layoutLR(
      [box("a"), box("b"), box("c"), box("d")],
      [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "b", target: "d" },
        { source: "c", target: "d" },
      ],
    );
    const columns = new Set([...pos.values()].map((p) => p.x));
    expect(columns.size).toBe(3);
  });

  it("uses the longest path, not the shortest, for a skip edge", () => {
    const pos = layoutLR(
      [box("a"), box("b"), box("c")],
      [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "a", target: "c" },
      ],
    );
    expect(pos.get("c")!.x).toBeGreaterThan(pos.get("b")!.x);
  });

  it("places an isolated node and survives a cycle without hanging", () => {
    const pos = layoutLR(
      [box("a"), box("b"), box("lonely")],
      [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    );
    expect(pos.size).toBe(3);
    expect(pos.get("lonely")).toBeTruthy();
  });
});
