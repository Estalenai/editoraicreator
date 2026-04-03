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
const outputDir = path.join(rootDir, "output", "validation", "sensory-refinement");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 4100 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;
const globalsPath = path.join(rootDir, "apps", "web", "app", "globals.css");

if (!fs.existsSync(buildDir)) {
  throw new Error("web_build_missing: run `pnpm -C apps/web build` first.");
}

if (!nextBin) {
  throw new Error("next_bin_missing");
}

function createDeferredLogs(prefix) {
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
  const consoleEvents = [];
  const pageErrors = [];
  const routeDir = path.join(outputDir, slug);
  fs.mkdirSync(routeDir, { recursive: true });

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
    blockingConsoleEvents: consoleEvents.filter(
      (event) =>
        !String(event.text || "").includes("Failed to fetch RSC payload") ||
        !String(event.text || "").includes("/creators")
    ),
    pageErrors,
  };
}

fs.mkdirSync(outputDir, { recursive: true });

const css = fs.readFileSync(globalsPath, "utf8");
const sourceChecks = {
  prismDriftKeyframe: css.includes("@keyframes premium-prism-drift"),
  lumenPulseKeyframe: css.includes("@keyframes premium-lumen-pulse"),
  amberTemperaturePresent: css.includes("rgba(255, 191, 107"),
  violetTemperaturePresent: css.includes("rgba(157, 139, 255"),
  animatedBrandSignature:
    css.includes(".app-brand-mark-group::before") && css.includes("animation: premium-prism-drift"),
  animatedSurfaceSignature:
    css.includes(".surface-flow-hero::before") && css.includes("animation: premium-lumen-pulse"),
};

const stdoutLogs = createDeferredLogs("[web] ");
const stderrLogs = createDeferredLogs("[web:err] ");
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
  captures.push(await captureRoute(page, "home", "/", ".beta-entry-page", 375, 812));
  captures.push(await captureRoute(page, "login", "/login", ".auth-entry-shell", 1440, 900));
  captures.push(await captureRoute(page, "login", "/login", ".auth-entry-shell", 375, 812));

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    sourceChecks,
    captures,
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      captures.every((capture) => capture.pageErrors.length === 0 && capture.blockingConsoleEvents.length === 0),
  };

  fs.writeFileSync(path.join(outputDir, "sensory-refinement-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error("sensory_refinement_validation_failed");
  }

  console.log(`Sensory refinement validation OK. Report: ${path.join(outputDir, "sensory-refinement-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    stdout: stdoutLogs.dump(),
    stderr: stderrLogs.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "sensory-refinement-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(server);
}
