import { expect, test } from "@playwright/test";

import { freshWorkspace, mockApi } from "./helpers";
import { sel, T } from "./testids";

test("responsive: 900px layout keeps rail in drawer and toggle exposes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await freshWorkspace(page);
  await mockApi(page);
  await page.goto("/");

  const rail = page.locator(sel(T.rail));
  const toggle = page.locator(sel(T.railToggle));

  await expect(toggle).toBeVisible();
  await expect(rail).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(rail).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("responsive: 1280px layout shows rail without toggle", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await freshWorkspace(page);
  await mockApi(page);
  await page.goto("/");

  await expect(page.locator(sel(T.rail))).toBeVisible();
  await expect(page.locator(sel(T.railToggle))).toBeHidden();
});
