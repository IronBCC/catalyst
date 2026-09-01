import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repairGraph } from "@/lib/engine/repair";
import { EXAMPLES } from "@/lib/examples";
import { defaultDeps, modelId, structured } from "@/lib/llm";
import { fetchQuotes, searchPolymarket } from "@/lib/market";
import { GENERATE_SYSTEM, generatePrompt } from "@/lib/prompts";
import { isEvent, isNumeric, LlmGraph } from "@/lib/schema";
import type { GenerateInput, Graph } from "@/lib/schema";
import type { MarketMatch, Quote } from "@/lib/market";
import type { z } from "zod";
import { seed as exportControls } from "./seeds/export-controls";
import { seed as hormuz } from "./seeds/hormuz";
import { seed as midterms } from "./seeds/midterms";
import { seed as photonics } from "./seeds/photonics";

type RawGraph = z.infer<typeof LlmGraph>;
type Fixture = {
  input: GenerateInput;
  llm: RawGraph;
  graph: Graph;
  markets: Record<string, MarketMatch[]>;
  quotes: Record<string, Quote | null>;
};

const seeds: Record<string, RawGraph> = {
  hormuz,
  midterms,
  "export-controls": exportControls,
  photonics,
};

const outputDirectory = resolve(process.cwd(), "public", "fixtures");
const live = Boolean(process.env.OPENROUTER_API_KEY);

const networkFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(5_000) });

const pause = () => new Promise<void>((resolvePause) => setTimeout(resolvePause, 300));

function isComplete(graph: Graph) {
  return (
    graph.nodes.length >= 8 &&
    graph.nodes.filter(isNumeric).length >= 2 &&
    graph.nodes.filter((node) => isEvent(node) && node.isRoot).length === 1
  );
}

async function graphFor(slug: string, input: GenerateInput): Promise<{ llm: RawGraph; graph: Graph }> {
  const deps = defaultDeps();
  const llm = live
    ? await structured(deps, LlmGraph, GENERATE_SYSTEM, generatePrompt(input))
    : seeds[slug];
  if (!llm) throw new Error("missing seed for " + slug);

  const graph = repairGraph(llm, input, live ? modelId(deps.env) : "fixture-seed");
  if (!isComplete(graph)) throw new Error("incomplete fixture graph for " + slug);
  return { llm, graph };
}

async function marketSnapshots(graph: Graph): Promise<Record<string, MarketMatch[]>> {
  const events = graph.nodes.filter(isEvent).filter((node) => node.marketQuery);
  if (events.length === 0) return {};

  const markets: Record<string, MarketMatch[]> = {};
  try {
    for (const node of events) {
      markets[node.id] = await searchPolymarket(node.marketQuery, networkFetch);
      await pause();
    }
    return markets;
  } catch {
    return {};
  }
}

async function quoteSnapshots(graph: Graph): Promise<Record<string, Quote | null>> {
  const tickers = [
    ...new Set(
      graph.nodes
        .filter(isNumeric)
        .map((node) => node.ticker)
        .filter((ticker): ticker is string => ticker !== null),
    ),
  ];
  if (tickers.length === 0) return {};

  const quotes = await fetchQuotes(tickers, networkFetch);
  return Object.values(quotes).some((quote) => quote !== null) ? quotes : {};
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });

  for (const example of EXAMPLES) {
    const { llm, graph } = await graphFor(example.slug, example.input);
    const fixture: Fixture = {
      input: example.input,
      llm,
      graph,
      markets: await marketSnapshots(graph),
      quotes: await quoteSnapshots(graph),
    };
    await writeFile(
      resolve(outputDirectory, example.slug + ".json"),
      JSON.stringify(fixture, null, 2) + "\n",
    );
    console.log("wrote " + example.slug);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
