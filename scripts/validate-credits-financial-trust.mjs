import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { attachMockApi, createMockApiState } from "./e2e/mockAppApi.mjs";

const APP_PORT = Number(process.env.E2E_WEB_PORT || 3500 + Math.floor(Math.random() * 200));
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), "output", "validation", "credits-financial-trust");
const REPORT_PATH = path.join(OUTPUT_DIR, "credits-financial-trust-report.json");
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const E2E_DIST_DIR = ".next-credits-financial-trust";
const creditsPagePath = path.join(process.cwd(), "apps", "web", "app", "credits", "page.tsx");
const creditsCardPath = path.join(process.cwd(), "apps", "web", "components", "dashboard", "CreditsPackagesCard.tsx");

function resolveBrowserExecutable() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return candidates[0];
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function startWebServer() {
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/c", "pnpm", "-C", "apps/web", "exec", "next", "dev", "--turbo", "-p", String(APP_PORT)], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NEXT_PUBLIC_E2E_AUTH_MODE: "1",
            NEXT_DIST_DIR: E2E_DIST_DIR,
          },
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn("pnpm", ["-C", "apps/web", "exec", "next", "dev", "--turbo", "-p", String(APP_PORT)], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NEXT_PUBLIC_E2E_AUTH_MODE: "1",
            NEXT_DIST_DIR: E2E_DIST_DIR,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });

  const stdout = [];
  const stderr = [];
  child.stdout?.on("data", (chunk) => stdout.push(String(chunk)));
  child.stderr?.on("data", (chunk) => stderr.push(String(chunk)));

  return {
    child,
    logs() {
      return {
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      };
    },
  };
}

async function stopWebServer(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        cwd: process.cwd(),
        shell: true,
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }
  await new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => resolve(), 5000);
  });
}

async function waitForServer(url, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timeout_waiting_for_server:${url}`);
}

async function createContext(browser, state) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await attachMockApi(context, state);
  await context.addInitScript((modeKey) => {
    window.localStorage.setItem(modeKey, "1");
  }, E2E_AUTH_MODE_KEY);
  const page = await context.newPage();
  return { context, page };
}

async function login(page, email = "qa@editorai.test") {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Test123!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard", { timeout: 90000 });
  await page.waitForLoadState("networkidle");
}

async function saveCapture(page, name) {
  const capturePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: capturePath, fullPage: true, animations: "disabled" });
  return capturePath;
}

async function runScenario(page, width, height) {
  const consoleEvents = [];
  const pageErrors = [];
  const failedResponses = [];

  const onConsole = (message) => {
    consoleEvents.push({ type: message.type(), text: message.text() });
  };
  const onPageError = (error) => {
    pageErrors.push(String(error));
  };
  const onResponse = (response) => {
    const url = response.url();
    if (url.endsWith("/favicon.ico")) return;
    if (response.status() >= 400) {
      failedResponses.push({ url: response.url(), status: response.status() });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  try {
    await page.setViewportSize({ width, height });
    const creditsLink = page.locator('a[href="/credits"]').first();
    await creditsLink.click();
    await page.waitForURL("**/credits", { timeout: 90000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);

    const currentUrl = page.url();
    const bodyText = await page.locator("body").innerText();
    const historyItemCount = await page.locator(".credits-history-item").count();
    const proofChipCount = await page.locator(".credits-history-proof-chip").count();
    const financialStateCount = await page.locator(".credits-financial-state").count();

    const screenshot = await saveCapture(page, `credits-${width}`);
    await fs.writeFile(path.join(OUTPUT_DIR, `credits-${width}.txt`), bodyText, "utf8");

    return {
      viewport: { width, height },
      currentUrl,
      screenshot,
      historyItemCount,
      proofChipCount,
      financialStateCount,
      bodyChecks: {
        receiptAndReconciliation: bodyText.includes("Recibo e conciliação"),
        pendingVisible: bodyText.includes("Pending"),
        settledVisible: bodyText.includes("Settled") || bodyText.includes("Reconciled"),
        refundedVisible: bodyText.includes("Refunded"),
        disputedVisible: bodyText.includes("Disputed"),
        failedVisible: bodyText.includes("Failed"),
        supportReferenceVisible: bodyText.includes("Suporte"),
        proofVisible: bodyText.includes("Processamento") && bodyText.includes("Recibo"),
      },
      blockingConsoleEvents: consoleEvents.filter((event) => event.type === "error"),
      pageErrors,
      failedResponses,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

async function main() {
  await ensureOutputDir();

  const pageSource = await fs.readFile(creditsPagePath, "utf8");
  const cardSource = await fs.readFile(creditsCardPath, "utf8");
  const sourceChecks = {
    creditsFinancialStateLayer:
      pageSource.includes("Recibo e conciliação") &&
      pageSource.includes("Provas rastreáveis") &&
      pageSource.includes("credits-history-proof-chip") &&
      pageSource.includes("credits-financial-state"),
    creditsOperationalConfidence:
      pageSource.includes("Processamento") &&
      pageSource.includes("Suporte") &&
      pageSource.includes("Extrato recente"),
    creditsPurchaseReceipt:
      cardSource.includes("Recibo antes do pagamento") &&
      cardSource.includes("Pagamento via Stripe"),
  };

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveBrowserExecutable(),
  });

  const state = createMockApiState();
  const server = startWebServer();

  try {
    await waitForServer(`${BASE_URL}/login`);

    const captures = [];
    for (const viewport of [
      { width: 1440, height: 1024 },
      { width: 768, height: 1024 },
      { width: 375, height: 812 },
    ]) {
      const { context, page } = await createContext(browser, state);
      await login(page);
      captures.push(await runScenario(page, viewport.width, viewport.height));
      await context.close();
    }

    const report = {
      createdAt: new Date().toISOString(),
      sourceChecks,
      captures,
      passed:
        Object.values(sourceChecks).every(Boolean) &&
        captures.every(
          (capture) =>
            Object.values(capture.bodyChecks).every(Boolean) &&
            capture.historyItemCount >= 4 &&
            capture.proofChipCount >= 8 &&
            capture.financialStateCount >= 4 &&
            capture.blockingConsoleEvents.length === 0 &&
            capture.pageErrors.length === 0 &&
            capture.failedResponses.length === 0
        ),
    };

    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
    assert.equal(report.passed, true, `credits_financial_trust_validation_failed: ${REPORT_PATH}`);
  } catch (error) {
    const errorPayload = {
      error: String(error),
      logs: server.logs(),
    };
    await fs.writeFile(
      path.join(OUTPUT_DIR, "credits-financial-trust-error.json"),
      JSON.stringify(errorPayload, null, 2)
    );
    throw error;
  } finally {
    await browser.close().catch(() => {});
    await stopWebServer(server.child);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
