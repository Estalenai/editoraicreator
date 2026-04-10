#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.EAC_BASE_URL || "https://editor-ai-creator-web.vercel.app";
const EMAIL = process.env.EAC_EMAIL || "teste2@gmail.com";
const PASSWORD = process.env.EAC_PASSWORD || "12345678";
const OUTPUT_DIR = path.join(
  process.cwd(),
  "output",
  "validation",
  "dashboard-account-production",
  new Date().toISOString().replace(/[:.]/g, "-"),
);

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile-375", width: 375, height: 812 },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});

  const emailField = page.locator('input[type="email"]').first();
  const passwordField = page.locator('input[type="password"]').first();
  await emailField.waitFor({ state: "visible", timeout: 45000 });
  await emailField.fill(EMAIL);
  await passwordField.fill(PASSWORD);

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 120000 }),
    page.locator("form.auth-entry-card-open button[type='submit']").first().click(),
  ]);
}

async function probeViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const responseErrors = [];
  const requestFailures = [];
  const consoleErrors = [];

  page.on("response", async (response) => {
    const status = response.status();
    if (status < 400) return;
    responseErrors.push({
      status,
      url: response.url(),
      resourceType: response.request().resourceType(),
      method: response.request().method(),
    });
  });

  page.on("requestfailed", (request) => {
    requestFailures.push({
      url: request.url(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText || null,
      method: request.method(),
    });
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await login(page);
  await page.goto(`${BASE_URL}/dashboard/account`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const initialSummary = await page
    .locator(".account-summary-card strong")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() || ""));

  const refreshButton = page.getByRole("button", { name: /atualizar conta/i }).first();
  if (await refreshButton.isVisible().catch(() => false)) {
    await refreshButton.click();
    await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }

  const refreshedSummary = await page
    .locator(".account-summary-card strong")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() || ""));

  const screenshotPath = path.join(OUTPUT_DIR, `${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const payload = {
    viewport,
    url: page.url(),
    heading: await page.locator("h1").first().textContent().catch(() => null),
    initialSummary,
    refreshedSummary,
    responseErrors,
    requestFailures,
    consoleErrors,
    screenshotPath,
  };

  await page.close();
  return payload;
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    for (const viewport of VIEWPORTS) {
      results.push(await probeViewport(browser, viewport));
    }
    const reportPath = path.join(OUTPUT_DIR, "report.json");
    await fs.writeFile(reportPath, `${JSON.stringify({ baseUrl: BASE_URL, results }, null, 2)}\n`, "utf8");
    console.log(reportPath);
  } finally {
    await browser.close();
  }
}

await main();
