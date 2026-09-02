import { chainVerdict } from "@/lib/engine/verdict";
import { emptyFixed, propagate } from "@/lib/engine/propagate";
import { toposort } from "@/lib/engine/topo";
import { isEvent, isNumeric, type Graph, type Node } from "@/lib/schema";

/**
 * Structural checks say a graph parsed. These say whether it is any good.
 *
 * Every check has to be able to fail on a graph a real model might produce, and
 * every one names what it looked at, because "quality: 7/8" is useless without
 * the sentence explaining the 1.
 */

export type Check = {
  id: string;
  title: string;
  ok: boolean;
  score: number; // 0..1, so a partial pass is visible
  detail: string;
};

const label = (node: Node) => (isEvent(node) ? node.statement : node.name);
const pct = (n: number, d: number) => (d === 0 ? 1 : n / d);

/* 1 ------------------------------------------------------------------ */

/**
 * A ticker the model invented is worse than no ticker: the numeric silently
 * keeps its modelled level and the market column quietly lies.
 */
export function tickersResolve(graph: Graph, resolved: Record<string, unknown>): Check {
  const tickered = graph.nodes.filter((n) => isNumeric(n) && n.ticker !== null);
  const good = tickered.filter((n) => isNumeric(n) && n.ticker && resolved[n.ticker]);
  const bad = tickered.filter((n) => isNumeric(n) && n.ticker && !resolved[n.ticker]);
  return {
    id: "tickers-resolve",
    title: "Every ticker resolves to a real quote",
    ok: bad.length === 0 && tickered.length > 0,
    score: tickered.length === 0 ? 0 : pct(good.length, tickered.length),
    detail:
      tickered.length === 0
        ? "no numeric node carries a ticker, so nothing can be priced"
        : bad.length === 0
          ? `${good.length}/${tickered.length} tickers resolved`
          : `unresolvable: ${bad.map((n) => (isNumeric(n) ? n.ticker : "")).join(", ")}`,
  };
}

/* 2 ------------------------------------------------------------------ */

/**
 * Two different faults, one check.
 *
 * A node with no path to the root at all — in either direction — is loose
 * furniture. But requiring every node to sit *downstream* of the root was too
 * strict: every model tested writes legitimate upstream precursors ("a
 * triggering incident occurs before ..."), and those are part of the story.
 *
 * What must be downstream is every numeric node, because a market variable the
 * hypothesis cannot reach can never respond to it, and the thesis card prices
 * exactly those variables. That is the case worth failing on: a graph whose
 * traded instrument is disconnected produces a P&L that ignores the hypothesis.
 */
