import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");
const buildDir = path.join(webDir, ".next");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 3600 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;

if (!fs.existsSync(buildDir)) {
  throw new Error("web_build_missing: execute `pnpm -C apps/web build` antes do smoke test.");
}

if (!nextBin) {
  throw new Error("next_bin_missing: nao foi possivel localizar o binario do Next para o smoke test.");
}

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
      if (lines.length > 50) lines.splice(0, lines.length - 50);
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
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for_web:${url}`);
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

const stdoutLogs = createDeferredLogs("[web] ");
const stderrLogs = createDeferredLogs("[web:err] ");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: webDir,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
server.stderr.on("data", (chunk) => stderrLogs.push(chunk));

try {
  await waitForHttpReady(`${baseUrl}/`);

  const routes = [
    "/",
    "/login",
    "/dashboard",
    "/creators",
    "/credits",
    "/plans",
    "/projects",
    "/support",
    "/how-it-works",
    "/editor/new",
    "/editor/smoke-project",
    "/admin",
  ];

  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    assert.notEqual(response.status, 404, `${route} should exist in the production build`);
    assert.notEqual(response.status, 500, `${route} should not fail in the production build`);

    if ([301, 302, 307, 308].includes(response.status)) continue;

    assert.equal(response.status, 200, `${route} should render successfully`);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    assert.ok(contentType.includes("text/html"), `${route} should return html`);
  }

  console.log(`Web smoke OK on ${baseUrl}`);
} catch (error) {
  console.error("Web smoke failed");
  console.error(error);
  const logs = [stdoutLogs.dump(), stderrLogs.dump()].filter(Boolean).join("\n");
  if (logs) console.error(logs);
  process.exitCode = 1;
} finally {
  await stopChild(server);
}
