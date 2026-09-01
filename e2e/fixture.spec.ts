import { expect, test } from "@playwright/test";
import { DEFAULT_LLM_GRAPH, defaultFixture, freshWorkspace, mockApi } from "./helpers";
import { sel, T } from "./testids";

test("fixture chip loads a full graph and keeps the disclaimer visible", async ({ page }) => {
  await freshWorkspace(page);
  await mockApi(page);

  const fixture = defaultFixture();
  await page.route("**/fixtures/hormuz.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(fixture),
    });
  });

  await page.goto("/");
  await page.locator(sel(T.exampleChip("hormuz"))).click();

  await expect(page.locator(sel(T.canvas))).toBeVisible();
  await expect(page.locator(sel(T.disclaimer))).toBeVisible();

  for (const node of DEFAULT_LLM_GRAPH.nodes) {
    await expect(page.locator(sel(T.node(node.id)))).toBeVisible();
  }

  await expect(page.locator(sel(T.logSummary))).toHaveText(
    DEFAULT_LLM_GRAPH.summary.headline,
  );
});
