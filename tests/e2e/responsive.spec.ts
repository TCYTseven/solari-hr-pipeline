import { expect, test, type Page } from "@playwright/test";
import { PAGES } from "./pages";

// docs/steps.md Section 6: 3 columns at >=1200px, 2 at 810-1199px, 1 below.
const WIDTHS = [360, 390, 809, 810, 1024, 1199, 1200, 1440];

async function columns(page: Page, selector: string) {
  return page.$$eval(selector, (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const path of PAGES) {
      test(`no horizontal overflow on ${path}`, async ({ page }) => {
        await page.goto(path);
        const { scroll, client } = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(scroll).toBeLessThanOrEqual(client);
      });
    }

    test("submission grid column count", async ({ page }) => {
      await page.goto("/");
      const expected = width >= 1200 ? 3 : width >= 810 ? 2 : 1;
      expect(await columns(page, "#submission-results > ul > li")).toBe(expected);
    });

    test("detail page: score panel beside the video only at >=1200px", async ({ page }) => {
      await page.goto("/s/alice-chen");
      const video = await page.locator("#demo").boundingBox();
      const score = await page.locator("#score").boundingBox();
      expect(video && score).toBeTruthy();
      if (width >= 1200) expect(score!.x).toBeGreaterThan(video!.x + video!.width - 1);
      else expect(score!.y).toBeGreaterThan(video!.y + video!.height - 1);
    });

    test("nav collapses to a menu button below 810px", async ({ page }) => {
      await page.goto("/");
      const menu = page.getByRole("button", { name: "Open menu" });
      const stats = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Stats" });
      if (width < 810) {
        await expect(menu).toBeVisible();
        await expect(stats).toBeHidden();
        await menu.click();
        await expect(page.locator("#mobile-menu").getByRole("link", { name: "Stats" })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator("#mobile-menu")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
      } else {
        await expect(menu).toBeHidden();
        await expect(stats).toBeVisible();
      }
    });
  });
}

test.describe("mobile type", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("page title is 28px and the run table scrolls inside its frame", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCSS("font-size", "28px");
    await page.goto("/s/alice-chen?view=timing");
    const region = page.getByRole("region", { name: "Run breakdown table" });
    const { scroll, client } = await region.evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));
    expect(scroll).toBeGreaterThan(client);
  });
});
