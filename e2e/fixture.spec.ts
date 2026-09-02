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

test("the workspace survives a reload", async ({ page }) => {
  // Not freshWorkspace: its init script runs on every navigation, so it would
  // wipe the very state this asserts.
  await mockApi(page);
  await page.route("**/fixtures/hormuz.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(defaultFixture()),
    });
  });

  await page.goto("/");
  await page.evaluate(() => window.localStorage.removeItem("catalyst.workspace"));
  await page.reload();

  await page.locator(sel(T.exampleChip("hormuz"))).click();
  const rootId = DEFAULT_LLM_GRAPH.nodes[0].id;
  await expect(page.locator(sel(T.node(rootId)))).toBeVisible();

  // The store loads from localStorage after mount so the server and the client
  // render the same first frame; the graph must still come back.
  await page.reload();
  await expect(page.locator(sel(T.node(rootId)))).toBeVisible();
});
