import { expect, test } from "@playwright/test";
import { freshWorkspace, mockApi } from "./helpers";
import { sel, T } from "./testids";

test("generate renders nodes from mocked stream and writes summary to rail", async ({ page }) => {
  await freshWorkspace(page);
  await mockApi(page);
  await page.goto("/");

  const hypothesis = page.locator(sel(T.hypothesisInput));
  const generate = page.locator(sel(T.generateButton));

  await expect(hypothesis).toBeVisible();
  await expect(generate).toBeVisible();

  await hypothesis.fill("Will a temporary Hormuz disruption raise oil prices this month?");
  await generate.click();

  await expect(page.locator(sel(T.canvas))).toBeVisible();
  await expect(page.locator(sel(T.node("hormuz-closes")))).toBeVisible();
  await expect(page.locator(sel(T.node("brent")))).toBeVisible();

  await expect(page.locator(sel(T.rail))).toBeVisible();
  await expect(page.locator(sel(T.logSummary))).toHaveText(
    "Closure repricing runs through insurance and OPEC's response",
  );
});
