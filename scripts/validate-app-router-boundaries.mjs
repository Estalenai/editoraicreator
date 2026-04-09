import assert from "node:assert/strict";
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
const buildDir = path.join(webDir, ".next");
const outputDir = path.join(rootDir, "output", "validation", "app-router-boundaries");
const port = 3840 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;

if (!fs.existsSync(buildDir)) throw new Error("web_build_missing");

fs.mkdirSync(outputDir, { recursive: true });

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-80)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 220) lines.splice(0, lines.length - 220);
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
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for:${url}`);
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await delay(1000);
  if (child.exitCode != null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

function filterBlockingConsoleEvents(events) {
  return events.filter((event) => {
    const text = String(event.text || "");
    return (
      !text.includes("Download the React DevTools") &&
      text !== "Failed to load resource: the server responded with a status of 404 (Not Found)" &&
      !text.startsWith("Error: An error occurred in the Server Components render.")
    );
  });
}

const sourceChecks = {
  rootLoadingExists: fs.existsSync(path.join(webDir, "app", "loading.tsx")),
  rootErrorExists: fs.existsSync(path.join(webDir, "app", "error.tsx")),
  globalErrorExists: fs.existsSync(path.join(webDir, "app", "global-error.tsx")),
  rootNotFoundExists: fs.existsSync(path.join(webDir, "app", "not-found.tsx")),
  authLoadingExists: fs.existsSync(path.join(webDir, "app", "(auth)", "loading.tsx")),
  authErrorExists: fs.existsSync(path.join(webDir, "app", "(auth)", "error.tsx")),
  editorLoadingExists: fs.existsSync(path.join(webDir, "app", "editor", "[id]", "loading.tsx")),
  editorErrorExists: fs.existsSync(path.join(webDir, "app", "editor", "[id]", "error.tsx")),
  boundaryIndexExists: fs.existsSync(path.join(webDir, "app", "boundary-proof", "page.tsx")),
  boundarySegmentLoadingExists: fs.existsSync(path.join(webDir, "app", "boundary-proof", "loading.tsx")),
  boundarySegmentErrorExists: fs.existsSync(path.join(webDir, "app", "boundary-proof", "error.tsx")),
  loadingProbeExists: fs.existsSync(path.join(webDir, "app", "boundary-proof", "loading", "page.tsx")),
  errorProbeExists: fs.existsSync(path.join(webDir, "app", "boundary-proof", "error", "page.tsx")),
};

const stdoutLogs = createLogBuffer("[web] ");
const stderrLogs = createLogBuffer("[web:err] ");
const server =
  process.platform === "win32"
    ? spawn("cmd.exe", ["/c", "pnpm", "-C", "apps/web", "exec", "next", "start", "-p", String(port)], {
        cwd: rootDir,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn("pnpm", ["-C", "apps/web", "exec", "next", "start", "-p", String(port)], {
        cwd: rootDir,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: ["ignore", "pipe", "pipe"],
      });

server.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
server.stderr.on("data", (chunk) => stderrLogs.push(chunk));

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  sourceChecks,
  checks: [],
  captures: [],
  blockingConsoleEvents: [],
  pageErrors: [],
  passed: false,
};

let browser;

try {
  await waitForHttpReady(`${baseUrl}/`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  page.on("console", (message) => {
    report.blockingConsoleEvents.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    report.pageErrors.push(String(error));
  });

  await page.goto(`${baseUrl}/boundary-proof`, { waitUntil: "networkidle", timeout: 45000 });
  const loadingNav = page.getByRole("link", { name: "Abrir loading probe" }).click();
  await page.waitForSelector("text=Boundary loading active.", { timeout: 15000 });
  const loadingVisible = await page.locator("text=Boundary loading active.").isVisible();
  const loadingShot = path.join(outputDir, "loading-boundary-1440.png");
  await page.screenshot({ path: loadingShot, fullPage: true });
  await loadingNav;
  await page.waitForSelector("text=Boundary loading probe ready.", { timeout: 15000 });
  const loadingReadyShot = path.join(outputDir, "loading-probe-ready-1440.png");
  await page.screenshot({ path: loadingReadyShot, fullPage: true });

  report.checks.push({
    name: "root_loading_boundary_renders_before_probe",
    loadingVisible,
    finalReady: await page.locator("text=Boundary loading probe ready.").isVisible(),
  });
  report.captures.push(path.relative(rootDir, loadingShot).replaceAll("\\", "/"));
  report.captures.push(path.relative(rootDir, loadingReadyShot).replaceAll("\\", "/"));
  assert.equal(loadingVisible, true);
  assert.equal(await page.locator("text=Boundary loading probe ready.").isVisible(), true);

  await page.goto(`${baseUrl}/boundary-proof/error`, { waitUntil: "networkidle", timeout: 45000 });
  const errorUrl = page.url();
  const retryButtonVisible = await page.locator("text=Tentar novamente").isVisible();
  const errorBodyText = await page.locator("body").innerText();
  const errorShot = path.join(outputDir, "error-boundary-1440.png");
  await page.screenshot({ path: errorShot, fullPage: true });
  report.checks.push({
    name: "root_error_boundary_handles_probe",
    url: errorUrl,
    retryButtonVisible,
    bodyIncludesBoundaryCopy:
      errorBodyText.includes("Esta rota saiu do trilho") ||
      errorBodyText.includes("Boundary error active.") ||
      errorBodyText.includes("A navegação falhou antes de concluir a etapa com segurança."),
  });
  report.captures.push(path.relative(rootDir, errorShot).replaceAll("\\", "/"));
  assert.match(errorUrl, /\/boundary-proof\/error$/);
  assert.equal(retryButtonVisible, true);
  assert.equal(
    errorBodyText.includes("Esta rota saiu do trilho") ||
      errorBodyText.includes("Boundary error active.") ||
      errorBodyText.includes("A navegação falhou antes de concluir a etapa com segurança."),
    true
  );

  await page.goto(`${baseUrl}/__codex_missing_route__`, { waitUntil: "networkidle", timeout: 45000 });
  const notFoundTitle = await page.locator("h1").first().textContent();
  const notFoundShot = path.join(outputDir, "not-found-boundary-1440.png");
  await page.screenshot({ path: notFoundShot, fullPage: true });
  report.checks.push({
    name: "root_not_found_boundary_handles_missing_route",
    title: String(notFoundTitle || "").trim(),
    dashboardActionVisible: await page.locator("text=Ir para o dashboard").isVisible(),
  });
  report.captures.push(path.relative(rootDir, notFoundShot).replaceAll("\\", "/"));
  assert.equal(String(notFoundTitle || "").trim(), "Esta etapa não existe ou saiu do fluxo atual");
  assert.equal(await page.locator("text=Ir para o dashboard").isVisible(), true);

  await context.close();
  await browser.close();
  browser = null;

  report.blockingConsoleEvents = filterBlockingConsoleEvents(report.blockingConsoleEvents);
  assert.ok(Object.values(sourceChecks).every(Boolean));
  assert.equal(report.blockingConsoleEvents.length, 0);
  assert.equal(report.pageErrors.length, 0);
  report.passed = true;
} catch (error) {
  report.error = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outputDir, "app-router-boundaries-report.json"), JSON.stringify(report, null, 2));
  if (stdoutLogs.dump() || stderrLogs.dump()) {
    fs.writeFileSync(
      path.join(outputDir, "app-router-boundaries-server.log"),
      [stdoutLogs.dump(), stderrLogs.dump()].filter(Boolean).join("\n"),
      "utf8"
    );
  }
  if (browser) await browser.close();
  await stopChild(server);
  process.exit(process.exitCode || 0);
}
