import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createCatalystStore, EMPTY_WORKSPACE } from "@/store";
import { BASELINE_ID } from "@/lib/engine/worlds";
import type { Graph } from "@/lib/schema";

const graph: Graph = {
  id: "g1",
  hypothesis: "Hormuz closes",
  mode: "explore",
  target: null,
  horizonDays: 30,
  nodes: [
    {
      id: "root",
      kind: "event",
      statement: "Hormuz closes",
      resolution: "Lloyd's confirms",
      base: 0.1,
      lagDays: [0, 3],
      rationale: "root",
      analogs: [],
      assumptions: [],
      confidence: "medium",
      marketQuery: "hormuz",
      isRoot: true,
      isTarget: false,
    },
  ],
  edges: [],
  sources: [],
  model: "test",
  generatedAt: "2026-09-01T00:00:00.000Z",
  summary: null,
};

const memoryStorage = (seed?: string): StateStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  if (seed !== undefined) data.set("catalyst.workspace", seed);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe("workspace store", () => {
  let store: ReturnType<typeof createCatalystStore>;

  beforeEach(() => {
    store = createCatalystStore(null);
  });

  it("setGraph creates exactly one world, the baseline", () => {
    store.getState().setGraph(graph);
    const s = store.getState();
    expect(s.worlds).toHaveLength(1);
    expect(s.worlds[0].id).toBe(BASELINE_ID);
    expect(s.activeWorldId).toBe(BASELINE_ID);
  });

  it("mutate on baseline forks instead of editing it", () => {
    store.getState().setGraph(graph);
    store.getState().mutate({ type: "pin", nodeId: "root", value: true }, "Pinned root");
    const s = store.getState();
    expect(s.worlds).toHaveLength(2);
    expect(s.worlds[0].edits).toEqual([]);
    expect(s.activeWorldId).not.toBe(BASELINE_ID);
    expect(s.worlds[1].edits).toHaveLength(1);
    expect(s.worlds[1].parentId).toBe(BASELINE_ID);
  });

  it("mutate on a non-baseline world appends in place", () => {
    store.getState().setGraph(graph);
    store.getState().mutate({ type: "pin", nodeId: "root", value: true });
    const forkedId = store.getState().activeWorldId;
    store.getState().mutate({ type: "override", nodeId: "root", value: 0.4 });
    const s = store.getState();
    expect(s.worlds).toHaveLength(2);
    expect(s.activeWorldId).toBe(forkedId);
    expect(s.worlds[1].edits).toHaveLength(2);
  });

  it("commitTransient(false) still forks while baseline is active", () => {
    store.getState().setGraph(graph);
    store.getState().setTransient({ type: "override", nodeId: "root", value: 0.6 });
    store.getState().commitTransient(false);
    const s = store.getState();
    expect(s.worlds).toHaveLength(2);
    expect(s.worlds[0].edits).toEqual([]);
    expect(s.transient).toBeNull();
  });

  it("commitTransient(true) forks from a non-baseline world", () => {
    store.getState().setGraph(graph);
    store.getState().mutate({ type: "pin", nodeId: "root", value: true });
    store.getState().setTransient({ type: "override", nodeId: "root", value: 0.6 });
    store.getState().commitTransient(true, "What if");
    const s = store.getState();
    expect(s.worlds).toHaveLength(3);
    expect(s.worlds[2].parentId).toBe(s.worlds[1].id);
    expect(s.worlds[2].edits).toHaveLength(2);
  });

  it("removeEditsFor clears a pin but never touches baseline", () => {
    store.getState().setGraph(graph);
    store.getState().mutate({ type: "pin", nodeId: "root", value: true });
    store.getState().removeEditsFor("root");
    expect(store.getState().worlds[1].edits).toEqual([]);

    store.getState().setActiveWorld(BASELINE_ID);
    store.getState().removeEditsFor("root");
    expect(store.getState().worlds[0].edits).toEqual([]);
  });

  it("an error status leaves graph, worlds and thesis untouched", () => {
    store.getState().setGraph(graph);
    store.getState().mutate({ type: "pin", nodeId: "root", value: true });
    const before = store.getState();
    const snapshot = { graph: before.graph, worlds: before.worlds, thesis: before.thesis };
    store.getState().setStatus({ phase: "error", message: "upstream 502" });
    const after = store.getState();
    expect(after.graph).toBe(snapshot.graph);
    expect(after.worlds).toBe(snapshot.worlds);
    expect(after.thesis).toBe(snapshot.thesis);
  });
});

describe("persistence", () => {
  it("writes version 1 and no ephemeral keys", () => {
    const storage = memoryStorage();
    const store = createCatalystStore(storage);
    store.getState().setGraph(graph);
    store.getState().pushLog({ kind: "user", text: "hello" });
    store.getState().select({ type: "node", id: "root" });

    const raw = storage.data.get("catalyst.workspace")!;
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.state.graph.id).toBe("g1");
    expect(parsed.state).not.toHaveProperty("log");
    expect(parsed.state).not.toHaveProperty("selection");
    expect(parsed.state).not.toHaveProperty("status");
  });

  it("hydrates to an empty workspace when the stored value is not JSON", () => {
    const store = createCatalystStore(memoryStorage("{not json"));
    expect(store.getState().graph).toBeNull();
    expect(store.getState().worlds).toEqual(EMPTY_WORKSPACE.worlds);
  });

  it("migrates an older version to an empty workspace", () => {
    const store = createCatalystStore(
      memoryStorage(JSON.stringify({ version: 0, state: { graph: { id: "old" } } })),
    );
    expect(store.getState().graph).toBeNull();
  });
});
