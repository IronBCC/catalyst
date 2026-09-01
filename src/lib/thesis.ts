import { isEvent, isNumeric } from "@/lib/schema";
import type { Edit, Graph, Leg, LlmThesis, Position, ThesisInput, Verdict } from "@/lib/schema";
import { applyEdits } from "@/lib/engine/worlds";
import type { Computed } from "@/lib/engine/propagate";
import type { McResult } from "@/lib/engine/mc";
import { tornado } from "@/lib/engine/sensitivity";
import type { MarketMatch, Quote } from "@/lib/market";

const overlapZero = (p10: number, p90: number) => (p10 <= 0 && p90 >= 0 ? 1 : 0);

function makeLeg(
  node: Extract<Graph["nodes"][number], { kind: "numeric" }>,
  p10: number,
  p50: number,
  p90: number,
  quotes: Record<string, Quote | null>,
): Leg {
  const ticker = node.ticker ?? node.id;
  const entry = quotes[ticker]?.price ?? node.current;
  const direction = p50 >= 0 ? "long" : "short";
  const adverse = direction === "long" ? p10 : p90;
  const favorable = direction === "long" ? p90 : p10;
  return {
    ticker,
    name: node.name,
    direction,
    expectedMove: p50,
    p10,
    p90,
    entry,
    stop: entry === null ? null : entry * (1 + adverse / 100),
    takeProfit: entry === null ? null : entry * (1 + favorable / 100),
  };
}

const statementFor = (graph: Graph, nodeId: string) => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node) return nodeId;
  return isEvent(node) ? node.statement : node.name;
};

