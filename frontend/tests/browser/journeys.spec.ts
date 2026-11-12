import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
const before = resolve("tests/assets/demo-before.png");
const after = resolve("tests/assets/demo-after.png");
const openId = "5d7c1e2f-3a4b-4c5d-9e8f-1a2b3c4d5e61";
async function signUp(page: Page, next = "/river") {
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Your name").fill("Browser Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("browser-pass-1");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${next === "/" ? "/$" : next}$`));
}
async function signInCouncil(page: Page) {
  await page.goto("/login?next=/council");
  await page.getByLabel("Email").fill("council@demo.rivermind");
  await page.getByLabel("Password").fill("council-demo");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/council$/);
}
test("the landing is public and overview redirects signed-out visitors to sign in", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.goto("/river");
  await expect(page).toHaveURL(/\/login\?next=%2Friver$/);
  await expect(page.locator(".overview-summary")).toHaveCount(0);
  await page.goto("/bounties");
  await expect(page).toHaveURL(/\/login\?next=%2Fbounties$/);
  await page.goto("/council");
  await expect(page).toHaveURL(/\/login\?next=%2Fcouncil$/);
  await page.goto("/login?next=//evil.example");
  await page.getByLabel("Email").fill("council@demo.rivermind");
  await page.getByLabel("Password").fill("council-demo");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/river$/);
});
test("a worker is told council pages are council-only and can sign out", async ({
  page,
}) => {
  await signUp(page, "/bounties");
  await page.goto("/council");
  await expect(
    page.getByRole("heading", { name: "Council access only" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browser", exact: true }).click();
  await expect(page.getByText("Worker", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Worker", { exact: true })).toBeHidden();
});
test("overview and guide fit a laptop viewport, with fixed navigation and a responsive allocation chart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signUp(page, "/river");
  await expect(page.locator(".overview-stats .metric-card")).toHaveCount(6);
  await expect(page.locator(".app-topbar")).toHaveCSS("position", "fixed");
  await expect(page.locator(".water-backdrop, .overview-deck")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    )
    .toBe(true);
  await page.locator(".allocation-legend dt").nth(1).hover();
  await expect(page.locator(".allocation-center")).toContainText("reserved");
  await page.mouse.move(200, 100);
  await expect(page.locator(".allocation-center")).toContainText("available");
  await page.goto("/about");
  await expect(page.locator(".workflow-phone")).toHaveCount(3);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "How RiverMind works" }),
  ).toBeVisible();
  await page.locator(".auth-trigger").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fabout$/);
});
test("quest pagination bounds rendered cards and debounced search resets the page", async ({
  page,
}) => {
  await page.route("**/fixtures/bounties.ok.json", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const base = data.items[0];
    await route.fulfill({
      json: {
        items: Array.from({ length: 18 }, (_, index) => ({
          ...base,
          id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
          title: `Pagination test quest ${index + 1}`,
        })),
      },
    });
  });
  await signUp(page, "/bounties");
  await expect(page.locator(".quest-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Quest pages" }),
  ).toContainText("Page 2");
  await page.getByLabel("Search cleanup quests").fill("quest 17");
  await expect(page.locator(".quest-card")).toHaveCount(1);
  await expect(page.locator(".quest-card")).toContainText(
    "Pagination test quest 17",
  );
});
test("the icon rail expands, navigates, and collapses without an active dot", async ({
  page,
}) => {
  await signUp(page, "/river");
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator(".app-sidebar .active-diamond")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(page.locator(".app-shell")).not.toHaveClass(/sidebar-collapsed/);
  await expect(page.locator(".sidebar-label").first()).toBeVisible();
  await page.getByRole("link", { name: "River treasury", exact: true }).click();
  await expect(page).toHaveURL(/\/donate$/);
  await expect(page.locator(".app-shell")).not.toHaveClass(/sidebar-collapsed/);
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator(".sidebar-label").first()).toBeHidden();
});
test("monthly reports download their selected data and handle empty months", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signUp(page, "/reports");
  await expect(
    page.getByRole("heading", { name: "Monthly reports", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Report month").fill("2026-11");
  const csvButton = page.getByRole("button", {
    name: "Download CSV",
    exact: true,
  });
  await expect(csvButton).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    csvButton.click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    "rivermind-2026-11-available-records.csv",
  );
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Simulated demo records");
  expect(csv).toContain("not a complete monthly archive");
  expect(csv).toContain('1500,"USD cents"');
  expect(csv).not.toContain("@example.com");
  await page.getByLabel("Report month").fill("2026-10");
  await expect(
    page.getByRole("heading", { name: "No returned records for this month." }),
  ).toBeVisible();
  await expect(csvButton).toBeDisabled();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Signals over time" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Treasury allocation" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("the full landing page loads data, navigates, and expands its FAQ", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A river with a voice. A cleanup with proof.",
    }),
  ).toBeVisible();
  await expect(page.locator(".landing-stat")).toHaveCount(4);
  await expect(page.locator("main > section")).toHaveCount(6);
  await expect(
    page.locator('#how-it-works, a[href="#how-it-works"]'),
  ).toHaveCount(0);
  const question = page
    .locator(".faq-list summary")
    .filter({ hasText: "What exactly is RiverMind?" });
  await question.click();
  await expect(page.locator(".faq-list details").first()).toHaveAttribute(
    "open",
    "",
  );
  await page
    .getByRole("link", { name: "Explore the river", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?next=%2Fatlas$/);
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Your name").fill("Landing Tester");
  await page.getByLabel("Email").fill(`landing-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("browser-pass-1");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "River atlas", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".atlas-location-list button")).toHaveCount(7);
  await page.locator(".atlas-location-list button").first().click();
  await expect(page.locator(".atlas-selection h2")).toBeVisible();
  expect(errors).toEqual([]);
});
test("a claimed quest survives refresh and completes the labelled demo proof journey", async ({
  page,
}) => {
  await signUp(page, `/bounties/${openId}`);
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Browser Test Guardian");
  await page
    .getByLabel("PayPal sandbox personal email")
    .fill("browser-test@example.test");
  await page.getByRole("button", { name: "Claim this cleanup" }).click();
  await expect(
    page.getByText("Before and after photos", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Before and after photos", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Use simulated quest location for this demo only")
    .check();
  await page
    .getByLabel("Before cleanup photo", { exact: true })
    .setInputFiles(before);
  await expect(
    page.getByAltText("Before cleanup evidence preview"),
  ).toBeVisible();
  await page
    .getByLabel("After cleanup photo", { exact: true })
    .setInputFiles(after);
  await expect(
    page.getByAltText("After cleanup evidence preview"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit cleanup proof" }).click();
  await expect(
    page.getByText("The cleanup checks passed.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/The payout is confirmed/)).toBeVisible();
  await expect(
    page.getByText(/predefined demo checks, not AI analysis/),
  ).toBeVisible();
});
test("identical evidence is rejected in demo mode", async ({ page }) => {
  await signUp(page, `/bounties/${openId}`);
  await page.getByLabel("Your name", { exact: true }).fill("Duplicate Demo");
  await page
    .getByLabel("PayPal sandbox personal email")
    .fill("duplicate@example.test");
  await page.getByRole("button", { name: "Claim this cleanup" }).click();
  await page
    .getByLabel("Use simulated quest location for this demo only")
    .check();
  await page
    .getByLabel("Before cleanup photo", { exact: true })
    .setInputFiles(before);
  await expect(
    page.getByAltText("Before cleanup evidence preview"),
  ).toBeVisible();
  await page
    .getByLabel("After cleanup photo", { exact: true })
    .setInputFiles(before);
  await expect(
    page.getByAltText("After cleanup evidence preview"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit cleanup proof" }).click();
  await expect(
    page.getByText("This evidence was not accepted.", { exact: true }),
  ).toBeVisible();
});
test("a simulated donation updates its public contribution record", async ({
  page,
}) => {
  await signUp(page, "/donate");
  await page
    .getByLabel(/Name on the public contribution record/)
    .fill("Browser River Supporter");
  await page
    .getByRole("button", { name: "Simulated donation · $15.00" })
    .click();
  await expect(
    page.getByText("Donation received", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".contribution-list")
      .getByText("Browser River Supporter", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Make another contribution/ }).click();
  await page.getByLabel("Your amount in USD").fill("0.50");
  await expect(
    page.getByRole("button", { name: /Simulated donation/ }),
  ).toBeDisabled();
});
test("council approval and retry update the queue and never persist the key", async ({
  page,
}) => {
  await signInCouncil(page);
  await page.getByRole("button", { name: "Review approval" }).click();
  await page.getByRole("button", { name: "Confirm payout approval" }).click();
  await expect(
    page.getByText("Nothing waiting for approval.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retry payment", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm payment retry" }).click();
  await expect(
    page.getByText("No failed payments to review.", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        session: { ...sessionStorage },
        local: { ...localStorage },
      }),
    ),
  ).not.toContain("browser-demo-key");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Council workspace", exact: true }),
  ).toBeVisible();
});
for (const width of [375, 768, 1280])
  test(`all pages fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInCouncil(page);
    for (const path of [
      "/",
      "/river",
      "/atlas",
      "/bounties",
      `/bounties/${openId}`,
      "/donate",
      "/reports",
      "/council",
      "/about",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await page.waitForFunction(
        () => document.querySelectorAll(".skeleton-stack").length === 0,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${path} overflows at ${width}px`,
      ).toBe(true);
    }
  });
