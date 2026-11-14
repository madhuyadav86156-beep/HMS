import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { testMongo } from "./mongo-helper.mjs";
import { openDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";

const mongo = await testMongo();
const db = await openDatabase(mongo.uri);
const server = createApp(db, { staticDir: resolve("../frontend/build") }).listen(
  0,
  "127.0.0.1",
);
await new Promise((resolve) => server.once("listening", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
mkdirSync("test-results", { recursive: true });
const executable =
  process.env.BROWSER_EXECUTABLE ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(executable ? { executablePath: executable } : {}),
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByLabel("Your name", { exact: true }).fill("Arjun Kapoor");
  await page.getByLabel("Email address").fill("browser@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-password-123");
  await page
    .getByRole("button", { name: "Create administrator account" })
    .click();
  await page.getByRole("heading", { name: "Welcome back, Arjun" }).waitFor();
  await page
    .getByRole("heading", { name: "Revenue overview", exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  for (const name of [
    "Reservations",
    "Rooms & housekeeping",
    "Point of sale",
    "Payments",
    "Finance & GST",
    "People & payroll",
    "Inventory",
    "Compliance & audit",
    "Communications",
    "Reports",
    "Settings & access",
  ]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
    await page.getByRole("heading", { name, exact: true, level: 1 }).waitFor();
  }
  await page
    .getByRole("button", { name: "New reservation", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Guest name", { exact: true })
    .fill("Browser Test Guest");
  await dialog.getByLabel("Available room").selectOption("9");
  await dialog
    .getByRole("button", { name: "Create reservation", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Guest folio", exact: true })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Browser Test Guest" })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reservations", exact: true })
    .click();
  await page.getByLabel("Search reservations").fill("Browser Test Guest");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm checked in", exact: true })
    .click();
  await page.getByRole("button", { name: "Check out", exact: true }).waitFor();
  await page.getByRole("button", { name: "Folio", exact: true }).click();
  await page.getByRole("button", { name: "Add charge", exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Restaurant breakfast");
  await page.getByLabel("Amount before tax (₹)").fill("450");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page
    .getByRole("cell", { name: "Restaurant breakfast", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page.getByLabel("Amount collected (₹)").waitFor();
  await page.waitForFunction(
    () => document.querySelector('input[name="amount"]')?.value === "8950",
  );
  await page
    .getByRole("button", { name: "Record collection", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Guest folio", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".folio-totals dd.balance").textContent(),
    "₹0.00",
  );
  await page.screenshot({ path: "test-results/folio.png", fullPage: true });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm checked out", exact: true })
    .click();
  await page
    .locator("table .badge")
    .filter({ hasText: "checked out" })
    .waitFor();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Inventory", exact: true })
    .click();
  await page.getByLabel("Search inventory").fill("Basmati");
  await page.getByRole("button", { name: "Receive / issue" }).click();
  await page.getByLabel("Quantity (kg)").fill("10");
  await page
    .getByLabel("Reason / supplier reference")
    .fill("Browser test delivery");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page.getByRole("cell", { name: "28 kg", exact: true }).waitFor();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "People & payroll", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Record payroll", exact: true })
    .first()
    .click();
  await page.getByLabel("Reviewed total deductions (₹)").fill("1000");
  await page
    .getByLabel("Calculation / approval note")
    .fill("Reviewed in browser integration test");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page
    .getByRole("cell", { name: "Reviewed in browser integration test" })
    .waitFor();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reports", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download CSV", exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /reservations.*\.csv/);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page.reload();
  await page.getByRole("heading", { name: "Welcome back, Arjun" }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile page should not overflow horizontally",
  );
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rooms & housekeeping", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Rooms & housekeeping", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("heading", { name: "Welcome back.", exact: true })
    .waitFor();
  await page.getByLabel("Email address").fill("browser@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser-test-password-123");
  await page.getByRole("button", { name: "Sign in to your workspace" }).click();
  await page
    .getByRole("heading", { name: "Rooms & housekeeping", exact: true })
    .waitFor();
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    "PASS: setup, all 12 module routes, booking → check-in → service charge → payment → checkout, stock receipt, payroll, CSV download, refresh/session persistence, mobile navigation, logout/login; no runtime errors.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  await mongo.stop();
}
