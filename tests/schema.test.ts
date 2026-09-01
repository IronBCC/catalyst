import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BranchInputSchema,
  GenerateInputSchema,
  LlmGraph,
  WorkspaceSchema,
} from "@/lib/schema";

type Mutable = {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
};

const minimalGraph = {
  nodes: [
    {
      id: "root-event",
      kind: "event",
      statement: "Strait of Hormuz closes",
      resolution: "Lloyd's declares closure",
      base: 0.1,
      lagDays: [0, 3],
      rationale: "hypothesis root",
      analogs: [],
      assumptions: ["no diplomatic off-ramp"],
      confidence: "medium",
      marketQuery: "hormuz closure",
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
      baselineMove: 0,
      sigma: 12,
      rationale: "front-month contract",
      assumptions: [],
      confidence: "high",
    },
  ],
  edges: [
    {
      source: "root-event",
      target: "brent",
      mechanism: "closure removes ~20% of seaborne supply",
      assumptions: ["OPEC spare capacity cannot reroute"],
      confidence: "medium",
      sourceIds: [],
      polarity: null,
      strength: null,
      impact: 35,
      beta: null,
      threshold: null,
      direction: null,
      width: null,
    },
  ],
  summary: {
    headline: "Closure repricing",
    mainUncertainty: "duration of the closure",
    followUps: ["tanker insurance rates"],
  },
};

describe("LlmGraph", () => {
  it("parses a minimal valid graph", () => {
    expect(LlmGraph.parse(minimalGraph)).toBeTruthy();
  });

  it("rejects strength above 1", () => {
    const bad = structuredClone(minimalGraph) as unknown as Mutable;
    bad.edges[0].strength = 1.5;
    expect(LlmGraph.safeParse(bad).success).toBe(false);
  });

  it("rejects an edge missing assumptions", () => {
    const bad = structuredClone(minimalGraph) as unknown as Mutable;
    delete bad.edges[0].assumptions;
    expect(LlmGraph.safeParse(bad).success).toBe(false);
  });

  it("rejects an unknown key", () => {
    const bad = structuredClone(minimalGraph) as unknown as Mutable;
    bad.nodes[0].vibes = "high";
    expect(LlmGraph.safeParse(bad).success).toBe(false);
  });
});

describe("JSON Schema shape (what the provider actually sees)", () => {
  it("closes every object and requires every property", () => {
    const json: unknown = z.toJSONSchema(LlmGraph);
    const offenders: string[] = [];

    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}[${i}]`));
        return;
      }
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      const properties = obj.properties as Record<string, unknown> | undefined;
      if (obj.type === "object" && properties) {
        if (obj.additionalProperties !== false) offenders.push(`${path}: open object`);
        const required = (obj.required as string[] | undefined) ?? [];
        for (const key of Object.keys(properties)) {
          if (!required.includes(key)) offenders.push(`${path}.${key}: not required`);
        }
      }
      for (const [key, value] of Object.entries(obj)) walk(value, `${path}/${key}`);
    };

    walk(json, "#");
    expect(offenders).toEqual([]);
  });
});

describe("input schemas", () => {
  it("rejects a 4-character hypothesis", () => {
    const r = GenerateInputSchema.safeParse({
      hypothesis: "abcd",
      mode: "explore",
      target: null,
      horizonDays: 30,
      positions: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a valid generate input", () => {
    const r = GenerateInputSchema.safeParse({
      hypothesis: "Strait of Hormuz closes",
      mode: "chain",
      target: "Brent above 100",
      horizonDays: 90,
      positions: [{ ticker: "USO", side: "long", size: 1, stopPct: -8, targetPct: 25 }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects count 2 on branch input", () => {
    const r = BranchInputSchema.safeParse({
      graph: null,
      compact: "",
      text: null,
      attachTo: null,
      count: 2,
      blackSwan: false,
    });
    expect(r.success).toBe(false);
  });
});

describe("WorkspaceSchema", () => {
  it("accepts an empty version-1 workspace", () => {
    const r = WorkspaceSchema.safeParse({
      version: 1,
      graph: null,
      worlds: [],
      activeWorldId: null,
      compareWorldId: null,
      positions: [],
      thesis: {},
    });
    expect(r.success).toBe(true);
  });

  it("rejects a workspace from a different version", () => {
    const r = WorkspaceSchema.safeParse({
      version: 2,
      graph: null,
      worlds: [],
      activeWorldId: null,
      compareWorldId: null,
      positions: [],
      thesis: {},
    });
    expect(r.success).toBe(false);
  });
});
