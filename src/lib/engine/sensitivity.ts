import { isEvent, isNumeric } from "@/lib/schema";
import type { Graph, Position } from "@/lib/schema";
import { propagate } from "@/lib/engine/propagate";
import type { Fixed } from "@/lib/engine/propagate";

export type Target = { type: "event"; id: string } | { type: "numeric"; id: string } | { type: "pnl" };
export type TornadoRow = { nodeId: string; low: number; high: number; delta: number };

const copyFixed = (fixed: Fixed): Fixed => ({
  pins: new Map(fixed.pins),
  overrides: new Map(fixed.overrides),
});

function pnl(graph: Graph, fixed: Fixed, positions: Position[]) {
  const computed = propagate(graph, fixed);
  const moves = new Map(
    graph.nodes
      .filter(isNumeric)
      .flatMap((node) =>
        node.ticker === null ? [] : [[node.ticker, computed.numerics.get(node.id)?.move ?? 0] as const],
      ),
  );
  const known = positions.filter((position) => moves.has(position.ticker));
  const size = known.reduce((sum, position) => sum + position.size, 0);
  if (size === 0) return 0;
  return (
    known.reduce(
      (sum, position) =>
        sum + (position.side === "long" ? 1 : -1) * position.size * (moves.get(position.ticker) ?? 0),
      0,
    ) / size
  );
}

export function evalTarget(graph: Graph, fixed: Fixed, target: Target, positions: Position[]): number {
  if (target.type === "pnl") return pnl(graph, fixed, positions);
  const computed = propagate(graph, fixed);
  return target.type === "event"
    ? computed.events.get(target.id)?.p ?? 0
    : computed.numerics.get(target.id)?.move ?? 0;
}

export function tornado(graph: Graph, fixed: Fixed, target: Target, positions: Position[]): TornadoRow[] {
  const targetId = target.type === "pnl" ? null : target.id;
  const rows: TornadoRow[] = [];

  for (const node of graph.nodes) {
    if (node.id === targetId || fixed.pins.has(node.id) || fixed.overrides.has(node.id)) continue;
    const lowFixed = copyFixed(fixed);
    const highFixed = copyFixed(fixed);
    if (isEvent(node)) {
      lowFixed.overrides.delete(node.id);
      highFixed.overrides.delete(node.id);
      lowFixed.pins.set(node.id, false);
      highFixed.pins.set(node.id, true);
    } else {
      lowFixed.pins.delete(node.id);
      highFixed.pins.delete(node.id);
      lowFixed.overrides.set(node.id, -node.sigma);
      highFixed.overrides.set(node.id, node.sigma);
    }
    const low = evalTarget(graph, lowFixed, target, positions);
    const high = evalTarget(graph, highFixed, target, positions);
    rows.push({ nodeId: node.id, low, high, delta: high - low });
  }

  return rows.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
}

export function stopTriggers(
  graph: Graph,
  fixed: Fixed,
  positions: Position[],
  stopPct: number,
): { nodeId: string; pnl: number }[] {
  return graph.nodes
    .filter(isEvent)
    .filter((node) => !fixed.pins.has(node.id) && !fixed.overrides.has(node.id))
    .flatMap((node) => {
      const intervened = copyFixed(fixed);
      intervened.pins.set(node.id, true);
      const value = pnl(graph, intervened, positions);
      return value < -stopPct ? [{ nodeId: node.id, pnl: value }] : [];
    })
    .sort((left, right) => left.pnl - right.pnl);
}
