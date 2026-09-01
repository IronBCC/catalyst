"use client";

import { create, type StoreApi, type UseBoundStore } from "zustand";
import { persist, type StateStorage } from "zustand/middleware";
import { useMemo } from "react";
import {
  type Edit,
  type Graph,
  type LlmThesis,
  type Position,
  type Verdict,
  type World,
  type Workspace,
} from "@/lib/schema";
import {
  BASELINE_ID,
  applyEdits,
  forkWorld,
  newWorld,
  removeEditsFor as dropEditsFor,
  worldDiff,
} from "@/lib/engine/worlds";
import { emptyFixed, propagate, type Computed, type Fixed } from "@/lib/engine/propagate";
import { monteCarlo, type McResult } from "@/lib/engine/mc";
import { chainVerdict } from "@/lib/engine/verdict";
import type { MarketMatch, Quote } from "@/lib/market";

export type Status = {
  phase: "idle" | "generating" | "branching" | "thesis" | "error";
  message: string;
};

export type LogEntry = {
  id: string;
  kind: "user" | "status" | "summary" | "world" | "error";
  text: string;
  worldId?: string;
  followUps?: string[];
  retry?: () => void;
};

export type Selection = { type: "node" | "edge"; id: string } | null;

export type State = Workspace & {
  selection: Selection;
  transient: Edit | null;
  status: Status;
  tab: "map" | "scenarios" | "thesis";
  log: LogEntry[];
  draft: Graph | null;
  markets: Record<string, MarketMatch[]>;
  quotes: Record<string, Quote | null>;

  setGraph(g: Graph, snapshot?: { markets: State["markets"]; quotes: State["quotes"] }): void;
  setDraft(g: Graph | null): void;
  mutate(edit: Edit | Edit[], name?: string): void;
  removeEditsFor(nodeId: string): void;
  setTransient(e: Edit | null): void;
  commitTransient(asNew: boolean, name?: string): void;
  addWorld(w: World, activate: boolean): void;
  setActiveWorld(id: string): void;
  setCompareWorld(id: string | null): void;
  select(s: Selection): void;
  setTab(t: State["tab"]): void;
  setPositions(p: Position[]): void;
  pushLog(e: Omit<LogEntry, "id">): void;
  setStatus(s: Status): void;
  setMarkets(nodeId: string, m: MarketMatch[]): void;
  setQuotes(q: Record<string, Quote | null>): void;
  setThesis(worldId: string, t: LlmThesis): void;
  importWorkspace(p: Workspace): void;
  reset(): void;
};

export const EMPTY_WORKSPACE: Workspace = {
  version: 1,
  graph: null,
  worlds: [],
  activeWorldId: null,
  compareWorldId: null,
  positions: [],
  thesis: {},
};

const IDLE: Status = { phase: "idle", message: "" };

let logSeq = 0;
const nextLogId = () => `log-${++logSeq}`;

/** Renaming a world is the only reason the baseline label is not a constant. */
const BASELINE_NAME = "Baseline";

