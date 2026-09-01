import type {
  Edge,
  EventNode,
  Graph,
  LlmBranch,
  LlmGraph,
  Node,
  NumericNode,
} from "@/lib/schema";

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^[^a-z]+/, "event-")
    .slice(0, 64);

const repairNode = (node: LlmGraph["nodes"][number]): Node => {
  const id = slug(node.id);
  if (node.kind === "event") return { ...node, id } satisfies EventNode;
  return { ...node, id } satisfies NumericNode;
};

export const repairGraph = (_graph: LlmGraph): Graph => {
  throw new Error("repairGraph is supplied by the engine branch");
};

export const repairBranch = (branch: LlmBranch, graph: Graph) => {
  const known = new Map<string, Node>(graph.nodes.map((node) => [node.id, node]));

  return {
    candidates: branch.candidates.map((candidate) => {
      const node = repairNode(candidate.node);
      const ids = new Map([[candidate.node.id, node.id]]);
      const nodes = new Map(known);
      nodes.set(node.id, node);

      const edges = candidate.edges.map((edge, index): Edge => {
        const source = ids.get(edge.source) ?? edge.source;
        const target = ids.get(edge.target) ?? edge.target;
        const sourceNode = nodes.get(source);
        const targetNode = nodes.get(target);

        if (!sourceNode || !targetNode) throw new Error("branch edge has an unknown endpoint");

        const base = {
          id: "branch-" + index,
          source,
          target,
          mechanism: edge.mechanism,
          assumptions: edge.assumptions,
          confidence: edge.confidence,
          support: edge.sourceIds.length ? ("evidence" as const) : ("model_assumption" as const),
          sourceIds: edge.sourceIds,
        };

        if (sourceNode.kind === "event" && targetNode.kind === "event") {
          return {
            ...base,
            kind: "ee",
            polarity: edge.polarity ?? "promote",
            strength: edge.strength ?? 0.5,
          };
        }
        if (sourceNode.kind === "event" && targetNode.kind === "numeric") {
          return { ...base, kind: "en", impact: edge.impact ?? 0 };
        }
        if (sourceNode.kind === "numeric" && targetNode.kind === "numeric") {
          return { ...base, kind: "nn", beta: edge.beta ?? 0 };
        }
        return {
          ...base,
          kind: "ne",
          threshold: edge.threshold ?? 0,
          direction: edge.direction ?? "above",
          width: edge.width ?? 1,
          strength: edge.strength ?? 0.5,
        };
      });

      return { node, edges };
    }),
  };
};
