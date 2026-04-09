import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");
const outputDir = path.join(rootDir, "output", "validation", "api-proxy-paths");
const buildDir = path.join(webDir, ".next");

const webPort = 3840 + Math.floor(Math.random() * 120);
const apiPort = 3940 + Math.floor(Math.random() * 120);
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

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
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-80)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 200) lines.splice(0, lines.length - 200);
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

const upstreamRequests = [];
const stubApiServer = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", apiBaseUrl);
  upstreamRequests.push({
    method: req.method || "GET",
    pathname: requestUrl.pathname,
    search: requestUrl.search,
  });

  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (requestUrl.pathname === "/api/beta-access/me") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        ok: true,
        access: {
          approved: true,
          requested: true,
          status: "approved",
          request_id: "beta-approved-request",
        },
      })
    );
    return;
  }

  if (requestUrl.pathname === "/api/projects") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, items: [] }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "not_found", pathname: requestUrl.pathname }));
});

const stdoutLogs = createLogBuffer("[web] ");
const stderrLogs = createLogBuffer("[web:err] ");

const report = {
  generatedAt: new Date().toISOString(),
  webBaseUrl,
  apiBaseUrl,
  checks: [],
  upstreamRequests,
  passed: false,
};

let webServer = null;

try {
  await new Promise((resolve, reject) => {
    stubApiServer.once("error", reject);
    stubApiServer.listen(apiPort, "127.0.0.1", resolve);
  });

  webServer = spawn("pnpm", ["-C", "apps/web", "exec", "next", "start", "-p", String(webPort)], {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      NEXT_PUBLIC_API_URL: apiBaseUrl,
      API_BASE_URL: apiBaseUrl,
      APP_BASE_URL: apiBaseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  webServer.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
  webServer.stderr.on("data", (chunk) => stderrLogs.push(chunk));

  await waitForHttpReady(`${webBaseUrl}/login`);

  const betaResponse = await fetch(`${webBaseUrl}/api-proxy/beta-access/me`, {
    headers: {
      Accept: "application/json",
      Authorization: "Bearer proxy-validation-token",
    },
  });
  const betaPayload = await betaResponse.json();

  report.checks.push({
    name: "beta_access_proxy_targets_api_namespace",
    status: betaResponse.status,
    payload: betaPayload,
  });

  assert.equal(betaResponse.status, 200);
  assert.equal(betaPayload?.access?.status, "approved");
  assert.ok(upstreamRequests.some((request) => request.pathname === "/api/beta-access/me"));

  const projectsResponse = await fetch(`${webBaseUrl}/api-proxy/projects`, {
    headers: {
      Accept: "application/json",
      Authorization: "Bearer proxy-validation-token",
    },
  });
  const projectsPayload = await projectsResponse.json();

  report.checks.push({
    name: "projects_proxy_targets_api_namespace",
    status: projectsResponse.status,
    payload: projectsPayload,
  });

  assert.equal(projectsResponse.status, 200);
  assert.ok(Array.isArray(projectsPayload?.items));
  assert.ok(upstreamRequests.some((request) => request.pathname === "/api/projects"));

  report.passed = true;
} catch (error) {
  report.error = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outputDir, "api-proxy-paths-report.json"), JSON.stringify(report, null, 2));
  if (stdoutLogs.dump() || stderrLogs.dump()) {
    fs.writeFileSync(
      path.join(outputDir, "api-proxy-paths-server.log"),
      [stdoutLogs.dump(), stderrLogs.dump()].filter(Boolean).join("\n"),
      "utf8"
    );
  }

  await stopChild(webServer);
  await new Promise((resolve) => stubApiServer.close(resolve));
  process.exit(process.exitCode || 0);
}
