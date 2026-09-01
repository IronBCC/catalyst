import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { emptyFixed, propagate } from "@/lib/engine/propagate";
import { GraphSchema, isEvent, isNumeric, LlmGraph } from "@/lib/schema";

const slugs = ["hormuz", "midterms", "export-controls", "photonics"];
const fixturePath = (slug: string) =>
  resolve(process.cwd(), "public", "fixtures", slug + ".json");

describe("example fixtures", () => {
  for (const slug of slugs) {
    it(slug + " is a complete propagating graph", async () => {
      const fixture = JSON.parse(await readFile(fixturePath(slug), "utf8")) as {
        graph: unknown;
        llm: unknown;
      };
      const graph = GraphSchema.parse(fixture.graph);

      expect(LlmGraph.parse(fixture.llm)).toBeTruthy();
      expect(graph.nodes.length).toBeGreaterThanOrEqual(8);
      expect(graph.nodes.filter(isNumeric).length).toBeGreaterThanOrEqual(2);
      expect(graph.nodes.filter((node) => isEvent(node) && node.isRoot)).toHaveLength(1);

      const computed = propagate(graph, emptyFixed());
      for (const node of graph.nodes.filter(isEvent)) {
        const probability = computed.events.get(node.id)?.p;
        if (probability === undefined) throw new Error("missing propagated probability for " + node.id);
        expect(probability).toBeGreaterThanOrEqual(0);
        expect(probability).toBeLessThanOrEqual(1);
      }
    });
  }
});
