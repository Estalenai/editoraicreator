import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "output", "validation", "operational-help-layer");
const supportPagePath = path.join(rootDir, "apps", "web", "app", "support", "page.tsx");
const panelPath = path.join(rootDir, "apps", "web", "components", "support", "SupportOperationsPanel.tsx");
const buildDir = path.join(rootDir, "apps", "web", ".next");
const webDir = path.join(rootDir, "apps", "web");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));

const apiPort = 3800 + Math.floor(Math.random() * 120);
const webPort = 3950 + Math.floor(Math.random() * 120);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;

function createDeferredLogs(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      const pieces = text.split(/\r?\n/).filter(Boolean);
      for (const piece of pieces.slice(-20)) lines.push(`${prefix}${piece}`);
      if (lines.length > 60) lines.splice(0, lines.length - 60);
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
      if (response.ok || [301, 302, 307, 308].includes(response.status)) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for_http:${url}`);
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

function containsAll(text, values) {
  return values.every((value) => text.includes(value));
}

fs.mkdirSync(outputDir, { recursive: true });

const supportPageSource = fs.readFileSync(supportPagePath, "utf8");
const panelSource = fs.readFileSync(panelPath, "utf8");

const sourceChecks = {
  statusSectionPresent: supportPageSource.includes("SupportOperationsPanel"),
  supportOpsHeadingPresent: panelSource.includes("Status e ajuda operacional"),
  retryPlaybookPresent: panelSource.includes("Quando tentar de novo"),
  escalationPlaybookPresent: panelSource.includes("Quando abrir suporte"),
  contextPlaybookPresent: panelSource.includes("O que incluir"),
  docsHeadingPresent: supportPageSource.includes("Bases de apoio"),
  outdatedFaqRemoved: !supportPageSource.includes("No beta, GitHub e Vercel seguem como base de continuidade e publicação."),
};

const apiStdout = createDeferredLogs("[api] ");
const apiStderr = createDeferredLogs("[api:err] ");
const apiServer = spawn(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `process.env.PORT=${JSON.stringify(String(apiPort))}; await import("./apps/api/server.js");`,
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
apiServer.stdout.on("data", (chunk) => apiStdout.push(chunk));
apiServer.stderr.on("data", (chunk) => apiStderr.push(chunk));

let webServer = null;
const webStdout = createDeferredLogs("[web] ");
const webStderr = createDeferredLogs("[web:err] ");

try {
  await waitForHttpReady(`${apiBaseUrl}/health/live`);
  const readyResponse = await fetch(`${apiBaseUrl}/api/health/ready`);
  const readyPayload = await readyResponse.json().catch(() => null);
  assert.ok([200, 503].includes(readyResponse.status), "health ready should return 200 or 503");

  let supportResponse = null;
  let supportHtml = "";

  if (fs.existsSync(buildDir) && nextBin) {
    webServer = spawn(process.execPath, [nextBin, "start", "-p", String(webPort)], {
      cwd: webDir,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    webServer.stdout.on("data", (chunk) => webStdout.push(chunk));
    webServer.stderr.on("data", (chunk) => webStderr.push(chunk));

    await waitForHttpReady(`${webBaseUrl}/support`);
    supportResponse = await fetch(`${webBaseUrl}/support`, { redirect: "manual" });
    supportHtml = await supportResponse.text();
  }

  const report = {
    createdAt: new Date().toISOString(),
    apiBaseUrl,
    webBaseUrl,
    sourceChecks,
    healthReady: {
      status: readyResponse.status,
      payload: readyPayload,
    },
    supportHtmlChecks: {
      status: supportResponse?.status ?? null,
      supportRouteOk: supportResponse ? supportResponse.status === 200 : false,
      supportPageMarkerPresent: supportHtml.includes("support-page"),
      supportOpsHeadingRendered: containsAll(supportHtml, ["Status e ajuda operacional", "Quando abrir suporte"]),
      docsHeadingRendered: supportHtml.includes("Bases de apoio"),
    },
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      [200, 503].includes(readyResponse.status) &&
      !!readyPayload &&
      typeof readyPayload.ok === "boolean" &&
      (supportResponse ? supportResponse.status === 200 : true),
  };

  fs.writeFileSync(path.join(outputDir, "operational-help-layer-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error("operational_help_layer_validation_failed");
  }

  console.log(`Operational help validation OK. Report: ${path.join(outputDir, "operational-help-layer-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    apiLogs: apiStdout.dump(),
    apiErrors: apiStderr.dump(),
    webLogs: webStdout.dump(),
    webErrors: webStderr.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "operational-help-layer-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await stopChild(webServer);
  await stopChild(apiServer);
}