export function rootReaches(graph: Graph): Check {
  const root = graph.nodes.find((n) => isEvent(n) && n.isRoot);
  if (!root) {
    return {
      id: "root-reaches",
      title: "Numerics are downstream, nothing is loose",
      ok: false,
      score: 0,
      detail: "no root node",
    };
  }

  const walk = (adjacency: Map<string, string[]>) => {
    const seen = new Set([root.id]);
    const queue = [root.id];
    while (queue.length) {
      for (const next of adjacency.get(queue.shift()!) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return seen;
  };

  const forward = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  const either = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const edge of graph.edges) {
    forward.get(edge.source)?.push(edge.target);
    either.get(edge.source)?.push(edge.target);
    either.get(edge.target)?.push(edge.source);
  }

  const downstream = walk(forward);
  const connected = walk(either);

  const loose = graph.nodes.filter((n) => !connected.has(n.id));
  const strandedNumerics = graph.nodes.filter((n) => isNumeric(n) && !downstream.has(n.id));

  const problems: string[] = [];
  if (loose.length) problems.push(`disconnected: ${loose.map(label).join(" | ").slice(0, 120)}`);
  if (strandedNumerics.length) {
    problems.push(
      `numerics the hypothesis cannot reach: ${strandedNumerics.map(label).join(" | ").slice(0, 120)}`,
    );
  }

  return {
    id: "root-reaches",
    title: "Numerics are downstream, nothing is loose",
    ok: problems.length === 0,
    score: pct(2 - problems.length, 2),
    detail: problems.length
      ? problems.join("; ")
      : `${graph.nodes.length} nodes connected, every numeric downstream of the root`,
  };
}

/* 3 ------------------------------------------------------------------ */

const DAMPENING = /\b(reduc|dampen|offset|cap|lower|ease|mitigat|relie|suppress|curb|counter)/i;
const AMPLIFYING = /\b(raise|increas|amplif|worsen|spike|boost|lift|escalat|tighten)/i;

/**
 * The mechanism sentence and the sign have to agree. A model that writes
 * "extra barrels cap the spike" and then attaches a positive impact has
 * produced a graph that reads correctly and computes backwards.
 */
export function signsMatchMechanisms(graph: Graph): Check {
  const signed = graph.edges.filter((e) => e.kind === "en" || e.kind === "nn");
  const wrong = signed.filter((edge) => {
    const value = edge.kind === "en" ? edge.impact : edge.beta;
    if (value === 0) return false;
    if (DAMPENING.test(edge.mechanism) && !AMPLIFYING.test(edge.mechanism)) return value > 0;
    if (AMPLIFYING.test(edge.mechanism) && !DAMPENING.test(edge.mechanism)) return value < 0;
    return false;
  });
  return {
    id: "signs-match-mechanisms",
    title: "Numeric signs agree with the mechanism text",
    ok: wrong.length === 0,
    score: pct(signed.length - wrong.length, signed.length),
    detail: wrong.length
      ? `contradicted: ${wrong.map((e) => `${e.id} "${e.mechanism.slice(0, 60)}"`).join(" | ").slice(0, 200)}`
      : `${signed.length} signed edges consistent`,
  };
}

/* 4 ------------------------------------------------------------------ */

/**
 * Base rates that are all 0.5, or pinned at 0 and 1, mean the model declined to
 * estimate. A usable graph has spread and at least one genuine tail.
 */
export function baseRatesAreCalibrated(graph: Graph): Check {
  const events = graph.nodes.filter(isEvent);
  if (events.length === 0) {
    return { id: "base-rates", title: "Base rates are estimates", ok: false, score: 0, detail: "no events" };
  }
  const bases = events.map((e) => e.base);
  const degenerate = bases.filter((b) => b <= 0 || b >= 1);
  const spread = Math.max(...bases) - Math.min(...bases);
  const hasTail = bases.some((b) => b <= 0.15);
  const distinct = new Set(bases.map((b) => b.toFixed(2))).size;

  const problems: string[] = [];
  if (degenerate.length) problems.push(`${degenerate.length} base rates at 0 or 1`);
  // Floating point: 0.6 - 0.4 is 0.19999999999999998, and a graph whose
  // spread is nominally exactly 0.2 should not be penalised for it.
  if (spread < 0.2 - 1e-9) problems.push(`spread only ${spread.toFixed(2)}`);
  if (!hasTail) problems.push("no event below 0.15");
  if (distinct < Math.min(4, events.length)) problems.push(`only ${distinct} distinct values`);

  return {
    id: "base-rates",
    title: "Base rates are estimates, not placeholders",
    ok: problems.length === 0,
    score: pct(4 - problems.length, 4),
    detail: problems.length
      ? problems.join("; ")
      : `spread ${spread.toFixed(2)}, ${distinct} distinct values, tail present`,
  };
}

/* 5 ------------------------------------------------------------------ */

/** The spec asks for a counter-force, not just a fan of promoting arrows. */
export function hasCounterForce(graph: Graph): Check {
  const inhibitors = graph.edges.filter((e) => e.kind === "ee" && e.polarity === "inhibit");
  const negatives = graph.edges.filter(
    (e) => (e.kind === "en" && e.impact < 0) || (e.kind === "nn" && e.beta < 0),
  );
  const parts = [inhibitors.length > 0, negatives.length > 0];
  return {
    id: "counter-force",
    title: "A counter-force path exists",
    ok: parts.every(Boolean),
    score: pct(parts.filter(Boolean).length, 2),
    detail: `${inhibitors.length} inhibiting edges, ${negatives.length} negative numeric edges`,
  };
}

/* 6 ------------------------------------------------------------------ */

const HAS_NUMBER = /\d/;
const HAS_SOURCE = /\b(reports?|announce|publish|confirm|declare|official|index|settle|filing|communique|data|survey|court|ruling|register)/i;

/**
 * "It happens" is not a resolution criterion. A usable one names a threshold or
 * whoever gets to say it happened.
 */
export function resolutionsAreCheckable(graph: Graph): Check {
  const events = graph.nodes.filter(isEvent);
  const vague = events.filter(
    (e) => e.resolution.trim().length < 25 || (!HAS_NUMBER.test(e.resolution) && !HAS_SOURCE.test(e.resolution)),
  );
  return {
    id: "resolutions-checkable",
    title: "Resolution criteria name a number or an authority",
    ok: vague.length === 0,
    score: pct(events.length - vague.length, events.length),
    detail: vague.length
      ? `vague: ${vague.map((e) => `"${e.resolution.slice(0, 50)}"`).join(" | ").slice(0, 200)}`
      : `${events.length} resolutions checkable`,
  };
}

/* 7 ------------------------------------------------------------------ */

/**
 * Chain mode is the half of the app a structural check never touches: the
 * target has to be reachable, the intervention has to move it, and the weakest
 * link has to lie on the path that was found.
 */
export function chainIsSound(graph: Graph): Check {
  if (graph.mode !== "chain") {
    return { id: "chain-sound", title: "Chain verdict is sound", ok: true, score: 1, detail: "explore mode, not applicable" };
  }
  const root = graph.nodes.find((n) => isEvent(n) && n.isRoot);
  const target = graph.nodes.find((n) => isEvent(n) && n.isTarget);
  if (!root || !target) {
    return {
      id: "chain-sound",
      title: "Chain verdict is sound",
      ok: false,
      score: 0,
      detail: root ? "no target node" : "no root node",
    };
  }
  const verdict = chainVerdict(graph, emptyFixed(), root.id, target.id);
  const onPath = new Set(verdict.pathEdgeIds);
  const problems: string[] = [];
  if (verdict.pathEdgeIds.length === 0) problems.push("no path from root to target");
  if (verdict.lift <= 0) problems.push(`lift ${verdict.lift.toFixed(3)} is not positive`);
  if (verdict.weakestEdgeId && !onPath.has(verdict.weakestEdgeId)) {
    problems.push("weakest link is off the path");
  }
  return {
    id: "chain-sound",
    title: "Chain verdict is sound",
    ok: problems.length === 0,
    score: pct(3 - problems.length, 3),
    detail: problems.length
      ? problems.join("; ")
      : `lift ${verdict.lift.toFixed(2)} over ${verdict.pathEdgeIds.length} edges, ${verdict.pathCount} paths`,
  };
}

/* 8 ------------------------------------------------------------------ */

const KEY_WORDS = /[a-z0-9]{4,}/g;
const keywords = (text: string) => new Set(text.toLowerCase().match(KEY_WORDS) ?? []);

/**
 * Two runs of the same prompt should describe the same world. Wild divergence
 * means the numbers on screen are a draw from the model's mood, not an estimate.
 */
export function runsAreStable(a: Graph, b: Graph): Check {
  const words = (graph: Graph) => {
    const set = new Set<string>();
    for (const node of graph.nodes) for (const word of keywords(label(node))) set.add(word);
    return set;
  };
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((w) => right.has(w)).length;
  const overlap = pct(shared, new Set([...left, ...right]).size);

  const rootP = (graph: Graph) => {
    const root = graph.nodes.find((n) => isEvent(n) && n.isRoot);
    return root ? (propagate(graph, emptyFixed()).events.get(root.id)?.p ?? 0) : 0;
  };
  const drift = Math.abs(rootP(a) - rootP(b));

  const problems: string[] = [];
  if (overlap < 0.3) problems.push(`topic overlap only ${(overlap * 100).toFixed(0)}%`);
  if (drift > 0.25) problems.push(`root probability moved ${(drift * 100).toFixed(0)}pp between runs`);

  return {
    id: "runs-stable",
    title: "Two runs of one prompt agree",
    ok: problems.length === 0,
    score: pct(2 - problems.length, 2),
    detail: problems.length
      ? problems.join("; ")
      : `overlap ${(overlap * 100).toFixed(0)}%, root probability within ${(drift * 100).toFixed(0)}pp`,
  };
}

/* ------------------------------------------------------------------ */

/** The seven single-graph checks. `runsAreStable` needs a pair, so it is separate. */
export function checkGraph(graph: Graph, quotes: Record<string, unknown>): Check[] {
  // A cycle would make the rest meaningless, so it is checked first.
  toposort(graph.nodes.map((n) => n.id), graph.edges);
  return [
    tickersResolve(graph, quotes),
    rootReaches(graph),
    signsMatchMechanisms(graph),
    baseRatesAreCalibrated(graph),
    hasCounterForce(graph),
    resolutionsAreCheckable(graph),
    chainIsSound(graph),
  ];
}
