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
const supportPagePath = path.join(webDir, "app", "support", "page.tsx");
const assistantPath = path.join(webDir, "components", "dashboard", "SupportAssistantCard.tsx");
const opsPath = path.join(webDir, "components", "support", "SupportOperationsPanel.tsx");
const globalsPath = path.join(webDir, "app", "globals.css");
const outputDir = path.join(rootDir, "output", "validation", "support-composition");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const port = 5060 + Math.floor(Math.random() * 120);
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
  state.supportRequests = [
    {
      id: "support_1",
      category: "problema_tecnico",
      subject: "Publish ficou em reconciliação",
      message: "O projeto já subiu, mas a tela continuou com status antigo.",
      status: "in_review",
      admin_note: "Equipe validando retorno do provider e o histórico do deploy.",
      created_at: "2026-04-08T16:20:00.000Z",
    },
    {
      id: "support_2",
      category: "pedido_financeiro",
      subject: "Checkout retornou e o saldo não atualizou",
      message: "A compra concluiu no checkout, mas o ledger ainda não mostrou o crédito esperado.",
      status: "resolved",
      admin_note: "Saldo conciliado e ledger confirmado.",
      created_at: "2026-04-08T13:05:00.000Z",
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

async function captureSupport(page, width, height) {
  const routeDir = path.join(outputDir, "support");
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
    await page.goto(`${baseUrl}/support`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(".support-page", { timeout: 30000 });
    await page.screenshot({
      path: path.join(routeDir, `support-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });

    const supplementalScreenshots = [];
    if (width === 1440) {
      await page.locator(".support-assistant-card").scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      const assistantShot = path.join(routeDir, "support-assistant-1440.png");
      await page.screenshot({ path: assistantShot, fullPage: true, animations: "disabled" });
      supplementalScreenshots.push(path.relative(rootDir, assistantShot).replaceAll("\\", "/"));

      await page.locator(".support-reference-section").scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      const referenceShot = path.join(routeDir, "support-reference-1440.png");
      await page.screenshot({ path: referenceShot, fullPage: true, animations: "disabled" });
      supplementalScreenshots.push(path.relative(rootDir, referenceShot).replaceAll("\\", "/"));
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

      const mainRect = document.querySelector(".support-workspace-main")?.getBoundingClientRect() || null;
      const railRect = document.querySelector(".support-workspace-rail")?.getBoundingClientRect() || null;

      return {
        viewportWidth,
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
          guideCards: summarize(".support-guide-grid > .support-guide-card"),
          faqItems: summarize(".support-faq-list > .support-faq-item"),
          historyItems: summarize(".support-history-list > .support-history-item"),
          railPanels: summarize(".support-workspace-rail > *"),
          opsSecondary: summarize(".support-ops-stack > .support-ops-card"),
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
      screenshot: path.relative(rootDir, path.join(routeDir, `support-${width}.png`)).replaceAll("\\", "/"),
      supplementalScreenshots,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const pageSource = fs.readFileSync(supportPagePath, "utf8");
const assistantSource = fs.readFileSync(assistantPath, "utf8");
const opsSource = fs.readFileSync(opsPath, "utf8");
const css = fs.readFileSync(globalsPath, "utf8");
const sourceChecks = {
  workspaceGridMarkup: pageSource.includes('className="support-workspace-grid"'),
  workspaceRailMarkup: pageSource.includes('className="support-workspace-rail"'),
  referenceSectionMarkup: pageSource.includes('className="support-reference-section"'),
  faqListMarkup: pageSource.includes('className="support-faq-list"'),
  assistantNoPreviewWhenFocused: assistantSource.includes("{!focused && preview ?"),
  opsLayoutMarkup: opsSource.includes('className="support-ops-layout"') && opsSource.includes('className="support-ops-stack"'),
  workspaceGridCss: css.includes(".support-workspace-grid"),
  referenceSectionCss: css.includes(".support-page .support-reference-section"),
  continuousHistoryCss: css.includes(".support-page .support-history-list"),
  opsLayoutCss: css.includes(".support-page .support-ops-layout"),
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
    captures.push(await captureSupport(page, viewport.width, viewport.height));
  }

  const blockingConsoleEventCount = captures.reduce((sum, capture) => sum + capture.blockingConsoleEvents.length, 0);
  const overlapCount = captures.reduce((sum, capture) => sum + capture.overlapWarnings.length, 0);
  const structuralWarnings = captures.flatMap((capture) => {
    const warnings = [];
    const layout = capture.metrics.layout;

    if (capture.width > 1100 && layout.dominanceRatio < 1.45) {
      warnings.push({ width: capture.width, issue: "main_not_dominant_enough", layout });
    }

    if (capture.width <= 768 && layout.railTop < layout.mainBottom - 12) {
      warnings.push({ width: capture.width, issue: "rail_not_stacked_after_main", layout });
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

  fs.writeFileSync(path.join(outputDir, "support-composition-report.json"), JSON.stringify(report, null, 2));
  if (!report.passed) throw new Error("support_composition_validation_failed");
  console.log(`Support composition validation OK. Report: ${path.join(outputDir, "support-composition-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    webStdout: webStdout.dump(),
    webStderr: webStderr.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "support-composition-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(webServer);
}
