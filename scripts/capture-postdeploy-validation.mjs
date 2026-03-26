#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const DEFAULT_BASE_URL = "https://editor-ai-creator-web-git-main-estalenais-projects.vercel.app";
const LOGIN_PATH = "/login";
const OUTPUT_ROOT = ["output", "playwright", "post-deploy-validation"];
const WAIT_TIMEOUT = 120000;
const LOGIN_TIMEOUT = 45000;
const ROUTE_TIMEOUT = 45000;

const breakpoints = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "768", width: 768, height: 1024 },
  { name: "375", width: 375, height: 812 },
];

const routes = [
  {
    slug: "dashboard",
    path: "/dashboard",
    readySelector: ".dashboard-page",
    headingPattern: /dashboard/i,
  },
  {
    slug: "credits",
    path: "/credits",
    readySelector: ".credits-page",
    headingPattern: /cr[eé]ditos/i,
  },
  {
    slug: "creators",
    path: "/creators",
    readySelector: ".creators-page",
    headingPattern: /creators/i,
  },
];

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function buildTimestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function waitForLoad(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: WAIT_TIMEOUT });
  await page.waitForLoadState("networkidle", { timeout: WAIT_TIMEOUT }).catch(() => {});
}

async function resetScroll(page) {
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(250);
}

async function isVisible(locator, timeout = 1200) {
  try {
    return await locator.isVisible({ timeout });
  } catch {
    return false;
  }
}

async function saveJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function collectSnapshot(page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return {
    url: page.url(),
    title: await page.title().catch(() => ""),
    bodySnippet: bodyText.slice(0, 2400),
  };
}

function createError(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  return error;
}

async function waitForLoginUiReady(page) {
  const emailInput = page
    .locator('input[type="email"], input[name="email"], input[autocomplete="email"]')
    .first();
  const passwordInput = page
    .locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]')
    .first();
  const loginTab = page.getByRole("tab", { name: /^entrar$/i }).first();
  const submitButton = page
    .locator("form.auth-entry-card button.auth-entry-submit, form.auth-entry-card button[type='submit']")
    .first();

  await emailInput.waitFor({ state: "visible", timeout: LOGIN_TIMEOUT });
  await passwordInput.waitFor({ state: "visible", timeout: LOGIN_TIMEOUT });

  if (await isVisible(loginTab, 2000)) {
    const selected = await loginTab.getAttribute("aria-selected").catch(() => null);
    if (selected !== "true") {
      await loginTab.click();
      await page.waitForFunction(
        (element) => element?.getAttribute("aria-selected") === "true",
        loginTab,
        { timeout: 4000 },
      ).catch(() => {});
    }
  }

  if (await isVisible(submitButton, 2000)) {
    await submitButton.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  }

  await page.waitForTimeout(500);

  return {
    emailInput,
    passwordInput,
    loginTab,
    submitButton,
  };
}

async function waitForRouteReady(page, route) {
  await page.waitForURL(new RegExp(`${route.path}(?:[/?#]|$)`), {
    timeout: ROUTE_TIMEOUT,
  }).catch(() => {});

  const pageRoot = page.locator(route.readySelector).first();
  const pageHeading = page.getByRole("heading", { name: route.headingPattern }).first();
  const headingVisible = await isVisible(pageHeading, 3000);
  const rootVisible = await isVisible(pageRoot, 3000);

  if (!headingVisible && !rootVisible) {
    throw createError(`Route ${route.path} did not become ready after navigation.`, {
      currentUrl: page.url(),
      expectedPath: route.path,
      readySelector: route.readySelector,
    });
  }

  await waitForLoad(page);
  await resetScroll(page);
}

