import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { attachMockApi, createMockApiState } from "./e2e/mockAppApi.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");
const creditsPagePath = path.join(webDir, "app", "credits", "page.tsx");
const globalsPath = path.join(webDir, "app", "globals.css");
const outputDir = path.join(rootDir, "output", "validation", "credits-composition");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const port = 4940 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;

if (!nextBin) throw new Error("next_bin_missing");

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-80)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 240) lines.splice(0, lines.length - 240);
    },
    dump() {
      return lines.join("\n");
    },
  };
}

async function waitForHttpReady(url, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for:${url}`);
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await delay(800);
  if (child.exitCode != null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

function seedMockState(state) {
  state.planCode = "EDITOR_PRO";
  state.wallet = {
    common: 1460,
    pro: 188,
    ultra: 42,
    updated_at: "2026-04-08T17:44:00.000Z",
  };
  state.transactions = [
    {
      id: "tx_credit_1",
      coin_type: "pro",
      amount: 120,
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: "pkg_001",
      created_at: "2026-04-08T16:18:00.000Z",
    },
    {
      id: "tx_debit_1",
      coin_type: "common",
      amount: -80,
      reason: "Consumo em creators",
      feature: "creator_post",
      ref_kind: "usage",
      ref_id: "use_204",
      created_at: "2026-04-08T14:52:00.000Z",
    },
    {
      id: "tx_convert_1",
      coin_type: "ultra",
      amount: 12,
      reason: "Conversão concluída",
      feature: "Conversão",
      ref_kind: "conversion",
      ref_id: "conv_118",
      created_at: "2026-04-08T13:04:00.000Z",
    },
    {
      id: "tx_debit_2",
      coin_type: "pro",
      amount: -24,
      reason: "Consumo em creators",
      feature: "creator_script",
      ref_kind: "usage",
      ref_id: "use_193",
      created_at: "2026-04-08T11:20:00.000Z",
    },
  ];
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 45000 });
  await page.getByLabel("E-mail").fill("qa@editorai.test");
  await page.getByLabel("Senha").fill("Test123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
  await page.waitForSelector(".dashboard-page", { timeout: 30000 });
}

function rectOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

function filterBlockingConsoleEvents(events) {
  return events.filter((event) => {
    const text = String(event.text || "");
    return !(text.includes("Download the React DevTools") || text.includes("[Fast Refresh]") || text.includes("Route changed"));
  });
}

async function captureCredits(page, width, height) {
  const routeDir = path.join(outputDir, "credits");
  fs.mkdirSync(routeDir, { recursive: true });

  const consoleEvents = [];
  const pageErrors = [];
  const failingResponses = [];

  const onConsole = (message) => consoleEvents.push({ type: message.type(), text: message.text() });
  const onPageError = (error) => pageErrors.push(String(error));
  const onResponse = (response) => {
    if (response.status() >= 500) failingResponses.push({ status: response.status(), url: response.url() });
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  try {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}/credits`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(".credits-page", { timeout: 30000 });
    await page.screenshot({
      path: path.join(routeDir, `credits-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });

    const supplementalScreenshots = [];
    if (width === 1440) {
      await page.locator(".credits-operations-region").scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      const operationsPath = path.join(routeDir, "credits-operations-1440.png");
      await page.screenshot({ path: operationsPath, fullPage: true, animations: "disabled" });
      supplementalScreenshots.push(path.relative(rootDir, operationsPath).replaceAll("\\", "/"));

      await page.locator("#credits-history").scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      const historyPath = path.join(routeDir, "credits-history-1440.png");
      await page.screenshot({ path: historyPath, fullPage: true, animations: "disabled" });
      supplementalScreenshots.push(path.relative(rootDir, historyPath).replaceAll("\\", "/"));
    }

    const metrics = await page.evaluate(({ viewportWidth }) => {
      function collect(selector) {
        return Array.from(document.querySelectorAll(selector)).map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2)),
            top: Number(rect.top.toFixed(2)),
            left: Number(rect.left.toFixed(2)),
            right: Number(rect.right.toFixed(2)),
            bottom: Number(rect.bottom.toFixed(2)),
          };
        });
      }

      function summarize(selector) {
        const rects = collect(selector);
        if (rects.length === 0) return { count: 0, rects: [] };
        const heights = rects.map((item) => item.height);
        const widths = rects.map((item) => item.width);
        return {
          count: rects.length,
          rects,
          minHeight: Math.min(...heights),
          maxHeight: Math.max(...heights),
          heightSpread: Number((Math.max(...heights) - Math.min(...heights)).toFixed(2)),
          minWidth: Math.min(...widths),
          maxWidth: Math.max(...widths),
        };
      }

      const mainRect = document.querySelector(".credits-main-region")?.getBoundingClientRect() || null;
      const railRect = document.querySelector(".credits-support-rail")?.getBoundingClientRect() || null;

      return {
        viewportWidth,
        headings: Array.from(document.querySelectorAll(".credits-page h1, .credits-page h2, .credits-page h3"))
          .map((node) => node.textContent?.trim())
          .filter(Boolean),
        layout: {
          mainWidth: mainRect ? Number(mainRect.width.toFixed(2)) : 0,
          railWidth: railRect ? Number(railRect.width.toFixed(2)) : 0,
          mainTop: mainRect ? Number(mainRect.top.toFixed(2)) : 0,
          mainBottom: mainRect ? Number(mainRect.bottom.toFixed(2)) : 0,
          railTop: railRect ? Number(railRect.top.toFixed(2)) : 0,
          railBottom: railRect ? Number(railRect.bottom.toFixed(2)) : 0,
          dominanceRatio: mainRect && railRect && railRect.width > 0 ? Number((mainRect.width / railRect.width).toFixed(2)) : 1,
        },
        groups: {
          summaryCards: summarize(".credits-summary-grid > .credits-summary-card"),
          operations: summarize(".credits-operations-grid > *"),
          railPanels: summarize(".credits-support-rail > *"),
          ledgerSummary: summarize(".credits-ledger-summary > *"),
          historyEntries: summarize(".credits-history-list > .credits-history-item"),
        },
      };
    }, { viewportWidth: width });

    const overlapWarnings = [];
    for (const [groupName, groupMetrics] of Object.entries(metrics.groups)) {
      if (!groupMetrics?.rects || groupMetrics.rects.length < 2) continue;
      for (let index = 0; index < groupMetrics.rects.length; index += 1) {
        for (let compareIndex = index + 1; compareIndex < groupMetrics.rects.length; compareIndex += 1) {
          if (rectOverlap(groupMetrics.rects[index], groupMetrics.rects[compareIndex])) {
            overlapWarnings.push({ groupName, index, compareIndex });
          }
        }
      }
    }

    const blockingConsoleEvents = filterBlockingConsoleEvents(consoleEvents);
    return {
      width,
      height,
      consoleEvents,
      blockingConsoleEvents,
      pageErrors,
      failingResponses,
      overlapWarnings,
      metrics,
      screenshot: path.relative(rootDir, path.join(routeDir, `credits-${width}.png`)).replaceAll("\\", "/"),
      supplementalScreenshots,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const pageSource = fs.readFileSync(creditsPagePath, "utf8");
const css = fs.readFileSync(globalsPath, "utf8");
const sourceChecks = {
  operationsRegionMarkup: pageSource.includes('className="credits-main-section credits-operations-region"'),
  operationsGridMarkup: pageSource.includes('className="credits-operations-grid"'),
  historyInMainMarkup: pageSource.includes('className="credits-main-section credits-history-region"'),
  supportOverviewMarkup: pageSource.includes("credits-support-overview"),
  operationsGridCss: css.includes(".credits-page .credits-operations-grid"),
  railQuietingCss: css.includes(".credits-page .credits-support-overview"),
  continuousLedgerCss: css.includes(".credits-page .credits-ledger-summary") && css.includes(".credits-page .credits-history-list"),
};

const webStdout = createLogBuffer("[web] ");
const webStderr = createLogBuffer("[web:err] ");
const webServer = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: webDir,
  env: { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_E2E_AUTH_MODE: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

webServer.stdout.on("data", (chunk) => webStdout.push(chunk));
webServer.stderr.on("data", (chunk) => webStderr.push(chunk));

let browser;

try {
  await waitForHttpReady(`${baseUrl}/login`);
  const state = createMockApiState();
  seedMockState(state);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await attachMockApi(context, state);
  await context.addInitScript((modeKey) => {
    window.localStorage.setItem(modeKey, "1");
  }, E2E_AUTH_MODE_KEY);

  const page = await context.newPage();
  await login(page);

  const captures = [];
  for (const viewport of [
    { width: 1440, height: 1200 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    captures.push(await captureCredits(page, viewport.width, viewport.height));
  }

  const blockingConsoleEventCount = captures.reduce((sum, capture) => sum + capture.blockingConsoleEvents.length, 0);
  const overlapCount = captures.reduce((sum, capture) => sum + capture.overlapWarnings.length, 0);
  const structuralWarnings = captures.flatMap((capture) => {
    const warnings = [];
    const layout = capture.metrics.layout;

    if (capture.width <= 768 && layout.railTop < layout.mainBottom - 12) {
      warnings.push({
        width: capture.width,
        issue: "rail_not_stacked_after_main",
        layout,
      });
    }

    if (capture.width <= 480 && layout.mainWidth < 280) {
      warnings.push({
        width: capture.width,
        issue: "main_column_too_narrow",
        layout,
      });
    }

    return warnings;
  });
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    authMode: "e2e_mock",
    sourceChecks,
    captures,
    blockingConsoleEventCount,
    overlapCount,
    structuralWarnings,
    pageErrors: captures.flatMap((capture) => capture.pageErrors),
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      blockingConsoleEventCount === 0 &&
      overlapCount === 0 &&
      structuralWarnings.length === 0 &&
      captures.every((capture) => capture.pageErrors.length === 0),
  };

  fs.writeFileSync(path.join(outputDir, "credits-composition-report.json"), JSON.stringify(report, null, 2));
  if (!report.passed) throw new Error("credits_composition_validation_failed");
  console.log(`Credits composition validation OK. Report: ${path.join(outputDir, "credits-composition-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    webStdout: webStdout.dump(),
    webStderr: webStderr.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "credits-composition-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(webServer);
}
