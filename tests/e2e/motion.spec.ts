import { expect, test } from "@playwright/test";

const firstMetric = (page: import("@playwright/test").Page) => page.locator("dl dd").first();

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("count-up shows the final numbers at once", async ({ page }) => {
    await page.goto("/", { waitUntil: "commit" });
    await firstMetric(page).waitFor();
    const final = (await page.request.get("/").then((r) => r.text())).match(/<dd[^>]*><span[^>]*>([\d,]+)/)?.[1];
    await page.waitForLoadState("load");
    await expect(firstMetric(page)).toHaveText(final!);
  });

  test("the live pulse and fade-in are off", async ({ page }) => {
    await page.goto("/");
    const pulse = page.locator(".live-pulse").first();
    await expect(pulse).toHaveCSS("animation-name", "none");
  });

  test("hovering a card never mounts a preview video", async ({ page }) => {
    await page.goto("/");
    await page.locator("article").first().hover();
    await page.waitForTimeout(300);
    await expect(page.locator("article video")).toHaveCount(0);
  });
});

test.describe("normal motion", () => {
  test("hero numbers count up from 0", async ({ page }) => {
    await page.goto("/");
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      seen.add(await firstMetric(page).innerText());
      await page.waitForTimeout(60);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("the live-scan dot pulses", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".live-pulse").first()).toHaveCSS("animation-name", "live-pulse");
  });
});
