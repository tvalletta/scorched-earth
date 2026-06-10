import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const PREVIEW_DIR = path.join(__dirname, "previews");
const TYPES_DIR = path.join(PREVIEW_DIR, "types");

test.beforeAll(() => {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.mkdirSync(TYPES_DIR, { recursive: true });
});

test("terrain preview renders all types without flat edges", async ({ page }) => {
  await page.goto("/terrain-preview.html");

  // Wait for canvases to be populated (script appends them dynamically).
  await page.waitForSelector("canvas", { timeout: 10_000 });
  // All 9 terrain types × 2 seeds = 18 canvases.
  await expect(page.locator("canvas")).toHaveCount(18, { timeout: 10_000 });

  // Full-page overview saved at previews/overview.png.
  const full = await page.screenshot({ fullPage: true });
  fs.writeFileSync(path.join(PREVIEW_DIR, "overview.png"), full);

  // Per-type screenshots.
  const types = [
    "mountains", "hills", "valleys", "cliffs",
    "crater", "sky-high", "plateau", "flat", "random",
  ];
  for (const type of types) {
    const canvas = page.locator(`canvas#terrain-${type}-preview-a`);
    await expect(canvas).toBeAttached();

    // Save via toDataURL — locator.screenshot() is unreliable for off-screen
    // canvases, but toDataURL reads the canvas buffer directly regardless of
    // viewport position.
    const dataUrl = await canvas.evaluate((el: HTMLCanvasElement) =>
      el.toDataURL("image/png"),
    );
    const base64 = dataUrl.split(",")[1]!;
    fs.writeFileSync(path.join(TYPES_DIR, `${type}.png`), Buffer.from(base64, "base64"));

    // A terrain canvas (varied colours) produces a much larger PNG than a
    // blank dark canvas — > 5000 base64 chars means real content was rendered.
    expect(base64.length, `${type} canvas appears blank`).toBeGreaterThan(5000);
  }
});
