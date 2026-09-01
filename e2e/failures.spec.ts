import { expect, test } from "@playwright/test";

import { freshWorkspace, mockApi } from "./helpers";
import { sel, T } from "./testids";

const SEED_WORLD_NAME = "Baseline";

const SEED_WORKSPACE = {
  version: 1,
  graph: {
    id: "hormuz-baseline",
    hypothesis: "The Strait of Hormuz closes to commercial tanker traffic",
    mode: "explore",
    target: "Brent settles above $100 within the horizon",
    horizonDays: 30,
    nodes: [
      {
        id: "hormuz-closes",
        kind: "event",
        statement: "The Strait of Hormuz closes to commercial tanker traffic",
        resolution: "Lloyd's List reports a full closure lasting over 48 hours",
        base: 0.08,
        lagDays: [0, 3],
        rationale: "Seeded workspace",
        analogs: ["1984 tanker war"],
        assumptions: ["No immediate naval escort deal"],
        confidence: "medium",
        marketQuery: "Strait of Hormuz closure 2026",
        isRoot: true,
        isTarget: false,
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
        rationale: "Seeded numeric",
        assumptions: [],
        confidence: "high",
      },
    ],
    edges: [
      {
        id: "hormuz-closes->brent",
        source: "hormuz-closes",
        target: "brent",
        kind: "en",
        mechanism: "Seed path to crude",
        assumptions: [],
        confidence: "medium",
        support: "model_assumption",
        sourceIds: [],
        impact: 38,
      },
    ],
    sources: [],
    model: "mock",
    generatedAt: "2026-09-01T00:00:00.000Z",
    summary: {
      headline: "Seed baseline summary",
      mainUncertainty: "Seeded uncertainty",
      followUps: ["Seed check one", "Seed check two"],
    },
  },
  worlds: [
    {
      id: "baseline",
      name: SEED_WORLD_NAME,
      parentId: null,
      edits: [],
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  activeWorldId: "baseline",
  compareWorldId: null,
  positions: [],
  thesis: {
    baseline: {
      thesis: "Seed thesis",
      rationale: "Seeded test data",
      invalidation: ["Unexpected escort agreement"],
      confirmation: ["Tanker queue grows"],
      risks: ["Fuel rerouting risk"],
      marketView: "Seed market view",
    },
  },
};

test("generate 503 leaves an existing graph untouched", async ({ page }) => {
  await freshWorkspace(page);
  await mockApi(page);
  await page.goto("/");

  await page.locator(sel(T.hypothesisInput)).fill("Will a temporary Hormuz disruption raise oil prices this month?");
  await page.locator(sel(T.generateButton)).click();
  await expect(page.locator(sel(T.canvas))).toBeVisible();
  await expect(page.locator(sel(T.node("hormuz-closes")))).toBeVisible();
  await expect(page.locator(sel(T.node("brent")))).toBeVisible();

  await page.unroute("**/api/generate");
  await page.route("**/api/generate", (route) => {
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "mocked 503" }),
    });
  });

  await page.locator(sel(T.hypothesisInput)).fill("Could a second run crash production?", { timeout: 1000 });
  await page.locator(sel(T.generateButton)).click();

  await expect(page.locator(sel(T.banner))).toBeVisible();
  await expect(page.locator(sel(T.banner))).toContainText("503");
  await expect(page.locator(sel(T.node("hormuz-closes")))).toBeVisible();
  await expect(page.locator(sel(T.node("brent")))).toBeVisible();
});

test("branch 502 keeps graph size and logs error", async ({ page }) => {
  await freshWorkspace(page);
  await mockApi(page);
  await page.goto("/");

  await page.locator(sel(T.branchInput)).fill("Could a second run produce a branch failure?");
  await page.locator(sel(T.branchInput)).click();
  const beforeNodes = await page
    .locator(sel(T.node("hormuz-closes")))
    .or(page.locator(sel(T.node("brent"))))
    .count();

  await page.unroute("**/api/branch");
  await page.route("**/api/branch", (route) => {
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "mocked 502" }),
    });
  });

  await page.locator(sel(T.branchButton)).click();
  const afterNodes = await page
    .locator(sel(T.node("hormuz-closes")))
    .or(page.locator(sel(T.node("brent"))))
    .count();

  await expect(page.locator(sel(T.logError))).toBeVisible();
  expect(beforeNodes).toBe(afterNodes);
});

test("reload restores graph, worlds, and thesis from storage", async ({ page }) => {
  const seed = JSON.stringify(SEED_WORKSPACE);

  await freshWorkspace(page);
  await mockApi(page);
  await page.goto("/");
  await page.evaluate((payload) => {
    window.localStorage.setItem("catalyst.workspace", payload);
  }, seed);
  await page.reload();

  await page.locator(sel(T.tab("map"))).click();
  await expect(page.locator(sel(T.node("hormuz-closes")))).toBeVisible();
  await expect(page.locator(sel(T.node("brent")))).toBeVisible();

  await page.locator(sel(T.tab("scenarios"))).click();
  await expect(page.locator(sel(T.worldRow("baseline")))).toBeVisible();

  await page.locator(sel(T.tab("thesis"))).click();
  await expect(page.locator(sel(T.thesisCard))).toBeVisible();
  await expect(page.locator(sel(T.thesisCard))).toContainText("Seed thesis");
});

test("corrupt persisted workspace does not error and shows empty shell", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await freshWorkspace(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("catalyst.workspace", "not-json");
  });
  await mockApi(page);
  await page.goto("/");

  await expect(page.locator(sel(T.hypothesisInput))).toBeVisible();
  await expect(page.locator(sel(T.banner))).toBeVisible();
  expect(errors).toHaveLength(0);
});
