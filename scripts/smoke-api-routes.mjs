import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const port = 3400 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;

function createDeferredLogs(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      const pieces = text.split(/\r?\n/).filter(Boolean);
      for (const piece of pieces.slice(-20)) {
        lines.push(`${prefix}${piece}`);
      }
      if (lines.length > 40) lines.splice(0, lines.length - 40);
    },
    dump() {
      return lines.join("\n");
    },
  };
}

async function waitForHttpReady(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for_api:${url}`);
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await delay(500);
  if (child.exitCode != null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const stdoutLogs = createDeferredLogs("[api] ");
const stderrLogs = createDeferredLogs("[api:err] ");
const server = spawn(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `process.env.PORT=${JSON.stringify(String(port))}; await import("./apps/api/server.js");`,
  ],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "development",
      SUPABASE_URL: process.env.SUPABASE_URL || "https://smoke-test.supabase.co",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "smoke-test-anon-key-placeholder",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

server.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
server.stderr.on("data", (chunk) => stderrLogs.push(chunk));

try {
  await waitForHttpReady(`${baseUrl}/health/live`);

  const rootResponse = await fetch(`${baseUrl}/`);
  assert.equal(rootResponse.status, 200);
  const rootJson = await readJson(rootResponse);
  assert.equal(rootJson.ok, true);

  for (const route of ["/health/live", "/api/health/live"]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200, `${route} should respond 200`);
    const payload = await readJson(response);
    assert.equal(payload.ok, true);
  }

  const readyResponse = await fetch(`${baseUrl}/api/health/ready`);
  assert.ok([200, 503].includes(readyResponse.status), "ready should return 200 or 503");
  const readyPayload = await readJson(readyResponse);
  assert.equal(typeof readyPayload.ok, "boolean");
  assert.equal(typeof readyPayload.deps, "object");

  const plansResponse = await fetch(`${baseUrl}/api/plans/catalog?lang=pt-BR`);
  assert.equal(plansResponse.status, 200);
  const plansPayload = await readJson(plansResponse);
  assert.equal(plansPayload.ok, true);
  assert.ok(Array.isArray(plansPayload.plans));

  const protectedChecks = [
    { method: "GET", path: "/api/projects" },
    { method: "POST", path: "/api/stripe/checkout/session", body: { plan_code: "EDITOR_PRO", success_url: "https://example.com/success", cancel_url: "https://example.com/cancel" } },
    { method: "POST", path: "/api/coins/packages/checkout/create", body: { package_total: 300, breakdown: { common: 300, pro: 0, ultra: 0 } } },
    { method: "POST", path: "/api/ai/text-generate", body: { prompt: "smoke" } },
  ];

  for (const check of protectedChecks) {
    const response = await fetch(`${baseUrl}${check.path}`, {
      method: check.method,
      headers: check.body ? { "Content-Type": "application/json" } : undefined,
      body: check.body ? JSON.stringify(check.body) : undefined,
    });
    assert.notEqual(response.status, 404, `${check.path} should be mounted`);
    assert.equal(response.status, 401, `${check.path} should require auth`);
  }

  console.log(`API smoke OK on ${baseUrl}`);
} catch (error) {
  console.error("API smoke failed");
  console.error(error);
  const logs = [stdoutLogs.dump(), stderrLogs.dump()].filter(Boolean).join("\n");
  if (logs) console.error(logs);
  process.exitCode = 1;
} finally {
  await stopChild(server);
}
