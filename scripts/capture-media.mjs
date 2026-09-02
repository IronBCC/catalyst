/**
 * Regenerates the README's screenshots and walkthrough video.
 *
 *   npm run dev            # the app must be up on :3000
 *   node scripts/capture-media.mjs
 *   ffmpeg -i /tmp/catalyst-capture/*.webm -vf scale=1440:-2 -c:v libx264 \
 *     -pix_fmt yuv420p -crf 26 -movflags +faststart docs/media/demo.mp4
 *
 * The GIF in the README comes from the same webm; see docs/media/README.md.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "docs/media";
const VIDEO_DIR = process.env.VIDEO_DIR ?? "/tmp/catalyst-capture";
mkdirSync(OUT, { recursive: true });

const size = { width: 1440, height: 900 };
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: size,
  deviceScaleFactor: 2,
  recordVideo: { dir: VIDEO_DIR, size },
});
const page = await context.newPage();

const pause = (ms) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

await page.goto("http://localhost:3000");
await page.evaluate(() => window.localStorage.removeItem("catalyst.workspace"));
await page.reload();
await pause(800);

// 1. The empty state: what the tool asks you for.
await shot("01-hypothesis");
await pause(600);

// 2. The map.
await page.getByTestId("example-hormuz").click();
await page.waitForSelector('[data-testid="canvas"]');
await pause(1500);
await page.locator(".react-flow__controls-fitview").click();
await pause(1200);
await shot("02-map");

// 3. A node open in the inspector.
await page.locator('[data-testid^="node-"]').first().click();
await pause(900);
// The inspector took a third of the width; refit so the map still fills what
// is left of it.
await page.locator(".react-flow__controls-fitview").click();
await pause(1200);
await shot("03-inspector");

// 4. A what-if: assume it happens, and the downstream moves.
await page.getByRole("button", { name: "happens", exact: true }).click();
await pause(1800);
await shot("04-world");

// 5. Outcomes.
await page.getByTestId("tab-scenarios").click();
await pause(1500);
await shot("05-outcomes");

// 6. Thesis.
await page.getByTestId("tab-thesis").click();
await pause(1500);
await shot("06-thesis");

// 7. The world switcher.
await page.getByTestId("tab-map").click();
await pause(800);
await page.getByTestId("world-switcher").click();
await pause(1200);
await shot("07-worlds");
await page.keyboard.press("Escape");
await pause(800);

await context.close();
await browser.close();
console.log("done");
