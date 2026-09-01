import { expect, it } from "vitest";
import { repairGraph } from "@/lib/engine/repair";
import { emptyFixed, propagate } from "@/lib/engine/propagate";
import { EXAMPLE_BY_SLUG } from "@/lib/examples";
import { defaultDeps, modelId, structured } from "@/lib/llm";
import { GENERATE_SYSTEM, generatePrompt } from "@/lib/prompts";
import { isEvent, isNumeric, LlmGraph } from "@/lib/schema";

it.skipIf(!process.env.RUN_LIVE_OPENROUTER || !process.env.OPENROUTER_API_KEY)(
  "generates a complete Hormuz graph",
  async () => {
    const input = EXAMPLE_BY_SLUG.get("hormuz")?.input;
    if (!input) throw new Error("missing Hormuz example");

    const deps = defaultDeps();
    const llm = await structured(deps, LlmGraph, GENERATE_SYSTEM, generatePrompt(input));
    const graph = repairGraph(llm, input, modelId(deps.env));

    expect(graph.nodes.length).toBeGreaterThanOrEqual(8);
    expect(graph.nodes.filter(isNumeric).length).toBeGreaterThanOrEqual(2);
    expect(graph.nodes.filter((node) => isEvent(node) && node.isRoot)).toHaveLength(1);
    for (const node of graph.nodes.filter(isEvent)) {
      const probability = propagate(graph, emptyFixed()).events.get(node.id)?.p;
      if (probability === undefined) throw new Error("missing propagated probability for " + node.id);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(1);
    }
  },
);