async function loginIfNeeded(page, { email, password, outDir }) {
  const dashboardUrl = `${BASE_URL}/dashboard`;

  await page.goto(dashboardUrl, {
    waitUntil: "domcontentloaded",
    timeout: WAIT_TIMEOUT,
  });

  await waitForLoad(page);
  await resetScroll(page);

  await page.screenshot({
    path: path.join(outDir, "00-entry.png"),
    fullPage: true,
  });

  if (page.url().includes("/dashboard")) {
    await waitForRouteReady(page, routes[0]);
    return {
      status: "already_authenticated",
      finalUrl: page.url(),
    };
  }

  const {
    emailInput,
    passwordInput,
    loginTab,
    submitButton,
  } = await waitForLoginUiReady(page);

  const emailVisible = await isVisible(emailInput, 4000);
  const passwordVisible = await isVisible(passwordInput, 4000);

  if (!emailVisible || !passwordVisible) {
    throw createError("Login form was not available after redirecting from the published app.", {
      currentUrl: page.url(),
      expectedPath: LOGIN_PATH,
    });
  }

  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.waitForTimeout(250);

  await page.screenshot({
    path: path.join(outDir, "01-login-ready.png"),
    fullPage: true,
  });

  if (await isVisible(submitButton, 2000)) {
    await submitButton.click({ delay: 50 });
  } else {
    await passwordInput.press("Enter");
  }

  const loginError = page
    .locator('[role="alert"], .error, .state-ea-error, [data-error], .text-red-500, .text-danger, .state-ea-title, .state-ea-text')
    .first();

  await Promise.race([
    page.waitForURL(/\/dashboard(?:[/?#]|$)/, { timeout: LOGIN_TIMEOUT }).catch(() => {}),
    loginError.waitFor({ state: "visible", timeout: LOGIN_TIMEOUT }).catch(() => {}),
    page.waitForTimeout(LOGIN_TIMEOUT),
  ]);

  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(outDir, "02-after-submit.png"),
    fullPage: true,
  });

  if (page.url().includes(LOGIN_PATH) || page.url().includes("/auth")) {
    const errorText = (await loginError.textContent().catch(() => ""))?.trim() || "";
    await page.screenshot({
      path: path.join(outDir, "03-login-error.png"),
      fullPage: true,
    });
    throw createError("Automatic login failed and the session remained on the login flow.", {
      currentUrl: page.url(),
      loginError: errorText || null,
      loginTabSelected: await loginTab.getAttribute("aria-selected").catch(() => null),
      emailValue: await emailInput.inputValue().catch(() => null),
    });
  }

  await waitForRouteReady(page, routes[0]);

  await page.screenshot({
    path: path.join(outDir, "03-after-login.png"),
    fullPage: true,
  });

  return {
    status: "logged_in",
    finalUrl: page.url(),
  };
}

async function captureRouteBreakpoint(page, route, breakpoint, rootOutDir) {
  const routeDir = path.join(rootOutDir, route.slug);
  await ensureDir(routeDir);

  await page.setViewportSize({
    width: breakpoint.width,
    height: breakpoint.height,
  });

  await page.goto(`${BASE_URL}${route.path}`, {
    waitUntil: "domcontentloaded",
    timeout: WAIT_TIMEOUT,
  });

  await waitForRouteReady(page, route);

  const baseName = `${route.slug}-${breakpoint.name}`;
  const viewportShot = path.join(routeDir, `${baseName}-viewport.png`);
  const fullPageShot = path.join(routeDir, `${baseName}-full.png`);

  await page.screenshot({ path: viewportShot });
  await page.screenshot({
    path: fullPageShot,
    fullPage: true,
  });

  return {
    route: route.path,
    slug: route.slug,
    breakpoint,
    files: {
      viewport: viewportShot,
      fullPage: fullPageShot,
    },
    snapshot: await collectSnapshot(page),
  };
}

if (hasFlag("--help")) {
  console.log(`Usage:
  node scripts/capture-postdeploy-validation.mjs [options]

Options:
  --base-url <url>    Published app URL (default: ${DEFAULT_BASE_URL})
  --email <email>     Login email
  --password <pass>   Login password
  --out-dir <dir>     Output directory
  --headed            Run with visible browser
  --help              Show this message

Environment alternatives:
  EAC_BASE_URL, EAC_EMAIL, EAC_PASSWORD
`);
  process.exit(0);
}

const BASE_URL = normalizeBaseUrl(
  getArg("--base-url") ?? process.env.EAC_BASE_URL ?? DEFAULT_BASE_URL,
);
const EMAIL = getArg("--email") ?? process.env.EAC_EMAIL;
const PASSWORD = getArg("--password") ?? process.env.EAC_PASSWORD;
const HEADED = hasFlag("--headed");
const timestamp = buildTimestamp();
const OUT_DIR =
  getArg("--out-dir") ??
  path.join(process.cwd(), ...OUTPUT_ROOT, timestamp);

if (!EMAIL || !PASSWORD) {
  console.error(
    "Missing credentials. Use --email/--password or set EAC_EMAIL/EAC_PASSWORD.",
  );
  process.exit(1);
}

await ensureDir(OUT_DIR);

const browser = await chromium.launch({
  headless: !HEADED,
});

const context = await browser.newContext({
  viewport: {
    width: breakpoints[0].width,
    height: breakpoints[0].height,
  },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: true,
});

const page = await context.newPage();
const consoleEvents = [];
const pageErrors = [];

page.on("console", (message) => {
  if (consoleEvents.length >= 120) {
    return;
  }
  consoleEvents.push({
    type: message.type(),
    text: message.text(),
  });
});

page.on("pageerror", (error) => {
  if (pageErrors.length >= 60) {
    return;
  }
  pageErrors.push(String(error));
});

try {
  const loginResult = await loginIfNeeded(page, {
    email: EMAIL,
    password: PASSWORD,
    outDir: OUT_DIR,
  });

  const captures = [];
  const generatedFiles = [
    path.join(OUT_DIR, "00-entry.png"),
    path.join(OUT_DIR, "01-login-ready.png"),
    path.join(OUT_DIR, "02-after-submit.png"),
    path.join(OUT_DIR, "03-after-login.png"),
  ];

  for (const route of routes) {
    for (const breakpoint of breakpoints) {
      const capture = await captureRouteBreakpoint(page, route, breakpoint, OUT_DIR);
      captures.push(capture);
      generatedFiles.push(capture.files.viewport, capture.files.fullPage);
    }
  }

  await saveJson(path.join(OUT_DIR, "summary.json"), {
    baseUrl: BASE_URL,
    timestamp,
    loginStatus: loginResult.status,
    loginResult,
    routes: routes.map(({ slug, path: routePath }) => ({ slug, path: routePath })),
    breakpoints,
    generatedFiles,
    captures,
    consoleEvents,
    pageErrors,
  });

  console.log(`Saved post-deploy validation captures to: ${OUT_DIR}`);
} catch (error) {
  const errorFile = path.join(OUT_DIR, "error.json");
  await saveJson(errorFile, {
    message: error instanceof Error ? error.message : String(error),
    details: error && typeof error === "object" ? error.details ?? null : null,
    baseUrl: BASE_URL,
    routes: routes.map(({ slug, path: routePath }) => ({ slug, path: routePath })),
    breakpoints,
    consoleEvents,
    pageErrors,
    currentUrl: page.url(),
  });

  console.error(`Post-deploy validation capture failed. See: ${errorFile}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}
