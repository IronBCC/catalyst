type Link = { source: string; target: string };

export class CycleError extends Error {
  constructor(readonly cycle: string[]) {
    super(`Cycle detected: ${cycle.join(" -> ")}`);
    this.name = "CycleError";
  }
}

function kahn(ids: string[], edges: Link[]) {
  const known = new Set(ids);
  const outgoing = new Map(ids.map((id) => [id, [] as Link[]]));
  const indegree = new Map(ids.map((id) => [id, 0]));

  for (const edge of edges) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    outgoing.get(edge.source)?.push(edge);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const ready = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  for (let index = 0; index < ready.length; index += 1) {
    const id = ready[index];
    order.push(id);
    for (const edge of outgoing.get(id) ?? []) {
      const next = (indegree.get(edge.target) ?? 0) - 1;
      indegree.set(edge.target, next);
      if (next === 0) ready.push(edge.target);
    }
  }

  return { order, remaining: new Set(ids.filter((id) => !order.includes(id))) };
}

function findCycle<E extends Link>(ids: string[], edges: E[], remaining: Set<string>): E[] {
  const outgoing = new Map(ids.map((id) => [id, [] as E[]]));
  for (const edge of edges) {
    if (remaining.has(edge.source) && remaining.has(edge.target)) {
      outgoing.get(edge.source)?.push(edge);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: E[] = [];

  const visit = (id: string): E[] | null => {
    visiting.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      if (visiting.has(edge.target)) {
        const start = stack.findIndex((candidate) => candidate.source === edge.target);
        return [...stack.slice(start), edge];
      }
      if (visited.has(edge.target)) continue;
      stack.push(edge);
      const cycle = visit(edge.target);
      if (cycle) return cycle;
      stack.pop();
    }
    visiting.delete(id);
    visited.add(id);
    return null;
  };

  for (const id of ids) {
    if (remaining.has(id) && !visited.has(id)) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return [];
}

export function toposort(ids: string[], edges: Link[]): string[] {
  const { order, remaining } = kahn(ids, edges);
  if (remaining.size === 0) return order;

  const cycle = findCycle(ids, edges, remaining);
  const nodes = cycle.length === 0 ? [] : [cycle[0].source, ...cycle.map((edge) => edge.target)];
  throw new CycleError(nodes);
}

export function breakCycles<E extends Link>(
  ids: string[],
  edges: E[],
  weight: (edge: E) => number,
): { edges: E[]; removed: E[] } {
  let kept = [...edges];
  const removed: E[] = [];

  while (true) {
    const { remaining } = kahn(ids, kept);
    if (remaining.size === 0) return { edges: kept, removed };

    const cycle = findCycle(ids, kept, remaining);
    if (cycle.length === 0) return { edges: kept, removed };
    const weakest = cycle.reduce((lowest, edge) =>
      Number.isFinite(weight(edge)) && weight(edge) < weight(lowest) ? edge : lowest,
    );
    removed.push(weakest);
    kept = kept.filter((edge) => edge !== weakest);
  }
}
