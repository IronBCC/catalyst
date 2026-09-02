import { expect, test } from "@playwright/test";

import {
  DEFAULT_LLM_GRAPH,
  defaultFixture,
  freshWorkspace,
  mockApi,
} from "./helpers";
import { T } from "./testids";

test("world switcher moves between worlds and back", async ({ page }) => {
  await freshWorkspace(page);
  await mockApi(page);
  await page.route("**/fixtures/hormuz.json", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(defaultFixture()),
    });
  });
  await page.goto("/");
  await page.getByTestId(T.exampleChip("hormuz")).click();

  const rootId =
    DEFAULT_LLM_GRAPH.nodes.find((node) => node.kind === "event" && node.isRoot)?.id ??
    "hormuz-closes";
  const rootNode = page.getByTestId(T.node(rootId));
  const probability = rootNode.getByTestId(T.nodeProbability);
  const baselineProbability = await probability.textContent();

  await rootNode.click();
  const slider = page.getByTestId(T.paramSlider).locator('input[type="range"]');
  const box = await slider.boundingBox();
  if (!box) throw new Error("probability slider has no bounding box");
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(probability).not.toHaveText(baselineProbability ?? "");

  page.on("dialog", (dialog) => dialog.accept("test world"));
  await page.getByTestId(T.applyHere).click();

  const switcher = page.getByTestId(T.worldSwitcher);
  await expect(switcher).toContainText("test world (2 worlds)");
  await switcher.click();
  await expect(page.getByTestId(/^world-option-/)).toHaveCount(2);

  await page
    .getByTestId(T.worldOption("baseline"))
    .getByRole("button", { name: "Switch to Baseline" })
    .click();
  await expect(probability).toHaveText(baselineProbability ?? "");

  // Back again: switching is the whole feature, and it must land on the same
  // numbers each way.
  await switcher.click();
  await page
    .getByTestId(/^world-option-/)
    .filter({ hasText: "test world" })
    .getByRole("button", { name: "Switch to test world" })
    .click();
  await expect(probability).not.toHaveText(baselineProbability ?? "");
  await expect(switcher).toContainText("test world");
});
