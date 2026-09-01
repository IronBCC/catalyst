import type { Page, Route } from "@playwright/test";

/**
 * Every e2e spec runs against mocked routes: no OpenRouter key, no Polymarket,
 * no Yahoo, no flakiness. The default graph below is deliberately small but
 * schema-valid, so a spec that only needs "some graph appeared" needs no setup.
 */

export const DEFAULT_LLM_GRAPH = {
  nodes: [
    {
      id: "hormuz-closes",
      kind: "event",
      statement: "The Strait of Hormuz closes to commercial tanker traffic",
      resolution: "Lloyd's List reports a full closure lasting over 48 hours",
      base: 0.08,
      lagDays: [0, 3],
      rationale: "Root hypothesis under test",
      analogs: ["1984 tanker war"],
      assumptions: ["No immediate naval escort deal"],
      confidence: "medium",
      marketQuery: "Strait of Hormuz closure 2026",
      isRoot: true,
      isTarget: false,
    },
    {
      id: "insurance-spike",
      kind: "event",
      statement: "War-risk insurance for Gulf transits doubles",
      resolution: "Lloyd's war-risk premium above 2% of hull value",
      base: 0.2,
      lagDays: [1, 5],
      rationale: "Underwriters reprice within days of a closure",
      analogs: [],
      assumptions: ["Underwriters do not withdraw entirely"],
      confidence: "high",
      marketQuery: "gulf war risk insurance premium",
      isRoot: false,
      isTarget: false,
    },
    {
      id: "opec-release",
      kind: "event",
      statement: "OPEC+ announces an emergency spare-capacity release",
      resolution: "OPEC+ communique naming additional barrels",
      base: 0.25,
      lagDays: [3, 14],
      rationale: "Political pressure to cap the price spike",
      analogs: ["2022 SPR release"],
      assumptions: ["Spare capacity is physically deliverable"],
      confidence: "low",
      marketQuery: "OPEC emergency production increase",
      isRoot: false,
      isTarget: false,
    },
    {
      id: "brent-above-100",
      kind: "event",
      statement: "Brent settles above $100 within the horizon",
      resolution: "ICE Brent front-month settlement above 100",
      base: 0.12,
      lagDays: [2, 20],
      rationale: "Target of the chain",
      analogs: [],
      assumptions: [],
      confidence: "medium",
      marketQuery: "Brent above 100 in 2026",
      isRoot: false,
      isTarget: true,
    },
    {
      id: "brent",
      kind: "numeric",
      name: "Brent crude",
      unit: "USD/bbl",
      ticker: "BZ=F",
      current: 72.4,
      baselineMove: 0,
      sigma: 14,
      rationale: "Front-month contract",
      assumptions: [],
      confidence: "high",
    },
    {
      id: "airline-index",
      kind: "numeric",
      name: "US airline index",
      unit: "index",
      ticker: "JETS",
      current: 24.1,
      baselineMove: 0,
      sigma: 9,
      rationale: "Fuel is the largest variable cost",
      assumptions: [],
      confidence: "medium",
    },
  ],
  edges: [
    edge("hormuz-closes", "insurance-spike", "Closure forces underwriters to reprice", {
      polarity: "promote",
      strength: 0.85,
    }),
    edge("hormuz-closes", "opec-release", "A supply shock invites a political response", {
      polarity: "promote",
      strength: 0.5,
    }),
    edge("hormuz-closes", "brent", "Roughly a fifth of seaborne crude stops moving", {
      impact: 38,
    }),
    edge("insurance-spike", "brent", "Freight cost passes into the landed price", { impact: 6 }),
    edge("opec-release", "brent", "Extra barrels cap the spike", { impact: -9 }),
    edge("brent", "airline-index", "Jet fuel tracks crude", { beta: -0.6 }),
    edge("brent", "brent-above-100", "Level crosses the strike", {
      threshold: 100,
      direction: "above",
      width: 8,
    }),
  ],
  summary: {
    headline: "Closure repricing runs through insurance and OPEC's response",
    mainUncertainty: "Whether spare capacity can physically reroute",
    followUps: ["Tanker day rates", "SPR release size"],
  },
};

