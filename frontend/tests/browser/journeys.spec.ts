import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
const before = resolve("tests/assets/demo-before.png");
const after = resolve("tests/assets/demo-after.png");
const openId = "5d7c1e2f-3a4b-4c5d-9e8f-1a2b3c4d5e61";
test("the icon rail expands, navigates, and collapses without an active dot", async ({
  page,
}) => {
  await page.goto("/river");
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator(".app-sidebar .active-diamond")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Observatory", exact: true }),
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
  await page.goto("/reports");
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
  await page.getByRole("link", { name: "Observatory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Signals over time" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Every dollar, accounted for" }),
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
      name: "A river with a voice. A future we can change.",
    }),
  ).toBeVisible();
  await expect(page.locator(".landing-stat")).toHaveCount(4);
  await expect(page.locator("main > section")).toHaveCount(9);
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
  await page.goto(`/bounties/${openId}`);
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Browser Test Guardian");
  await page
    .getByLabel("PayPal sandbox personal email")
    .fill("browser-test@example.test");
  await page.getByRole("button", { name: "Claim this cleanup" }).click();
  await expect(
    page.getByText("Capture a change worth seeing.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Capture a change worth seeing.", { exact: true }),
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
  await page.goto(`/bounties/${openId}`);
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
  await page.goto("/donate");
  await page
    .getByLabel(/Name on the public contribution record/)
    .fill("Browser River Supporter");
  await page
    .getByRole("button", { name: "Simulated donation · $15.00" })
    .click();
  await expect(
    page.getByText("A little care, carried forward.", { exact: true }),
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
  await page.goto("/council/sign-in");
  await page.getByLabel("Demo council key").fill("browser-demo-key");
  await page.getByRole("button", { name: "Enter workspace" }).click();
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
    page.getByRole("link", { name: "Enter council key" }),
  ).toBeVisible();
});
for (const width of [375, 768, 1280])
  test(`all pages fit a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/river",
      "/atlas",
      "/bounties",
      `/bounties/${openId}`,
      "/donate",
      "/reports",
      "/council/sign-in",
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
