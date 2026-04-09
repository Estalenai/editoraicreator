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
const outputDir = path.join(rootDir, "output", "validation", "route-gate-hardening");
const buildDir = path.join(webDir, ".next");
const port = 3720 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;

if (!fs.existsSync(buildDir)) {
  throw new Error("web_build_missing");
}

fs.mkdirSync(outputDir, { recursive: true });

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-60)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 160) lines.splice(0, lines.length - 160);
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

const stdoutLogs = createLogBuffer("[web] ");
const stderrLogs = createLogBuffer("[web:err] ");
const server = spawn("pnpm", ["-C", "apps/web", "exec", "next", "start", "-p", String(port)], {
  cwd: rootDir,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});

server.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
server.stderr.on("data", (chunk) => stderrLogs.push(chunk));

const sourceChecks = {
  middlewareExists: fs.existsSync(path.join(webDir, "middleware.ts")),
  sessionRouteExists: fs.existsSync(path.join(webDir, "app", "api", "auth", "session", "route.ts")),
  authBridgeExists: fs.existsSync(path.join(webDir, "components", "auth", "AuthSessionBridge.tsx")),
  e2eRuntimeGuarded: /isE2EAuthRuntimeAllowed\(\)/.test(
    fs.readFileSync(path.join(webDir, "lib", "supabaseClient.ts"), "utf8")
  ),
};

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  sourceChecks,
  checks: [],
  blockingConsoleEvents: [],
  pageErrors: [],
  passed: false,
};

try {
  await waitForHttpReady(`${baseUrl}/login`);

  const unauthDashboard = await fetch(`${baseUrl}/dashboard`, { redirect: "manual" });
  const unauthAdmin = await fetch(`${baseUrl}/admin`, { redirect: "manual" });

  report.checks.push({
    name: "dashboard_requires_server_gate",
    status: unauthDashboard.status,
    location: unauthDashboard.headers.get("location"),
  });
  report.checks.push({
    name: "admin_requires_server_gate",
    status: unauthAdmin.status,
    location: unauthAdmin.headers.get("location"),
  });

  assert.equal(unauthDashboard.status, 307);
  assert.match(String(unauthDashboard.headers.get("location") || ""), /^\/login\?next=%2Fdashboard/);
  assert.equal(unauthAdmin.status, 307);
  assert.match(String(unauthAdmin.headers.get("location") || ""), /^\/login\?next=%2Fadmin/);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
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

  await page.addInitScript(() => {
    window.localStorage.setItem("__editor_ai_creator_e2e_auth_mode", "1");
    window.localStorage.setItem(
      "__editor_ai_creator_e2e_auth_session",
      JSON.stringify({
        access_token: "e2e-access-token:qa@editorai.test",
        refresh_token: "e2e-refresh-token",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: { id: "e2e-user", email: "qa@editorai.test" },
      })
    );
  });

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle", timeout: 45000 });
  const e2eProdUrl = page.url();
  await page.screenshot({ path: path.join(outputDir, "dashboard-e2e-prod-disabled.png"), fullPage: true });

  report.checks.push({
    name: "production_blocks_browser_e2e_override",
    url: e2eProdUrl,
  });
  assert.match(e2eProdUrl, /\/login\?next=%2Fdashboard$/);

  await context.addCookies([
    {
      name: "editor_ai_access_token",
      value: "fake.invalid.token.value.that.should.never.pass",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle", timeout: 45000 });
  const invalidCookieUrl = page.url();
  const cookiesAfterRedirect = await context.cookies(baseUrl);
  await page.screenshot({ path: path.join(outputDir, "admin-invalid-cookie-redirect.png"), fullPage: true });

  report.checks.push({
    name: "invalid_access_cookie_is_rejected",
    url: invalidCookieUrl,
    remainingAuthCookie: cookiesAfterRedirect.some((cookie) => cookie.name === "editor_ai_access_token"),
  });
  assert.match(invalidCookieUrl, /\/login\?next=%2Fadmin$/);
  assert.equal(cookiesAfterRedirect.some((cookie) => cookie.name === "editor_ai_access_token"), false);

  await browser.close();

  assert.equal(report.blockingConsoleEvents.length, 0);
  assert.equal(report.pageErrors.length, 0);
  report.passed = true;
} catch (error) {
  report.error = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outputDir, "route-gate-hardening-report.json"), JSON.stringify(report, null, 2));
  if (stdoutLogs.dump() || stderrLogs.dump()) {
    fs.writeFileSync(
      path.join(outputDir, "route-gate-hardening-server.log"),
      [stdoutLogs.dump(), stderrLogs.dump()].filter(Boolean).join("\n"),
      "utf8"
    );
  }
  await stopChild(server);
  process.exit(process.exitCode || 0);
}
