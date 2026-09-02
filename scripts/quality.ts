/**
 * Quality, cost and speed across models.
 *
 * Usage: npx tsx scripts/quality.ts <model> [<model> ...]
 *
 * Structural benchmarks only prove a graph parsed. This one runs the eight
 * checks in src/lib/quality.ts over explore AND chain prompts, repeats one
 * prompt to measure run-to-run stability, and records what every call cost.
 */
import { repairGraph } from "@/lib/engine/repair";
import { fetchQuotes } from "@/lib/market";
import { checkGraph, runsAreStable, type Check } from "@/lib/quality";
import { structured, type Deps } from "@/lib/llm";
import { GENERATE_SYSTEM, generatePrompt } from "@/lib/prompts";
import { isNumeric, LlmGraph, type GenerateInput, type Graph } from "@/lib/schema";

const PROMPTS: { slug: string; input: GenerateInput }[] = [
  {
    slug: "hormuz",
    input: {
      hypothesis: "The Strait of Hormuz closes to commercial tanker traffic",
      mode: "explore",
      target: null,
      horizonDays: 30,
      positions: [{ ticker: "USO", side: "long", size: 1, stopPct: 8, targetPct: 25 }],
    },
  },
  {
    slug: "export-controls",
    input: {
      hypothesis: "The US extends semiconductor export controls to legacy nodes",
      mode: "explore",
      target: null,
      horizonDays: 180,
      positions: [],
    },
  },
  {
    slug: "photonics",
    input: {
      hypothesis: "Photonic interconnects get adopted in datacenters faster than expected",
      mode: "explore",
      target: null,
      horizonDays: 365,
      positions: [],
    },
  },
  {
    slug: "rate-cuts",
    input: {
      hypothesis: "The Federal Reserve cuts rates three times this year",
      mode: "explore",
      target: null,
      horizonDays: 365,
      positions: [{ ticker: "TLT", side: "long", size: 1, stopPct: 6, targetPct: 15 }],
    },
  },
  {
    slug: "chain-brent",
    input: {
      hypothesis: "The Strait of Hormuz closes to commercial tanker traffic",
      mode: "chain",
      target: "Brent crude settles above 100 dollars a barrel",
      horizonDays: 90,
      positions: [],
    },
  },
  {
    slug: "chain-chips",
    input: {
      hypothesis: "Taiwan suffers a grid failure lasting more than a week",
      mode: "chain",
      target: "Leading-edge logic wafer prices rise more than 20 percent",
      horizonDays: 180,
      positions: [],
    },
  },
];

const STABILITY_SLUG = "hormuz";

type Run = {
  model: string;
  slug: string;
  ok: boolean;
  ms: number;
  cost: number;
  checks: Check[];
  graph?: Graph;
  error?: string;
};

/** Reads `usage.cost` off the wire; the SDK does not surface it. */
function costTrackingDeps(model: string): { deps: Deps; total: () => number } {
  let total = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    const res = await fetch(url, init);
    const text = await res.text();
    try {
      total += JSON.parse(text)?.usage?.cost ?? 0;
    } catch {
      /* not a JSON body */
    }
    return new Response(text, { status: res.status, headers: res.headers });
  };
  return {
    deps: { fetchImpl, env: { ...process.env, OPENROUTER_MODEL: model } },
    total: () => total,
  };
}

async function once(model: string, slug: string, input: GenerateInput): Promise<Run> {
  const { deps, total } = costTrackingDeps(model);
  const started = Date.now();
  try {
    const llm = await structured(deps, LlmGraph, GENERATE_SYSTEM, generatePrompt(input));
    const graph = repairGraph(llm, input, model);
    const tickers = graph.nodes.flatMap((n) => (isNumeric(n) && n.ticker ? [n.ticker] : []));
    const quotes = tickers.length ? await fetchQuotes(tickers) : {};
    const resolved = Object.fromEntries(
      Object.entries(quotes).filter(([, quote]) => quote !== null),
    );
    return {
      model,
      slug,
      ok: true,
      ms: Date.now() - started,
      cost: total(),
      checks: checkGraph(graph, resolved),
      graph,
    };
  } catch (error) {
    return {
      model,
      slug,
      ok: false,
      ms: Date.now() - started,
      cost: total(),
      checks: [],
      error: (error as Error).message.slice(0, 160),
    };
  }
}

async function main() {
  const models = process.argv.slice(2);
  if (models.length === 0) throw new Error("pass at least one model id");
  const runs: Run[] = [];

  for (const model of models) {
    for (const prompt of PROMPTS) {
      const run = await once(model, prompt.slug, prompt.input);
      runs.push(run);
      const passed = run.checks.filter((c) => c.ok).length;
      console.log(
        `${model} ${prompt.slug.padEnd(16)} ${run.ok ? "OK  " : "FAIL"} ${(run.ms / 1000).toFixed(0)}s $${run.cost.toFixed(4)} checks ${passed}/${run.checks.length}` +
          (run.error ? ` ${run.error}` : ""),
      );
      for (const check of run.checks.filter((c) => !c.ok)) {
        console.log(`    - ${check.id}: ${check.detail}`);
      }
    }

    // Second pass on one prompt only: stability costs a whole extra call.
    const first = runs.find((r) => r.model === model && r.slug === STABILITY_SLUG && r.ok);
    const repeat = await once(model, STABILITY_SLUG, PROMPTS.find((p) => p.slug === STABILITY_SLUG)!.input);
    runs.push({ ...repeat, slug: `${STABILITY_SLUG}#2` });
    if (first?.graph && repeat.graph) {
      const stability = runsAreStable(first.graph, repeat.graph);
      console.log(`${model} stability        ${stability.ok ? "OK  " : "FAIL"} ${stability.detail}`);
      first.checks.push(stability);
    }
  }

  console.log("\n=== SUMMARY ===");
  for (const model of models) {
    const mine = runs.filter((r) => r.model === model);
    const ok = mine.filter((r) => r.ok);
    const checks = ok.flatMap((r) => r.checks);
    const quality = checks.length
      ? checks.reduce((sum, c) => sum + c.score, 0) / checks.length
      : 0;
    const times = mine.map((r) => r.ms).sort((a, b) => a - b);
    const cost = mine.reduce((sum, r) => sum + r.cost, 0);
    console.log(
      [
        model.padEnd(24),
        `graphs ${ok.length}/${mine.length}`,
        `quality ${(quality * 100).toFixed(0)}%`,
        `median ${(times[Math.floor(times.length / 2)] / 1000).toFixed(0)}s`,
        `cost $${cost.toFixed(4)}`,
        `per graph $${(cost / Math.max(1, ok.length)).toFixed(4)}`,
      ].join("  "),
    );
    const byCheck = new Map<string, { ok: number; n: number }>();
    for (const check of checks) {
      const entry = byCheck.get(check.id) ?? { ok: 0, n: 0 };
      entry.ok += check.ok ? 1 : 0;
      entry.n += 1;
      byCheck.set(check.id, entry);
    }
    for (const [id, entry] of byCheck) console.log(`    ${id.padEnd(24)} ${entry.ok}/${entry.n}`);
  }
}

void main();
