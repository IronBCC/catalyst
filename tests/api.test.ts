import { describe, expect, it } from "vitest";
import type { Deps } from "@/lib/llm";
import type { Graph } from "@/lib/schema";
import { handleBranch } from "@/lib/api/branch";
import { handleGenerate } from "@/lib/api/generate";
import { chatResponse, fakeFetch } from "./helpers/fakeFetch";
import { repairBranch } from "@/lib/engine/repair";

const graph: Graph = {
  id: "hormuz",
  hypothesis: "The Strait of Hormuz closes",
  mode: "explore",
  target: null,
  horizonDays: 90,
  nodes: [
    {
      id: "closure",
      kind: "event",
      statement: "The Strait of Hormuz closes",
      resolution: "Lloyd's declares a closure",
      base: 0.2,
      lagDays: [0, 3],
      rationale: "Tanker risk rises",
      analogs: [],
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
      baselineMove: 0,
      sigma: 12,
      rationale: "Supply disruption",
      assumptions: [],
      confidence: "medium",
    },
  ],
  edges: [
    {
      id: "closure-brent",
      source: "closure",
      target: "brent",
      kind: "en",
      mechanism: "Closure removes supply",
      assumptions: [],
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

const candidate = {
  node: {
    id: "Supply shock!",
    kind: "event" as const,
    statement: "A supply shock removes oil exports",
    resolution: "Exports fall by 10%",
    base: 0.04,
    lagDays: [1, 7] as [number, number],
    rationale: "Infrastructure is vulnerable",
    analogs: ["Abqaiq 2019"],
    assumptions: ["Repair takes a week"],
    confidence: "low" as const,
    marketQuery: "oil supply disruption",
    isRoot: false,
    isTarget: false,
  },
  edges: [
    {
      source: "Supply shock!",
      target: "brent",
      mechanism: "Lost exports tighten supply",
      assumptions: ["Inventories do not offset the loss"],
      confidence: "medium" as const,
      sourceIds: [],
      polarity: null,
      strength: null,
      impact: 12,
      beta: null,
      threshold: null,
      direction: null,
      width: null,
    },
  ],
};

const branchRequest = (body: unknown, contentType = "application/json") =>
  new Request("http://test/api/branch", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify(body),
  });

const branchInput = {
  graph,
  compact: "closure | event | The Strait of Hormuz closes | p=0.20",
  text: "Add a supply shock",
  attachTo: "closure",
  count: 1,
  blackSwan: false,
};

const deps = (fetchImpl: typeof fetch, key = "test-key"): Deps => ({
  fetchImpl,
  env: { OPENROUTER_API_KEY: key },
});

describe("API handlers", () => {
  it("returns 503 from branch when the OpenRouter key is absent", async () => {
    const response = await handleBranch(
      branchRequest(branchInput),
      deps(fakeFetch(() => chatResponse({ candidates: [candidate] })), ""),
      repairBranch,
    );

    expect(response.status).toBe(503);
  });

  it("returns 415 from branch for text/plain", async () => {
    const response = await handleBranch(
      branchRequest(branchInput, "text/plain"),
      deps(fakeFetch(() => chatResponse({ candidates: [candidate] }))),
      repairBranch,
    );

    expect(response.status).toBe(415);
  });

  it("returns 400 from branch for an invalid body", async () => {
    const response = await handleBranch(
      branchRequest({}),
      deps(fakeFetch(() => chatResponse({ candidates: [candidate] }))),
      repairBranch,
    );

    expect(response.status).toBe(400);
  });

  it("returns 502 from branch when the upstream aborts", async () => {
    const fetchImpl = fakeFetch(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const response = await handleBranch(branchRequest(branchInput), deps(fetchImpl), repairBranch);

    expect(response.status).toBe(502);
  });

  it("returns 502 after two schema-invalid upstream branch responses", async () => {
    const fetchImpl = fakeFetch(() => chatResponse({ candidates: "x" }));
    const response = await handleBranch(branchRequest(branchInput), deps(fetchImpl), repairBranch);

    expect(response.status).toBe(502);
    expect(fetchImpl.calls).toHaveLength(2);
  });

  it("returns repaired branch candidates with typed edges", async () => {
    const response = await handleBranch(
      branchRequest(branchInput),
      deps(fakeFetch(() => chatResponse({ candidates: [candidate] }))),
      repairBranch,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      candidates: [
        {
          node: { id: "supply-shock", kind: "event" },
          edges: [{ kind: "en", source: "supply-shock", target: "brent", impact: 12 }],
        },
      ],
    });
  });

  it("returns 503 from generate when the OpenRouter key is absent", async () => {
    const response = await handleGenerate(
      new Request("http://test/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hypothesis: "The Strait of Hormuz closes",
          mode: "explore",
          target: null,
          horizonDays: 30,
          positions: [],
        }),
      }),
      deps(fakeFetch(() => chatResponse({})), ""),
    );

    expect(response.status).toBe(503);
  });
});