function percentile(samples: Float64Array, p: number) {
  const values = Array.from(samples).filter(Number.isFinite).sort((left, right) => left - right);
  if (values.length === 0) return 0;
  const index = (values.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return values[low] + (values[high] - values[low]) * (index - low);
}

function marketView(
  graph: Graph,
  computed: Computed,
  markets: Record<string, MarketMatch[]>,
  edits: Edit[],
): ThesisInput["marketView"] {
  const adopted = new Map<string, Extract<Edit, { type: "adoptMarket" }>>();
  for (const edit of edits) if (edit.type === "adoptMarket") adopted.set(edit.nodeId, edit);

  return [...adopted.values()].flatMap((edit) => {
    const node = graph.nodes.find((entry) => entry.id === edit.nodeId);
    if (!node || !isEvent(node)) return [];
    const match = (markets[node.id] ?? []).find((item) => item.url === edit.source);
    const model = computed.events.get(node.id)?.p ?? 0;
    const market = match?.yes ?? edit.value;
    return [
      {
        statement: match?.title ?? node.statement,
        model,
        market,
        edge: model - market,
        url: match?.url ?? edit.source,
      },
    ];
  });
}

export function buildThesis(
  graph: Graph,
  computed: Computed,
  mc: McResult,
  verdict: Verdict | null,
  positions: Position[],
  quotes: Record<string, Quote | null>,
  markets: Record<string, MarketMatch[]>,
  edits: Edit[],
  worldName: string,
): ThesisInput {
  const applied = applyEdits(graph, edits);
  const candidates = applied.graph.nodes
    .filter(isNumeric)
    .flatMap((node) => {
      const q = mc.numeric.get(node.id)?.q;
      return q ? [makeLeg(node, q.p10, q.p50, q.p90, quotes)] : [];
    })
    .sort((left, right) => {
      const leftScore = Math.abs(left.expectedMove) * (1 - overlapZero(left.p10, left.p90));
      const rightScore = Math.abs(right.expectedMove) * (1 - overlapZero(right.p10, right.p90));
      return rightScore - leftScore || Math.abs(right.expectedMove) - Math.abs(left.expectedMove);
    });
  const primary = positions.length > 0
    ? candidates.find((candidate) => candidate.ticker === positions[0].ticker) ?? candidates[0] ?? null
    : candidates[0] ?? null;
  const primaryPosition = primary
    ? positions.find((position) => position.ticker === primary.ticker) ?? {
        ticker: primary.ticker,
        side: primary.direction,
        size: 1,
        stopPct: null,
        targetPct: null,
      }
    : null;
  const rows = primaryPosition
    ? tornado(applied.graph, applied.fixed, { type: "pnl" }, [primaryPosition])
    : [];
  const rowById = new Map(rows.map((row) => [row.nodeId, row]));
  const note = (row: (typeof rows)[number]) => ({
    nodeId: row.nodeId,
    statement: statementFor(applied.graph, row.nodeId),
    deltaPnl: row.delta,
  });

  return {
    hypothesis: graph.hypothesis,
    horizonDays: graph.horizonDays,
    worldName,
    primary,
    candidates,
    invalidation: rows.filter((row) => row.delta < 0).sort((left, right) => left.delta - right.delta).slice(0, 5).map(note),
    confirmation: rows.filter((row) => row.delta > 0).sort((left, right) => right.delta - left.delta).slice(0, 5).map(note),
    risks: applied.graph.nodes
      .filter(isEvent)
      .filter((node) => node.base <= 0.1)
      .sort((left, right) => Math.abs(rowById.get(right.id)?.delta ?? 0) - Math.abs(rowById.get(left.id)?.delta ?? 0))
      .map((node) => ({ nodeId: node.id, statement: node.statement, base: node.base })),
    marketView: marketView(applied.graph, computed, markets, edits),
    mc: mc.pnl
      ? { pProfit: 1 - mc.pnl.pLoss, ev: mc.pnl.q.mean, p5: percentile(mc.pnl.samples, 0.05) }
      : null,
    verdict,
  };
}

const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const notes = (items: ThesisInput["invalidation"]) =>
  items.length === 0 ? "- None" : items.map((item) => `- ${item.statement} (${pct(item.deltaPnl)})`).join("\n");

export function toMarkdown(input: ThesisInput, narrative: LlmThesis | null): string {
  const primary = input.primary;
  const trade = primary
    ? [
        `- ${primary.direction} ${primary.ticker} (${primary.name})`,
        `- Expected move: ${pct(primary.expectedMove)}; p10 ${pct(primary.p10)}; p90 ${pct(primary.p90)}`,
        `- Entry: ${primary.entry === null ? "—" : primary.entry.toFixed(2)}; stop: ${primary.stop === null ? "—" : primary.stop.toFixed(2)}; take profit: ${primary.takeProfit === null ? "—" : primary.takeProfit.toFixed(2)}`,
      ].join("\n")
    : "- No trade candidate";
  const candidates = input.candidates.length === 0
    ? "- None"
    : input.candidates.map((leg) => `- ${leg.direction} ${leg.ticker}: ${pct(leg.expectedMove)}`).join("\n");
  const risks = input.risks.length === 0
    ? "- None"
    : input.risks.map((risk) => `- ${risk.statement} (base ${(risk.base * 100).toFixed(0)}%)`).join("\n");
  const market = input.marketView.length === 0
    ? "- None"
    : input.marketView
        .map((view) => `- ${view.statement}: model ${(view.model * 100).toFixed(0)}%, market ${(view.market * 100).toFixed(0)}%, edge ${(view.edge * 100).toFixed(0)}pp (${view.url})`)
        .join("\n");
  const monteCarlo = input.mc
    ? `- Profit probability: ${(input.mc.pProfit * 100).toFixed(0)}%; expected value: ${pct(input.mc.ev)}; p5: ${pct(input.mc.p5)}`
    : "- No portfolio simulation";
  const chain = input.verdict
    ? `- ${input.verdict.label} lift ${pct(input.verdict.lift * 100)}; paths: ${input.verdict.pathCount}; weakest edge: ${input.verdict.weakestEdgeId ?? "—"}`
    : "- No chain verdict";
  const narrativeText = narrative
    ? [
        `- Thesis: ${narrative.thesis}`,
        `- Rationale: ${narrative.rationale}`,
        `- Invalidation: ${narrative.invalidation.join("; ") || "None"}`,
        `- Confirmation: ${narrative.confirmation.join("; ") || "None"}`,
        `- Risks: ${narrative.risks.join("; ") || "None"}`,
        `- Market view: ${narrative.marketView}`,
      ].join("\n")
    : "- No narrative generated";

  return [
    `# ${input.hypothesis}`,
    `${input.worldName} · ${input.horizonDays} day horizon`,
    "## Trade",
    trade,
    "## Candidates",
    candidates,
    "## Invalidation",
    notes(input.invalidation),
    "## Confirmation",
    notes(input.confirmation),
    "## Tail risks",
    risks,
    "## Model vs market",
    market,
    "## Monte Carlo",
    monteCarlo,
    "## Chain verdict",
    chain,
    "## Narrative",
    narrativeText,
    "Model estimates, not investment advice. Stops and targets are Monte-Carlo quantiles.",
  ].join("\n\n");
}