export function createCatalystStore(storage: StateStorage | null): UseBoundStore<StoreApi<State>> {
  const init = (
    set: (fn: (s: State) => Partial<State>) => void,
    get: () => State,
  ): State => ({
    ...EMPTY_WORKSPACE,
    selection: null,
    transient: null,
    status: IDLE,
    tab: "map",
    log: [],
    draft: null,
    markets: {},
    quotes: {},

    setGraph: (graph, snapshot) =>
      set(() => ({
        graph,
        draft: null,
        worlds: [newWorld(BASELINE_NAME, BASELINE_ID)],
        activeWorldId: BASELINE_ID,
        compareWorldId: null,
        thesis: {},
        selection: null,
        transient: null,
        status: IDLE,
        markets: snapshot?.markets ?? {},
        quotes: snapshot?.quotes ?? {},
      })),

    setDraft: (draft) => set(() => ({ draft })),

    // Any edit made while Baseline is active forks: Baseline is immutable, so
    // the user can always get back to the untouched model.
    mutate: (edit, name) =>
      set((s) => {
        const edits = Array.isArray(edit) ? edit : [edit];
        const active = s.worlds.find((w) => w.id === s.activeWorldId);
        if (!active) return {};
        if (active.id === BASELINE_ID) {
          const forked = forkWorld(active, name ?? "World", edits);
          return { worlds: [...s.worlds, forked], activeWorldId: forked.id };
        }
        return {
          worlds: s.worlds.map((w) =>
            w.id === active.id ? { ...w, edits: [...w.edits, ...edits] } : w,
          ),
        };
      }),

    removeEditsFor: (nodeId) =>
      set((s) => {
        const active = s.worlds.find((w) => w.id === s.activeWorldId);
        if (!active || active.id === BASELINE_ID) return {};
        return {
          worlds: s.worlds.map((w) =>
            w.id === active.id ? { ...w, edits: dropEditsFor(w.edits, nodeId) } : w,
          ),
        };
      }),

    setTransient: (transient) => set(() => ({ transient })),

    commitTransient: (asNew, name) => {
      const { transient } = get();
      if (!transient) return;
      const active = get().worlds.find((w) => w.id === get().activeWorldId);
      if (!active) {
        set(() => ({ transient: null }));
        return;
      }
      if (asNew || active.id === BASELINE_ID) {
        const forked = forkWorld(active, name ?? "World", transient);
        set((s) => ({
          worlds: [...s.worlds, forked],
          activeWorldId: forked.id,
          transient: null,
        }));
        return;
      }
      set((s) => ({
        worlds: s.worlds.map((w) =>
          w.id === active.id ? { ...w, edits: [...w.edits, transient] } : w,
        ),
        transient: null,
      }));
    },

    addWorld: (w, activate) =>
      set((s) => ({
        worlds: [...s.worlds, w],
        activeWorldId: activate ? w.id : s.activeWorldId,
      })),

    setActiveWorld: (activeWorldId) => set(() => ({ activeWorldId, transient: null })),
    setCompareWorld: (compareWorldId) => set(() => ({ compareWorldId })),
    select: (selection) => set(() => ({ selection })),
    setTab: (tab) => set(() => ({ tab })),
    setPositions: (positions) => set(() => ({ positions })),

    pushLog: (entry) => set((s) => ({ log: [...s.log, { ...entry, id: nextLogId() }] })),

    // A failed call must never touch graph, worlds or thesis.
    setStatus: (status) => set(() => ({ status })),

    setMarkets: (nodeId, m) => set((s) => ({ markets: { ...s.markets, [nodeId]: m } })),
    setQuotes: (q) => set((s) => ({ quotes: { ...s.quotes, ...q } })),
    setThesis: (worldId, t) => set((s) => ({ thesis: { ...s.thesis, [worldId]: t } })),

    importWorkspace: (p) =>
      set(() => ({
        ...p,
        draft: null,
        selection: null,
        transient: null,
        status: IDLE,
        log: [],
        markets: {},
        quotes: {},
      })),

    reset: () =>
      set(() => ({
        ...EMPTY_WORKSPACE,
        selection: null,
        transient: null,
        status: IDLE,
        tab: "map" as const,
        log: [],
        draft: null,
        markets: {},
        quotes: {},
      })),
  });

  if (!storage) return create<State>()(init);

  return create<State>()(
    persist(init, {
      name: "catalyst.workspace",
      version: 1,
      storage: {
        getItem: (name) => {
          const raw = storage.getItem(name);
          if (typeof raw !== "string") return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => storage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => storage.removeItem(name),
      },
      // persist merges the return value over the initial state, so handing back
      // the workspace slice alone is enough; an unknown version resets.
      migrate: (persisted, version) =>
        (version === 1 ? persisted : EMPTY_WORKSPACE) as State,
      partialize: (s) => ({
        version: 1,
        graph: s.graph,
        worlds: s.worlds,
        activeWorldId: s.activeWorldId,
        compareWorldId: s.compareWorldId,
        positions: s.positions,
        thesis: s.thesis,
      }) as unknown as State,
    }),
  );
}

/**
 * localStorage throws in private mode and returns garbage after a schema change.
 * Both must load an empty workspace rather than a white screen.
 */
export const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      const value = localStorage.getItem(key);
      if (value == null) return null;
      JSON.parse(value);
      return value;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* quota or private mode: state stays in memory */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
};

