// Captures the Devpost gallery images from a running dashboard, then renders
// the cover, architecture and mobile images from devpost/templates/.
//
//   npm run build && npm run start            # real data (or SCREENER_DATA=mock for the samples)
//   node devpost/capture.mjs [baseUrl]        # default http://localhost:3000
//
// Images are 1500x1000 at 2x (3:2, the ratio Devpost's gallery crops to).
// Set CHROMIUM_PATH to use an existing Chromium instead of Playwright's download.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "screenshots");

// The owners below are in the sample data set. With real data, pick your own:
// DETAIL is a booted web app with a demo, FAILED a build failure.
const DETAIL = process.env.DETAIL ?? "alice-chen";
const FAILED = process.env.FAILED ?? "tomasz-dev";

const DESKTOP = [
  { file: "01-submissions.png", path: "/" },
  { file: "02-submission-demo.png", path: `/s/${DETAIL}` },
  {
    file: "03-agent-steps.png",
    path: `/s/${DETAIL}`,
    prepare: async (page) => {
      await page.getByRole("tab", { name: /Agent steps/ }).click();
      await page.getByRole("tab", { name: /Agent steps/ }).evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.evaluate(() => window.scrollBy(0, -140));
    },
  },
  { file: "04-review.png", path: "/review" },
  {
    file: "05-review-table.png",
    path: "/review",
    prepare: async (page) => page.getByRole("button", { name: "Table", exact: true }).click(),
  },
  { file: "06-stats.png", path: "/stats" },
  { file: "07-how-it-works.png", path: "/how" },
  { file: "08-build-failed.png", path: `/s/${FAILED}` },
];

const PHONE = [
  { file: "_phone-home.png", path: "/" },
  { file: "_phone-detail.png", path: `/s/${DETAIL}` },
  { file: "_phone-review.png", path: "/review" },
];

// Rendered after the screenshots, since they embed them.
const TEMPLATES = [
  { file: "00-cover.png", template: "cover.html" },
  { file: "09-architecture.png", template: "architecture.html" },
  { file: "10-mobile.png", template: "mobile.html" },
];

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await mkdir(out, { recursive: true });

  const desktop = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  for (const shot of DESKTOP) {
    const page = await desktop.newPage();
    // The dashboard holds an event stream open, so "networkidle" never comes.
    await page.goto(base + shot.path, { waitUntil: "load" });
    await settle(page);
    if (shot.prepare) {
      await shot.prepare(page);
      await settle(page);
    }
    await page.screenshot({ path: join(out, shot.file) });
    await page.close();
    console.log(`✓ ${shot.file}`);
  }
  await desktop.close();

  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  for (const shot of PHONE) {
    const page = await phone.newPage();
    await page.goto(base + shot.path, { waitUntil: "load" });
    await settle(page);
    await page.screenshot({ path: join(out, shot.file) });
    await page.close();
    console.log(`✓ ${shot.file}`);
  }
  await phone.close();

  const canvas = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
  for (const t of TEMPLATES) {
    const page = await canvas.newPage();
    await page.goto(pathToFileURL(join(here, "templates", t.template)).href, { waitUntil: "load" });
    await settle(page);
    await page.screenshot({ path: join(out, t.file) });
    await page.close();
    console.log(`✓ ${t.file}`);
  }
  await canvas.close();
} finally {
  await browser.close();
}
