import { expect, test } from "@playwright/test";

import { freshWorkspace, mockApi } from "./helpers";
import { sel, T } from "./testids";

test("writes thesis narrative and copies markdown", async ({ page }) => {
  const mockedThesis = {
    thesis: "Own crude upside into the closure window.",
    rationale: "The chain prices a supply shock that OPEC can only partly offset.",
    invalidation: ["A credible escort agreement is announced"],
    confirmation: ["War-risk premiums double"],
    risks: ["Spare capacity reroutes faster than modelled"],
    marketView: "The model sits above Polymarket on closure odds.",
  };

  await freshWorkspace(page);
  await mockApi(page, { thesis: mockedThesis });
  await page.goto("/");

  await expect(page.locator(sel(T.hypothesisInput))).toBeVisible();
  await page.locator(sel(T.hypothesisInput)).fill(
    "The Strait of Hormuz closes to commercial tanker traffic.",
  );
  await page.locator(sel(T.generateButton)).click();
  await expect(page.locator(sel(T.node("hormuz-closes"))).first()).toBeVisible();

  await page.locator(sel(T.tab("thesis"))).click();
  await expect(page.locator(sel(T.thesisCard))).toBeVisible();
  await expect(page.locator(sel(T.thesisEntry))).toBeVisible();
  await expect(page.locator(sel(T.thesisStop))).toBeVisible();
  await expect(page.locator(sel(T.thesisTakeProfit))).toBeVisible();
  await expect(page.locator(sel(T.thesisQuantileNote))).toBeVisible();

  await page.locator(sel(T.writeNarrative)).click();
  await expect(page.locator(sel(T.thesisNarrative))).toContainText(mockedThesis.thesis);

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  await page.locator(sel(T.copyMarkdown)).click();
  const clip = await page.evaluate(async () => navigator.clipboard.readText());
  await expect(clip).toContain(mockedThesis.thesis);
});
