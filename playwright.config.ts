import { defineConfig, devices } from "@playwright/test";

// End-to-end checks for layout, keyboard use, reduced motion and axe.
// They run the production build on the mock data set so results don't depend
// on what's in the database. First run: `npx playwright install chromium`.
const PORT = Number(process.env.E2E_PORT ?? 3300);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Point at an existing Chromium instead of Playwright's download, if needed.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { SCREENER_DATA: "mock" },
  },
});
