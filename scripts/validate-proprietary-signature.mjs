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
const outputDir = path.join(rootDir, "output", "validation", "proprietary-signature");
const globalsPath = path.join(rootDir, "apps", "web", "app", "globals.css");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 4340 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;

if (!fs.existsSync(buildDir)) {
  throw new Error("web_build_missing: run `pnpm -C apps/web build` first.");
}

if (!nextBin) {
  throw new Error("next_bin_missing");
}

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-20)) {
        lines.push(`${prefix}${line}`);
      }
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
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for_web:${url}`);
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

async function captureRoute(page, slug, routePath, selector, width, height) {
  const routeDir = path.join(outputDir, slug);
  fs.mkdirSync(routeDir, { recursive: true });
  const consoleEvents = [];
  const pageErrors = [];

  const onConsole = (message) => {
    consoleEvents.push({ type: message.type(), text: message.text() });
  };
  const onPageError = (error) => {
    pageErrors.push(String(error));
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}${routePath}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(selector, { timeout: 20000 });
    await page.screenshot({
      path: path.join(routeDir, `${slug}-${width}.png`),
      fullPage: false,
      animations: "disabled",
    });
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }

  return {
    route: routePath,
    viewport: { width, height },
    consoleEvents,
    pageErrors,
  };
}

fs.mkdirSync(outputDir, { recursive: true });

const css = fs.readFileSync(globalsPath, "utf8");
const sourceChecks = {
  prismLineToken: css.includes("--ea-signature-prism-line"),
  railGlowToken: css.includes("--ea-signature-rail-glow"),
  orbitToken: css.includes("--ea-signature-orbit"),
  orbitShiftKeyframe: css.includes("@keyframes premium-orbit-shift"),
  seamSweepKeyframe: css.includes("@keyframes premium-seam-sweep"),
  navCoreSignature: css.includes(".app-nav-core-pill::after"),
  surfaceSignature: css.includes(".surface-flow-hero::after"),
  headSignature: css.includes(".app-shell-head-region::before"),
};

const stdoutLogs = createLogBuffer("[web] ");
const stderrLogs = createLogBuffer("[web:err] ");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: webDir,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
server.stderr.on("data", (chunk) => stderrLogs.push(chunk));

let browser;

try {
  await waitForHttpReady(`${baseUrl}/`);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const captures = [];
  captures.push(await captureRoute(page, "home", "/", ".beta-entry-page", 1440, 900));
  captures.push(await captureRoute(page, "login", "/login", ".auth-entry-shell", 1440, 900));
  captures.push(await captureRoute(page, "dashboard", "/dashboard", ".dashboard-page", 1440, 900));

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    sourceChecks,
    captures,
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      captures.every((capture) => capture.consoleEvents.length === 0 && capture.pageErrors.length === 0),
  };

  fs.writeFileSync(path.join(outputDir, "proprietary-signature-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error("proprietary_signature_validation_failed");
  }

  console.log(`Proprietary signature validation OK. Report: ${path.join(outputDir, "proprietary-signature-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    stdout: stdoutLogs.dump(),
    stderr: stderrLogs.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "proprietary-signature-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(server);
}