type EdgeParams = {
  polarity?: "promote" | "inhibit";
  strength?: number;
  impact?: number;
  beta?: number;
  threshold?: number;
  direction?: "above" | "below";
  width?: number;
};

function edge(source: string, target: string, mechanism: string, params: EdgeParams) {
  return {
    source,
    target,
    mechanism,
    assumptions: [],
    confidence: "medium" as const,
    sourceIds: [] as string[],
    polarity: params.polarity ?? null,
    strength: params.strength ?? null,
    impact: params.impact ?? null,
    beta: params.beta ?? null,
    threshold: params.threshold ?? null,
    direction: params.direction ?? null,
    width: params.width ?? null,
  };
}

export const DEFAULT_BRANCH = {
  candidates: [
    {
      node: {
        id: "mine-warfare",
        kind: "event",
        statement: "Iran mines the shipping lane",
        resolution: "US Navy confirms mines in the channel",
        base: 0.15,
        lagDays: [0, 7],
        rationale: "Cheapest way to keep the strait shut",
        analogs: ["1988 Operation Praying Mantis"],
        assumptions: [],
        confidence: "medium",
        marketQuery: "Hormuz mines",
        isRoot: false,
        isTarget: false,
      },
      edges: [
        edge("mine-warfare", "brent", "Mines extend the closure", { impact: 12 }),
      ],
    },
  ],
};

export const DEFAULT_THESIS = {
  thesis: "Own crude upside into the closure window.",
  rationale: "The chain prices a supply shock that OPEC can only partly offset.",
  invalidation: ["A credible escort agreement is announced"],
  confirmation: ["War-risk premiums double"],
  risks: ["Spare capacity reroutes faster than modelled"],
  marketView: "The model sits above Polymarket on closure odds.",
};

export const DEFAULT_MARKETS = [
  {
    id: "hormuz-2026",
    question: "Will the Strait of Hormuz close in 2026?",
    yes: 0.275,
    url: "https://polymarket.com/event/hormuz-2026",
    endDate: "2026-12-31",
  },
];

export const DEFAULT_QUOTES = {
  "BZ=F": { ticker: "BZ=F", price: 72.4, currency: "USD", asOf: "2026-09-01T00:00:00.000Z" },
  JETS: { ticker: "JETS", price: 24.1, currency: "USD", asOf: "2026-09-01T00:00:00.000Z" },
};

export type MockSpec = {
  generate?: unknown | { status: number; body?: unknown };
  branch?: unknown | { status: number; body?: unknown };
  thesis?: unknown | { status: number; body?: unknown };
  markets?: unknown | { status: number; body?: unknown };
  quote?: unknown | { status: number; body?: unknown };
};

const isFailure = (v: unknown): v is { status: number; body?: unknown } =>
  typeof v === "object" && v !== null && "status" in (v as Record<string, unknown>);

/**
 * `mockApi(page)` mocks every route with a working default.
 * Pass `{ generate: { status: 503 } }` to make one route fail.
 */
export async function mockApi(page: Page, spec: MockSpec = {}) {
  const route = async (name: keyof MockSpec, fallback: unknown, asText: boolean) => {
    const configured = name in spec ? spec[name] : fallback;
    await page.route(`**/api/${name}`, async (r: Route) => {
      if (isFailure(configured)) {
        await r.fulfill({
          status: configured.status,
          contentType: "application/json",
          body: JSON.stringify(configured.body ?? { error: `mocked ${configured.status}` }),
        });
        return;
      }
      await r.fulfill({
        status: 200,
        contentType: asText ? "text/plain; charset=utf-8" : "application/json",
        body: JSON.stringify(configured),
      });
    });
  };

  // /api/generate streams the object as plain text, the others answer JSON.
  await route("generate", DEFAULT_LLM_GRAPH, true);
  await route("branch", { candidates: DEFAULT_BRANCH.candidates }, false);
  await route("thesis", DEFAULT_THESIS, false);
  await route("markets", DEFAULT_MARKETS, false);
  await route("quote", DEFAULT_QUOTES, false);
}

/** Wipe persisted state so a spec starts from an empty workspace. */
export async function freshWorkspace(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem("catalyst.workspace");
    } catch {
      /* private mode */
    }
  });
}
