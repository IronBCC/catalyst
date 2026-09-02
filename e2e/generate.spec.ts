import { expect, test } from "@playwright/test";
import { DEFAULT_LLM_GRAPH, freshWorkspace, mockApi } from "./helpers";
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

test("regenerate re-asks the graph's own hypothesis", async ({ page }) => {
  await freshWorkspace(page);
  await mockApi(page);
  await page.goto("/");

  await page.locator(sel(T.hypothesisInput)).fill("Will a temporary Hormuz disruption raise oil prices this month?");
  await page.locator(sel(T.generateButton)).click();
  await expect(page.locator(sel(T.node("hormuz-closes")))).toBeVisible();

  // The form is never read: clearing it must not change what regenerate asks.
  await page.locator(sel(T.railPane("hypothesis"))).click();
  await page.locator(sel(T.hypothesisInput)).fill("");

  const generate = page.waitForRequest((r) => r.url().includes("/api/generate") && r.method() === "POST");
  page.once("dialog", (d) => void d.accept());
  await page.locator(sel(T.regenerateButton)).click();

  const body = (await generate).postDataJSON();
  expect(body.hypothesis).toBe("Will a temporary Hormuz disruption raise oil prices this month?");
  await expect(page.locator(sel(T.node("hormuz-closes")))).toBeVisible();
});

test("a slow call is covered by the generating overlay until it lands", async ({ page }) => {
  await freshWorkspace(page);
  await mockApi(page);
  // Held open so the overlay can be observed; the mock in mockApi answers at once.
  await page.route("**/api/generate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: JSON.stringify(DEFAULT_LLM_GRAPH),
    });
  });
  await page.goto("/");

  await page.locator(sel(T.hypothesisInput)).fill("Will a temporary Hormuz disruption raise oil prices this month?");
  await page.locator(sel(T.generateButton)).click();

  await expect(page.locator(sel(T.generating))).toBeVisible();
  await expect(page.locator(sel(T.node("hormuz-closes")))).toBeVisible();
  await expect(page.locator(sel(T.generating))).toBeHidden();
});
