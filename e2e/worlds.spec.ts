"use strict";

import { expect, test } from "@playwright/test";

import { DEFAULT_LLM_GRAPH, freshWorkspace, mockApi } from "./helpers";
import { T } from "./testids";

test("worlds: root override creates a world and preserves baseline probability", async ({
  page,
}) => {
  await freshWorkspace(page);
  await mockApi(page);
  await page.goto("/");

  // Nothing exists until a graph is generated.
  await page.getByTestId("hypothesis-input").fill("The Strait of Hormuz closes to traffic");
  await page.getByTestId("generate").click();

  const root =
    DEFAULT_LLM_GRAPH.nodes.find((node) => node.kind === "event" && node.isRoot)?.id ??
    "hormuz-closes";
  const rootNode = page.getByTestId(T.node(root));

  await expect(rootNode).toBeVisible();
  await rootNode.click();

  const slider = page.getByTestId(T.paramSlider).locator('input[type="range"]');
  await expect(slider).toBeVisible();

  const compare = page.getByTestId(T.compareSelect);
  const beforeDelta = rootNode.getByTestId(T.nodeDelta);
  await expect(beforeDelta).not.toBeVisible();

  await slider.focus();
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(beforeDelta).toBeVisible();
  await expect(beforeDelta).toHaveText(/^[+-]\d+(\.\d+)?pp$/);

  // The worlds table and the compare selector live on the scenarios tab.
  await page.getByTestId(T.tab("scenarios")).click();

  const baselineRow = page.getByTestId(T.worldRow("baseline"));
  const baselineProb = await baselineRow
    .getByTestId(T.worldProbability)
    .textContent()
    .then((value) => (value ?? "").trim());

  const worlds = page.getByTestId(/world-row-/);
  await expect(worlds).toHaveCount(1);
  await page.getByTestId(T.tab("map")).click();
  await expect(page.getByTestId(T.applyToWorld)).toBeVisible();
  await page.getByTestId(T.applyToWorld).click();
  await page.getByTestId(T.tab("scenarios")).click();
  await expect(worlds).toHaveCount(2);

  await expect(baselineRow.getByTestId(T.worldProbability)).toHaveText(baselineProb);

  const compareOptionsCount = await compare.locator("option").count();
  if (compareOptionsCount >= 2) {
    const current = await compare.inputValue().catch(() => "");
    if (current) {
      const targetIndex = current === "baseline" ? 1 : 0;
      if (targetIndex < compareOptionsCount) {
        await compare.selectOption({ index: targetIndex });
      }
    } else {
      await compare.selectOption({ index: 1 });
    }
    await page.getByTestId(T.tab("map")).click();
    const deltaAfterCompare = rootNode.getByTestId(T.nodeDelta);
    await expect(deltaAfterCompare).toBeVisible();
  }
});
