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
const apiDir = path.join(rootDir, "apps", "api");
const outputDir = path.join(rootDir, "output", "validation", "observability-hardening");
const buildDir = path.join(webDir, ".next");
const apiPort = 4050 + Math.floor(Math.random() * 120);
const webPort = 4190 + Math.floor(Math.random() * 120);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;

fs.mkdirSync(outputDir, { recursive: true });

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-120)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 320) lines.splice(0, lines.length - 320);
    },
    dump() {
      return lines.join("\n");
    },
    contains(pattern) {
      return this.dump().includes(pattern);
    },
  };
}

function spawnCommand(command, args, options) {
  if (process.platform === "win32") {
    return spawn("cmd.exe", ["/c", command, ...args], options);
  }

  return spawn(command, args, options);
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

function writeLogFile(filename, buffers) {
  const content = buffers.map((buffer) => buffer.dump()).filter(Boolean).join("\n");
  if (content) {
    fs.writeFileSync(path.join(outputDir, filename), content, "utf8");
  }
}

function hasFile(filePath) {
  return fs.existsSync(filePath);
}

const sourceChecks = {
  apiRequestContextExists: hasFile(path.join(apiDir, "src", "middlewares", "requestContext.js")),
  apiErrorHandlerLogsFailures: /logger\.error\("request_failed"/.test(
    fs.readFileSync(path.join(apiDir, "src", "middlewares", "errorHandler.js"), "utf8")
  ),
  serverMountsRequestContext: /app\.use\(requestContext\)/.test(
    fs.readFileSync(path.join(apiDir, "server.js"), "utf8")
  ),
  frontendErrorRouteExists: hasFile(
    path.join(webDir, "app", "api", "observability", "frontend-error", "route.ts")
  ),
  frontendErrorBridgeExists: hasFile(
    path.join(webDir, "components", "observability", "FrontendErrorBridge.tsx")
  ),
  layoutMountsFrontendErrorBridge: /<FrontendErrorBridge \/>/.test(
    fs.readFileSync(path.join(webDir, "app", "layout.tsx"), "utf8")
  ),
  apiSetsRequestIdHeader: /headers\.set\("X-Request-Id"/.test(
    fs.readFileSync(path.join(webDir, "lib", "api.ts"), "utf8")
  ),
  apiReportsFrontendFailures: /reportFrontendEvent\("frontend_api_failure"/.test(
    fs.readFileSync(path.join(webDir, "lib", "api.ts"), "utf8")
  ),
};

const report = {
  generatedAt: new Date().toISOString(),
  apiBaseUrl,
  webBaseUrl,
  sourceChecks,
  checks: [],
  captures: [],
  blockingConsoleEvents: [],
  pageErrors: [],
  passed: false,
};

const apiStdout = createLogBuffer("[api] ");
const apiStderr = createLogBuffer("[api:err] ");
const webStdout = createLogBuffer("[web] ");
const webStderr = createLogBuffer("[web:err] ");

let apiServer;
let webServer;
let browser;

try {
  assert.ok(Object.values(sourceChecks).every(Boolean), "source_checks_failed");

  apiServer = spawn(process.execPath, [path.join(apiDir, "start.js")], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(apiPort),
      NODE_ENV: process.env.NODE_ENV || "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  apiServer.stdout.on("data", (chunk) => apiStdout.push(chunk));
  apiServer.stderr.on("data", (chunk) => apiStderr.push(chunk));

  await waitForHttpReady(`${apiBaseUrl}/health/live`);

  const liveRequestId = "obs_health_probe";
  const liveResponse = await fetch(`${apiBaseUrl}/health/live`, {
    headers: {
      "X-Request-Id": liveRequestId,
      "X-Client-Route": "/dashboard",
      "X-Client-Session-Id": "obs_session_probe",
    },
  });
  await liveResponse.text();
  await delay(400);

  report.checks.push({
    name: "api_health_request_echoes_request_id",
    status: liveResponse.status,
    requestId: liveResponse.headers.get("x-request-id"),
  });
  assert.equal(liveResponse.status, 200);
  assert.equal(liveResponse.headers.get("x-request-id"), liveRequestId);
  assert.equal(apiStdout.contains(`"msg":"request_started"`), true);
  assert.equal(apiStdout.contains(`"requestId":"${liveRequestId}"`), true);
  assert.equal(apiStdout.contains(`"msg":"request_finished"`), true);
  assert.equal(apiStdout.contains(`"clientRoute":"/dashboard"`), true);

  const authRequestId = "obs_auth_probe";
  const authResponse = await fetch(`${apiBaseUrl}/api/projects`, {
    headers: {
      "X-Request-Id": authRequestId,
    },
  });
  await authResponse.text();
  await delay(400);

  report.checks.push({
    name: "api_auth_failure_is_correlatable",
    status: authResponse.status,
    requestId: authResponse.headers.get("x-request-id"),
    authMissingHeaderLogged: apiStdout.contains(`"msg":"auth_missing_header"`) || apiStderr.contains(`"msg":"auth_missing_header"`),
  });
  assert.equal(authResponse.status, 401);
  assert.equal(authResponse.headers.get("x-request-id"), authRequestId);
  assert.equal(
    apiStdout.contains(`"msg":"auth_missing_header"`) || apiStderr.contains(`"msg":"auth_missing_header"`),
    true
  );
  assert.equal(apiStdout.contains(`"requestId":"${authRequestId}"`) || apiStderr.contains(`"requestId":"${authRequestId}"`), true);

  if (!fs.existsSync(buildDir)) {
    throw new Error("web_build_missing");
  }

  webServer = spawnCommand("pnpm", ["-C", "apps/web", "exec", "next", "start", "-p", String(webPort)], {
    cwd: rootDir,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  webServer.stdout.on("data", (chunk) => webStdout.push(chunk));
  webServer.stderr.on("data", (chunk) => webStderr.push(chunk));

  await waitForHttpReady(`${webBaseUrl}/`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  page.on("console", (message) => {
    const text = message.text();
    if (!text.includes("Download the React DevTools")) {
      report.blockingConsoleEvents.push({ type: message.type(), text });
    }
  });
  page.on("pageerror", (error) => {
    report.pageErrors.push(String(error));
  });

  await page.goto(`${webBaseUrl}/`, { waitUntil: "networkidle", timeout: 45000 });
  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "codex_frontend_runtime_probe",
        filename: "codex://probe",
        lineno: 17,
        colno: 4,
        error: new Error("codex_frontend_runtime_probe"),
      })
    );
  });
  await delay(1500);

  const screenshotPath = path.join(outputDir, "frontend-observability-home.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  report.captures.push(path.relative(rootDir, screenshotPath).replaceAll("\\", "/"));

  report.checks.push({
    name: "frontend_runtime_error_is_captured_server_side",
    logCaptured:
      webStdout.contains(`"msg":"frontend_error_captured"`) ||
      webStderr.contains(`"msg":"frontend_error_captured"`),
    messageCaptured:
      webStdout.contains("codex_frontend_runtime_probe") ||
      webStderr.contains("codex_frontend_runtime_probe"),
  });

  assert.equal(
    webStdout.contains(`"msg":"frontend_error_captured"`) ||
      webStderr.contains(`"msg":"frontend_error_captured"`),
    true
  );
  assert.equal(
    webStdout.contains("codex_frontend_runtime_probe") ||
      webStderr.contains("codex_frontend_runtime_probe"),
    true
  );

  await context.close();
  await browser.close();
  browser = null;

  assert.equal(report.blockingConsoleEvents.length, 0);
  assert.equal(report.pageErrors.length, 0);
  report.passed = true;
} catch (error) {
  report.error = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outputDir, "observability-hardening-report.json"), JSON.stringify(report, null, 2));
  writeLogFile("observability-api.log", [apiStdout, apiStderr]);
  writeLogFile("observability-web.log", [webStdout, webStderr]);
  if (browser) await browser.close();
  await stopChild(webServer);
  await stopChild(apiServer);
  process.exit(process.exitCode || 0);
}
