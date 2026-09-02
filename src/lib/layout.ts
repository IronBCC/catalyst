/**
 * Left-to-right layered layout. Twenty lines of Kahn plus a longest-path rank
 * beats pulling in dagre for a graph that is never more than a few dozen nodes.
 */

export type LayoutBox = { id: string; width: number; height: number };
export type LayoutEdge = { source: string; target: string };

const RANK_GAP = 120;
const ROW_GAP = 28;

export function layoutLR(
  nodes: LayoutBox[],
  edges: LayoutEdge[],
): Map<string, { x: number; y: number }> {
  const known = new Set(nodes.map((n) => n.id));
  const real = edges.filter((e) => known.has(e.source) && known.has(e.target));

  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const out = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of real) {
    out.get(e.source)!.push(e.target);
    indegree.set(e.target, indegree.get(e.target)! + 1);
  }

  // Longest path from any source. Kahn's order guarantees a parent is ranked
  // before its children, so one pass suffices.
  const rank = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const ordered: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of out.get(id)!) {
      rank.set(next, Math.max(rank.get(next)!, rank.get(id)! + 1));
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  // Anything left sits in a cycle. Rank it after its earliest ranked parent
  // rather than dropping it; the caller has already broken cycles for the math,
  // this is only about not losing a box on screen.
  if (ordered.length < nodes.length) {
    for (const n of nodes) {
      if (ordered.includes(n.id)) continue;
      const parents = real.filter((e) => e.target === n.id).map((e) => rank.get(e.source)!);
      rank.set(n.id, parents.length ? Math.max(...parents) + 1 : 0);
    }
  }

  const columns = new Map<number, LayoutBox[]>();
  for (const n of nodes) {
    const r = rank.get(n.id)!;
    if (!columns.has(r)) columns.set(r, []);
    columns.get(r)!.push(n);
  }

  const maxWidth = Math.max(0, ...nodes.map((n) => n.width));
  const columnHeights = [...columns.values()].map((boxes) =>
    boxes.reduce((sum, b) => sum + b.height + ROW_GAP, -ROW_GAP),
  );
  const tallest = Math.max(0, ...columnHeights);

  const pos = new Map<string, { x: number; y: number }>();
  for (const [r, boxes] of columns) {
    const height = boxes.reduce((sum, b) => sum + b.height + ROW_GAP, -ROW_GAP);
    let y = (tallest - height) / 2;
    for (const b of boxes) {
      pos.set(b.id, { x: r * (maxWidth + RANK_GAP), y });
      y += b.height + ROW_GAP;
    }
  }
  return pos;
}