export const useStore = createCatalystStore(safeStorage);

export type Computation = {
  graph: Graph | null;
  world: World | null;
  fixed: Fixed;
  computed: Computed | null;
  compare: Computed | null;
  mc: McResult | null;
  diff: ReturnType<typeof worldDiff> | null;
  verdict: Verdict | null;
};

const EMPTY_FIXED = emptyFixed();

/**
 * Everything derived from the workspace, in one memo.
 *
 * Propagation is cheap enough to run on every slider frame. Monte-Carlo is not,
 * so while a transient edit is in flight the previous result is reused until the
 * drag settles.
 */
export function useComputed(): Computation {
  const graph = useStore((s) => s.graph);
  const draft = useStore((s) => s.draft);
  const worlds = useStore((s) => s.worlds);
  const activeWorldId = useStore((s) => s.activeWorldId);
  const compareWorldId = useStore((s) => s.compareWorldId);
  const transient = useStore((s) => s.transient);
  const positions = useStore((s) => s.positions);
  const quotes = useStore((s) => s.quotes);

  const source = draft ?? graph;
  const world = worlds.find((w) => w.id === activeWorldId) ?? null;
  const compareWorld = worlds.find((w) => w.id === compareWorldId) ?? null;

  const priced = useMemo(() => {
    if (!source) return null;
    return {
      ...source,
      nodes: source.nodes.map((n) =>
        n.kind === "numeric" && n.ticker && quotes[n.ticker]
          ? { ...n, current: quotes[n.ticker]!.price }
          : n,
      ),
    };
  }, [source, quotes]);

  const edits = useMemo(
    () => (world ? (transient ? [...world.edits, transient] : world.edits) : []),
    [world, transient],
  );

  const applied = useMemo(
    () => (priced ? applyEdits(priced, edits) : null),
    [priced, edits],
  );

  const computed = useMemo(
    () => (applied ? propagate(applied.graph, applied.fixed) : null),
    [applied],
  );

  // With no compare world chosen, an in-flight slider still needs something to
  // measure against, so it is compared with the same world before the drag.
  const compare = useMemo(() => {
    if (!priced) return null;
    const baseEdits = compareWorld ? compareWorld.edits : transient ? world?.edits : null;
    if (!baseEdits) return null;
    const c = applyEdits(priced, baseEdits);
    return propagate(c.graph, c.fixed);
  }, [priced, compareWorld, transient, world]);

  // Without an explicit comparison, "new" means new relative to the world this
  // one was forked from, which is what a freshly branched node should read as.
  const diff = useMemo(() => {
    if (!world) return null;
    const against =
      compareWorld ?? worlds.find((w) => w.id === world.parentId) ?? null;
    return against ? worldDiff(world, against) : null;
  }, [world, compareWorld, worlds]);

  const verdict = useMemo(() => {
    if (!applied || applied.graph.mode !== "chain") return null;
    const root = applied.graph.nodes.find((n) => n.kind === "event" && n.isRoot);
    const target = applied.graph.nodes.find((n) => n.kind === "event" && n.isTarget);
    if (!root || !target) return null;
    return chainVerdict(applied.graph, applied.fixed, root.id, target.id);
  }, [applied]);

  // ponytail: resamples on every slider frame. Measured at a few ms for graphs
  // this size; if a drag ever feels heavy, move sampling into a worker rather
  // than caching the previous result behind a ref.
  const mc = useMemo(() => {
    if (!applied) return null;
    const keyNodeIds = applied.graph.nodes
      .filter((n) => n.kind === "event")
      .slice(0, 6)
      .map((n) => n.id);
    return monteCarlo(applied.graph, applied.fixed, { positions, keyNodeIds });
  }, [applied, positions]);

  return {
    // The applied graph, not the raw one: worlds add nodes and cut edges, and
    // every consumer wants what the active world actually contains.
    graph: applied?.graph ?? priced,
    world,
    fixed: applied?.fixed ?? EMPTY_FIXED,
    computed,
    compare,
    mc,
    diff,
    verdict,
  };
}
