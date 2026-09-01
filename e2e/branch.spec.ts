import { expect, test } from "@playwright/test";

import { freshWorkspace, mockApi } from "./helpers";
import { sel, T } from "./testids";

const BRANCH_STRESS_RESPONSE = {
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
        {
          source: "mine-warfare",
          target: "brent",
          mechanism: "Mines extend the closure",
          assumptions: [],
          confidence: "medium",
          sourceIds: [],
          polarity: "promote",
          strength: 0.66,
          impact: null,
          beta: null,
          threshold: null,
          direction: null,
          width: null,
        },
      ],
    },
    {
      node: {
        id: "escort-failure",
        kind: "event",
        statement: "International escort plan collapses",
        resolution: "Coordinating naval command issues delay",
        base: 0.2,
        lagDays: [1, 9],
        rationale: "Diplomatic process breaks down",
        analogs: [],
        assumptions: [],
        confidence: "low",
        marketQuery: "Hormuz escort plan",
        isRoot: false,
        isTarget: false,
      },
      edges: [],
    },
    {
      node: {
        id: "spare-capacity",
        kind: "event",
        statement: "Spare capacity report is revised down",
        resolution: "OPEC publishes revised reserve report",
        base: 0.11,
        lagDays: [2, 11],
        rationale: "Capacity can be lower than advertised",
        analogs: [],
        assumptions: [],
        confidence: "high",
        marketQuery: "OPEC spare capacity revision",
        isRoot: false,
        isTarget: false,
      },
      edges: [],
    },
  ],
};

test("branches from rail, injects a stress candidate, and adopts Polymarket odds", async ({ page }) => {
  await freshWorkspace(page);
  await mockApi(page, { branch: BRANCH_STRESS_RESPONSE });
  await page.goto("/");

  await expect(page.locator(sel(T.branchInput))).toBeVisible();
  await page.locator(sel(T.branchInput)).fill("Iran lays mines in the strait");
  await page.locator(sel(T.branchButton)).click();

  await expect(page.locator(sel(T.node("mine-warfare"))).first()).toBeVisible();
  await expect(page.locator(sel(T.nodeNewPill))).toBeVisible();

  await expect(page.locator(sel(T.stressButton))).toBeVisible();
  await page.locator(sel(T.stressButton)).click();
  await expect(page.locator(sel(T.stressCandidate))).toHaveCount(3);

  const firstCandidate = page.locator(sel(T.stressCandidate)).first();
  await expect(firstCandidate.locator(sel(T.injectCandidate))).toBeVisible();
  await firstCandidate.locator(sel(T.injectCandidate)).click();
  await expect(page.locator(sel(T.logEntry)).last()).toHaveText(/Black swan:/);

  await page.locator(sel(T.node("mine-warfare"))).first().click();
  await expect(page.locator(sel(T.adoptMarket))).toBeVisible();
  await page.locator(sel(T.adoptMarket)).click();
  await expect(page.locator(sel(T.nodeMarketPill))).toHaveText(/Polymarket\s+27\.5%/);
});
