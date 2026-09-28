import { expect, test } from "@playwright/test";
import { REVIEW } from "./pages";

test("first Tab is the skip link, and it moves focus into main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement?.closest("main"))).toBe(true);
});

test("focus ring is a 2px amber outline", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as Element);
    return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}`;
  });
  expect(outline).toBe("solid 2px rgb(245, 179, 1) 2px");
});

test("filter tabs work with arrow keys and filter the grid", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "All" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Browser" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/tab=browser/);
  const cards = page.locator("#submission-results article");
  const n = await cards.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(cards.nth(i).getByText("Browser", { exact: true })).toBeVisible();
});

test("clear filters keeps focus on the page", async ({ page }) => {
  await page.goto("/?q=zzzz-nothing");
  await page.getByRole("button", { name: "Clear filters" }).press("Enter");
  await expect(page.getByRole("searchbox", { name: "Search submissions" })).toBeFocused();
  await expect(page.locator("#submission-results article").first()).toBeVisible();
});

test("a card opens with Enter", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /alice-chen/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/s\/alice-chen$/);
});

test("timeline dots show their step on focus and Escape hides it", async ({ page }) => {
  await page.goto("/s/alice-chen");
  const dot = page.getByRole("button", { name: /Clicked Run crawl/ });
  await dot.focus();
  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("Clicked Run crawl");
  await expect(tip).toContainText("fans out stealth browsers");
  await page.keyboard.press("Escape");
  await expect(tip).toHaveCount(0);
});

test("log tabs switch with arrow keys", async ({ page }) => {
  await page.goto("/s/alice-chen");
  await page.getByRole("tab", { name: "Install" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Run" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#logs-panel")).toContainText("uvicorn");
});

test("opt-out form: errors are announced and keep the typed value", async ({ page }) => {
  await page.goto("/optout");
  const input = page.getByLabel("GitHub username");
  await input.fill("not a user!!");
  await input.press("Enter");
  await expect(page.locator("#optout-error")).toHaveText("That doesn't look like a GitHub username.");
  await expect(input).toHaveValue("not a user!!");
  await expect(input).toHaveAttribute("aria-invalid", "true");
});

test("review page: j/k move the selection, Enter opens it", async ({ page }) => {
  await page.goto(REVIEW);
  // The first Tab still reaches the skip link (no scroll-on-mount).
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.locator("h1").click();
  const selected = page.locator('tr[aria-selected="true"] td:nth-child(2)');
  const first = await selected.innerText();
  await page.keyboard.press("j");
  const second = await selected.innerText();
  expect(second).not.toBe(first);
  await expect(page.getByText(`Selected 2 of`)).toBeAttached();
  await page.keyboard.press("k");
  await expect(selected).toHaveText(first);
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/s/${second}$`));
});

test("review page with a wrong key is an ordinary 404", async ({ page }) => {
  const res = await page.goto("/review?key=nope");
  expect(res?.status()).toBe(404);
  await expect(page).toHaveTitle(/Not found/);
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
});
