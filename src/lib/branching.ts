import type { Graph } from "@/lib/schema";

/**
 * Branching has to stay bounded and has to stay counterfactual.
 *
 * Bounded, because every what-if adds a node and nothing ever removes one: a
 * long session otherwise grows a map nobody can read and a Monte-Carlo nobody
 * wants to wait for.
 *
 * Counterfactual, because the model returns follow-ups that are research
 * actions — "track UKMTO reports weekly" — and pinning an action true as though
 * it were an event produces a graph that computes nonsense.
 */

export const MAX_GRAPH_NODES = 40;

export const atNodeLimit = (graph: Graph | null) =>
  (graph?.nodes.length ?? 0) >= MAX_GRAPH_NODES;

export const nodeBudget = (graph: Graph | null) =>
  Math.max(0, MAX_GRAPH_NODES - (graph?.nodes.length ?? 0));

/** Imperatives the model reaches for when it is suggesting work rather than an outcome. */
const INSTRUCTION = /^(track|monitor|watch|set|check|review|follow|compare|measure|update|read|verify|consider|assess|evaluate|examine|study|analyse|analyze|maintain|keep|use|add|test|scan|poll|log)\b/i;

/** An outcome reads as a claim about the world: something is, does, or reaches. */
const OUTCOME = /\b(is|are|was|were|will|would|rises?|falls?|drops?|closes?|opens?|announces?|reaches?|exceeds?|breaks?|declares?|occurs?|happens?|collapses?|suspends?|resumes?|cuts?|raises?|passes?|fails?|wins?|loses?|strikes?|attacks?|seizes?|halts?|above|below|by \d)/i;

/**
 * A cheap shape test, not a classifier. It is deliberately conservative: a
 * suggestion only becomes a one-click what-if when it plainly reads as an
 * outcome, and everything else stays readable text the user can rewrite.
 */
export function looksLikeEvent(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  if (INSTRUCTION.test(trimmed)) return false;
  return OUTCOME.test(trimmed);
}
