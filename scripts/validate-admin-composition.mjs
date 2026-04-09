import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");
const apiDir = path.join(rootDir, "apps", "api");
const adminPagePath = path.join(webDir, "app", "admin", "page.tsx");
const globalsPath = path.join(webDir, "app", "globals.css");
const outputDir = path.join(rootDir, "output", "validation", "admin-composition");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const apiPort = 5360 + Math.floor(Math.random() * 120);
const webPort = 5480 + Math.floor(Math.random() * 120);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const adminEmail = "Desenvolvedordeappsai@gmail.com";
const adminPassword = "@Editorai2025";

if (!nextBin) throw new Error("next_bin_missing");

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-120)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 360) lines.splice(0, lines.length - 360);
    },
    dump() {
      return lines.join("\n");
    },
  };
}

async function waitForHttpReady(url, timeoutMs = 60000) {
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

function rectOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

function filterBlockingConsoleEvents(events) {
  return events.filter((event) => {
    const text = String(event.text || "");
    return !(
      text.includes("Download the React DevTools") ||
      text.includes("[Fast Refresh]") ||
      text.includes("Route changed")
    );
  });
}

async function login(page) {
  await page.goto(`${webBaseUrl}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByLabel("E-mail").fill(adminEmail);
  await page.getByLabel("Senha").fill(adminPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 45000 });
  await page.waitForSelector(".dashboard-page", { timeout: 45000 });
}

async function waitForAdminSettled(page) {
  await page.waitForTimeout(1200);
  try {
    await page.waitForFunction(() => {
      const text = document.body.textContent || "";
      return (
        !text.includes("Sincronizando sinais operacionais...") &&
        !text.includes("Carregando solicitações...") &&
        !text.includes("Atualizando fila...")
      );
    }, { timeout: 15000 });
  } catch {}
  await page.waitForTimeout(450);
}

async function captureAdmin(page, width, height) {
  const routeDir = path.join(outputDir, "admin");
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
    await page.goto(`${webBaseUrl}/admin`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector(".admin-page", { timeout: 45000 });
    await waitForAdminSettled(page);
    await page.screenshot({
      path: path.join(routeDir, `admin-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });

    const supplementalScreenshots = [];
    if (width === 1440) {
      await page.locator(".admin-control-region").scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      const controlPath = path.join(routeDir, "admin-control-1440.png");
      await page.screenshot({ path: controlPath, fullPage: true, animations: "disabled" });
      supplementalScreenshots.push(path.relative(rootDir, controlPath).replaceAll("\\", "/"));

      await page.locator(".admin-queue-region").scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      const queuePath = path.join(routeDir, "admin-queues-1440.png");
      await page.screenshot({ path: queuePath, fullPage: true, animations: "disabled" });
      supplementalScreenshots.push(path.relative(rootDir, queuePath).replaceAll("\\", "/"));
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

      const mainRect = document.querySelector(".admin-workspace-main")?.getBoundingClientRect() || null;
      const railRect = document.querySelector(".admin-workspace-rail")?.getBoundingClientRect() || null;

      return {
        viewportWidth,
        headings: Array.from(document.querySelectorAll(".admin-page h1, .admin-page h2, .admin-page h3, .admin-page h4"))
          .map((node) => node.textContent?.trim())
          .filter(Boolean),
        layout: {
          mainWidth: mainRect ? Number(mainRect.width.toFixed(2)) : 0,
          railWidth: railRect ? Number(railRect.width.toFixed(2)) : 0,
          mainTop: mainRect ? Number(mainRect.top.toFixed(2)) : 0,
          mainBottom: mainRect ? Number(mainRect.bottom.toFixed(2)) : 0,
          railTop: railRect ? Number(railRect.top.toFixed(2)) : 0,
          railBottom: railRect ? Number(railRect.bottom.toFixed(2)) : 0,
          dominanceRatio:
            mainRect && railRect && railRect.width > 0
              ? Number((mainRect.width / railRect.width).toFixed(2))
              : 1,
        },
        groups: {
          overview: summarize(".admin-overview-strip > .admin-overview-item"),
          observability: summarize(".admin-observability-grid > .admin-subpanel-stat"),
          observabilityDetail: summarize(".admin-observability-detail-grid > .admin-subpanel"),
          attention: summarize(".admin-attention-grid > .admin-attention-item"),
          radar: summarize(".admin-radar-grid > .admin-subpanel-stat"),
          queues: summarize(".admin-queue-grid > .admin-queue-surface"),
          searchResults: summarize(".admin-search-results > .admin-search-result"),
          timeline: summarize(".admin-timeline-list > .admin-timeline-item"),
          records: summarize(".admin-record-list > .admin-record-item"),
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
      screenshot: path.relative(rootDir, path.join(routeDir, `admin-${width}.png`)).replaceAll("\\", "/"),
      supplementalScreenshots,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const pageSource = fs.readFileSync(adminPagePath, "utf8");
const css = fs.readFileSync(globalsPath, "utf8");
const sourceChecks = {
  workspaceGridMarkup: pageSource.includes('className="admin-workspace-grid"'),
  workspaceMainMarkup: pageSource.includes('className="admin-workspace-main"'),
  workspaceRailMarkup: pageSource.includes('className="admin-workspace-rail"'),
  controlRegionMarkup: pageSource.includes('className="premium-card admin-console-section admin-control-region"'),
  userOpsRegionMarkup: pageSource.includes('className="premium-card admin-console-section admin-user-ops-region"'),
  queueRegionMarkup: pageSource.includes('className="premium-card admin-console-section admin-queue-region"'),
  attentionRegionMarkup: pageSource.includes('className="premium-card admin-console-section admin-attention-region"'),
  radarRegionMarkup: pageSource.includes('className="premium-card admin-console-section admin-radar-region"'),
  workspaceGridCss: css.includes(".admin-workspace-grid"),
  controlBodyCss: css.includes(".admin-control-body"),
  queueGridCss: css.includes(".admin-queue-grid"),
  quietRailCss: css.includes(".admin-attention-region .admin-attention-grid") && css.includes(".admin-radar-region .admin-radar-grid"),
};

const apiStdout = createLogBuffer("[api] ");
const apiStderr = createLogBuffer("[api:err] ");
const webStdout = createLogBuffer("[web] ");
const webStderr = createLogBuffer("[web:err] ");

const apiServer = spawn(process.execPath, ["start.js"], {
  cwd: apiDir,
  env: {
    ...process.env,
    PORT: String(apiPort),
    APP_BASE_URL: webBaseUrl,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

apiServer.stdout.on("data", (chunk) => apiStdout.push(chunk));
apiServer.stderr.on("data", (chunk) => apiStderr.push(chunk));

const webServer = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(webPort)], {
  cwd: webDir,
  env: {
    ...process.env,
    NODE_ENV: "development",
    NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

webServer.stdout.on("data", (chunk) => webStdout.push(chunk));
webServer.stderr.on("data", (chunk) => webStderr.push(chunk));

let browser;

try {
  await waitForHttpReady(`${apiBaseUrl}/health/ready`);
  await waitForHttpReady(`${webBaseUrl}/login`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page);

  const captures = [];
  for (const viewport of [
    { width: 1440, height: 1200 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    captures.push(await captureAdmin(page, viewport.width, viewport.height));
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

    if (capture.width <= 480 && layout.mainWidth < 300) {
      warnings.push({ width: capture.width, issue: "main_column_too_narrow", layout });
    }

    return warnings;
  });

  const report = {
    createdAt: new Date().toISOString(),
    webBaseUrl,
    apiBaseUrl,
    authMode: "real_admin",
    account: adminEmail,
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

  fs.writeFileSync(path.join(outputDir, "admin-composition-report.json"), JSON.stringify(report, null, 2));
  if (!report.passed) throw new Error("admin_composition_validation_failed");
  console.log(`Admin composition validation OK. Report: ${path.join(outputDir, "admin-composition-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    apiStdout: apiStdout.dump(),
    apiStderr: apiStderr.dump(),
    webStdout: webStdout.dump(),
    webStderr: webStderr.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "admin-composition-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(webServer);
  await stopChild(apiServer);
}
