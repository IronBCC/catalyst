import { isEvent, isNumeric } from "@/lib/schema";
import type { Edge, Graph, Node } from "@/lib/schema";
import { toposort } from "@/lib/engine/topo";

export type Fixed = { pins: Map<string, boolean>; overrides: Map<string, number> };
export type AuditTerm = { label: string; formula: string; value: number };
export type EventResult = { p: number; fixed: "pin" | "override" | null; terms: AuditTerm[] };
export type NumericResult = { move: number; level: number | null; fixed: "override" | null; terms: AuditTerm[] };
export type Computed = {
  order: string[];
  events: Map<string, EventResult>;
  numerics: Map<string, NumericResult>;
};

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const probability = (value: number) => {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const numberOrZero = (value: number) => (Number.isFinite(value) ? value : 0);

export function causeQ(edge: Edge, parent: EventResult | NumericResult, parentNode: Node): number {
  if (isEvent(parentNode)) return probability((parent as EventResult).p);
  if (!isNumeric(parentNode) || edge.kind !== "ne") return 0;

  const numeric = parent as NumericResult;
  const level = numeric.level ?? numeric.move;
  const width = edge.width > 0 ? edge.width : Number.EPSILON;
  const sign = edge.direction === "above" ? 1 : -1;
  return probability(sigmoid((sign * (level - edge.threshold)) / width));
}

export const emptyFixed = (): Fixed => ({ pins: new Map(), overrides: new Map() });

export function propagate(graph: Graph, fixed: Fixed): Computed {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as Edge[]]));
  for (const edge of graph.edges) incoming.get(edge.target)?.push(edge);

  const order = toposort(graph.nodes.map((node) => node.id), graph.edges);
  const events = new Map<string, EventResult>();
  const numerics = new Map<string, NumericResult>();

  for (const id of order) {
    const node = nodes.get(id);
    if (!node) continue;
    const parents = incoming.get(id) ?? [];

    if (isEvent(node)) {
      if (fixed.pins.has(id)) {
        events.set(id, {
          p: fixed.pins.get(id) ? 1 : 0,
          fixed: "pin",
          terms: [{ label: "pin", formula: "do(node)", value: fixed.pins.get(id) ? 1 : 0 }],
        });
        continue;
      }
      if (fixed.overrides.has(id)) {
        const p = probability(fixed.overrides.get(id) ?? 0);
        events.set(id, { p, fixed: "override", terms: [{ label: "override", formula: "do(node)", value: p }] });
        continue;
      }

      let promote = 1;
      let inhibit = 1;
      const terms: AuditTerm[] = [{ label: "base", formula: "base", value: probability(node.base) }];
      for (const edge of parents) {
        if (edge.kind !== "ee" && edge.kind !== "ne") continue;
        const parentNode = nodes.get(edge.source);
        if (!parentNode) continue;
        const parent = isEvent(parentNode) ? events.get(edge.source) : numerics.get(edge.source);
        if (!parent) continue;
        const q = causeQ(edge, parent, parentNode);
        const strength = edge.strength;
        const factor = numberOrZero(1 - strength * q);
        if (edge.kind === "ee" && edge.polarity === "inhibit") inhibit *= factor;
        else promote *= factor;
        terms.push({ label: edge.id, formula: `1 - ${strength} × ${q}`, value: factor });
      }

      const p = probability((1 - (1 - probability(node.base)) * promote) * inhibit);
      events.set(id, { p, fixed: null, terms });
      continue;
    }

    if (fixed.overrides.has(id)) {
      const move = numberOrZero(fixed.overrides.get(id) ?? 0);
      numerics.set(id, {
        move,
        level: node.current === null ? null : node.current * (1 + move / 100),
        fixed: "override",
        terms: [{ label: "override", formula: "do(node)", value: move }],
      });
      continue;
    }

    let move = numberOrZero(node.baselineMove);
    const terms: AuditTerm[] = [{ label: "baseline", formula: "baselineMove", value: move }];
    for (const edge of parents) {
      const parentNode = nodes.get(edge.source);
      if (!parentNode) continue;
      if (edge.kind === "en" && isEvent(parentNode)) {
        const parent = events.get(edge.source);
        if (!parent) continue;
        const contribution = parent.p * edge.impact;
        move += contribution;
        terms.push({ label: edge.id, formula: `${parent.p} × ${edge.impact}`, value: contribution });
      }
      if (edge.kind === "nn" && isNumeric(parentNode)) {
        const parent = numerics.get(edge.source);
        if (!parent) continue;
        const contribution = parent.move * edge.beta;
        move += contribution;
        terms.push({ label: edge.id, formula: `${parent.move} × ${edge.beta}`, value: contribution });
      }
    }
    move = numberOrZero(move);
    numerics.set(id, {
      move,
      level: node.current === null ? null : node.current * (1 + move / 100),
      fixed: null,
      terms,
    });
  }

  return { order, events, numerics };
}
