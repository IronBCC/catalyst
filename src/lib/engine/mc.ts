import { isEvent, isNumeric } from "@/lib/schema";
import type { Edge, Graph, Position } from "@/lib/schema";
import { sigmoid } from "@/lib/engine/propagate";
import type { Fixed } from "@/lib/engine/propagate";
import { toposort } from "@/lib/engine/topo";

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const normal = (rng: () => number) => {
  const u = Math.max(rng(), Number.MIN_VALUE);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

export function studentT4(rng: () => number): number {
  const z = normal(rng);
  let variance = 0;
  for (let index = 0; index < 4; index += 1) {
    const value = normal(rng);
    variance += value * value;
  }
  return variance === 0 ? 0 : (z / Math.sqrt(variance / 4)) / Math.sqrt(2);
}

export type Quantiles = { p10: number; p25: number; p50: number; p75: number; p90: number; mean: number };
export type McResult = {
  n: number;
  eventP: Map<string, number>;
  numeric: Map<string, { q: Quantiles; samples: Float64Array }>;
  pnl: { q: Quantiles; samples: Float64Array; pLoss: number; pStop: number | null; pTarget: number | null } | null;
  clusters: { states: Record<string, boolean>; share: number }[];
};

const probability = (value: number) => {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

export function quantiles(samples: Float64Array): Quantiles {
  const sorted = Array.from(samples).filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, mean: 0 };
  const at = (p: number) => {
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
  };
  return {
    p10: at(0.1),
    p25: at(0.25),
    p50: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
  };
}

function numericLevel(move: number, current: number | null) {
  return current === null ? move : current * (1 + move / 100);
}

function probabilityFromParents(
  nodeId: string,
  base: number,
  incoming: Map<string, Edge[]>,
  nodes: Map<string, Graph["nodes"][number]>,
  eventStates: Map<string, boolean>,
  numericMoves: Map<string, number>,
  rng: () => number,
) {
  let promote = 1;
  let inhibit = 1;
  for (const edge of incoming.get(nodeId) ?? []) {
    if (edge.kind !== "ee" && edge.kind !== "ne") continue;
    const parent = nodes.get(edge.source);
    if (!parent) continue;
    let q = 0;
    if (isEvent(parent)) q = eventStates.get(parent.id) ? 1 : 0;
    else if (edge.kind === "ne") {
      const move = numericMoves.get(parent.id) ?? 0;
      const width = edge.width > 0 ? edge.width : Number.EPSILON;
      const sign = edge.direction === "above" ? 1 : -1;
      const chance = probability(sigmoid((sign * (numericLevel(move, parent.current) - edge.threshold)) / width));
      q = rng() < chance ? 1 : 0;
    }
    const factor = 1 - edge.strength * q;
    if (edge.kind === "ee" && edge.polarity === "inhibit") inhibit *= factor;
    else promote *= factor;
  }
  return probability((1 - (1 - probability(base)) * promote) * inhibit);
}

function weightedThreshold(positions: Position[], field: "stopPct" | "targetPct") {
  const selected = positions.filter((position) => position[field] !== null);
  const size = selected.reduce((sum, position) => sum + position.size, 0);
  return size === 0
    ? null
    : selected.reduce((sum, position) => sum + position.size * (position[field] ?? 0), 0) / size;
}

export function monteCarlo(
  graph: Graph,
  fixed: Fixed,
  opts: { n?: number; seed?: number; positions: Position[]; keyNodeIds: string[] },
): McResult {
  const n = Math.max(1, Math.floor(opts.n ?? 5000));
  const rng = mulberry32(opts.seed ?? 1);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as Edge[]]));
  for (const edge of graph.edges) incoming.get(edge.target)?.push(edge);
  const order = toposort(graph.nodes.map((node) => node.id), graph.edges);

  const eventCounts = new Map(
    graph.nodes.filter(isEvent).map((node) => [node.id, 0]),
  );
  const rawNumerics = new Map(
    graph.nodes.filter(isNumeric).map((node) => [node.id, new Float64Array(n)]),
  );
  const tickerNodes = new Map(
    graph.nodes.filter(isNumeric).flatMap((node) => (node.ticker === null ? [] : [[node.ticker, node.id] as const])),
  );
  const positions = opts.positions.filter((position) => tickerNodes.has(position.ticker));
  const totalSize = positions.reduce((sum, position) => sum + position.size, 0);
  const pnlSamples = totalSize === 0 ? null : new Float64Array(n);
  const keyNodeIds = opts.keyNodeIds.filter((id) => isEvent(nodes.get(id)!));
  const clusters = new Map<string, { count: number; states: Record<string, boolean> }>();

  for (let sample = 0; sample < n; sample += 1) {
    const eventStates = new Map<string, boolean>();
    const numericMoves = new Map<string, number>();
    for (const id of order) {
      const node = nodes.get(id);
      if (!node) continue;
      if (isEvent(node)) {
        const state = fixed.pins.has(id)
          ? fixed.pins.get(id) === true
          : rng() <
            (fixed.overrides.has(id)
              ? probability(fixed.overrides.get(id) ?? 0)
              : probabilityFromParents(id, node.base, incoming, nodes, eventStates, numericMoves, rng));
        eventStates.set(id, state);
        if (state) eventCounts.set(id, (eventCounts.get(id) ?? 0) + 1);
        continue;
      }

      let move = fixed.overrides.has(id) ? finite(fixed.overrides.get(id) ?? 0) : finite(node.baselineMove);
      if (!fixed.overrides.has(id)) {
        for (const edge of incoming.get(id) ?? []) {
          if (edge.kind === "en") move += (eventStates.get(edge.source) ? 1 : 0) * edge.impact;
          if (edge.kind === "nn") move += (numericMoves.get(edge.source) ?? 0) * edge.beta;
        }
        move += node.sigma * studentT4(rng);
      }
      move = finite(move);
      numericMoves.set(id, move);
      rawNumerics.get(id)?.set([move], sample);
    }

    if (keyNodeIds.length > 0) {
      const states = Object.fromEntries(keyNodeIds.map((id) => [id, eventStates.get(id) === true]));
      const key = keyNodeIds.map((id) => `${id}:${states[id] ? 1 : 0}`).join("|");
      const previous = clusters.get(key);
      clusters.set(key, previous ? { ...previous, count: previous.count + 1 } : { count: 1, states });
    }

    if (pnlSamples) {
      const pnl = positions.reduce((sum, position) => {
        const nodeId = tickerNodes.get(position.ticker);
        const move = nodeId === undefined ? 0 : numericMoves.get(nodeId) ?? 0;
        return sum + (position.side === "long" ? 1 : -1) * position.size * move;
      }, 0);
      pnlSamples[sample] = pnl / totalSize;
    }
  }

  const eventP = new Map([...eventCounts].map(([id, count]) => [id, count / n]));
  const numeric = new Map(
    [...rawNumerics].map(([id, samples]) => [id, { q: quantiles(samples), samples }]),
  );
  const pnl = pnlSamples
    ? (() => {
        const stop = weightedThreshold(positions, "stopPct");
        const target = weightedThreshold(positions, "targetPct");
        return {
          q: quantiles(pnlSamples),
          samples: pnlSamples,
          pLoss: Array.from(pnlSamples).filter((value) => value < 0).length / n,
          pStop: stop === null ? null : Array.from(pnlSamples).filter((value) => value < -stop).length / n,
          pTarget: target === null ? null : Array.from(pnlSamples).filter((value) => value > target).length / n,
        };
      })()
    : null;

  return {
    n,
    eventP,
    numeric,
    pnl,
    clusters: [...clusters.values()]
      .sort((left, right) => right.count - left.count)
      .slice(0, 3)
      .map(({ count, states }) => ({ states, share: count / n })),
  };
}
