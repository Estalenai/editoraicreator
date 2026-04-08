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
const outputDir = path.join(rootDir, "output", "validation", "public-proof-layer");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 4220 + Math.floor(Math.random() * 120);
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

async function captureRoute(page, config) {
  const consoleEvents = [];
  const pageErrors = [];
  const routeDir = path.join(outputDir, config.slug);
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
    await page.setViewportSize(config.viewport);
    await page.goto(`${baseUrl}${config.route}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(config.selector, { timeout: 20000 });
    await page.screenshot({
      path: path.join(routeDir, `${config.slug}-${config.viewport.width}.png`),
      fullPage: false,
      animations: "disabled",
    });

    const checks = {};
    for (const [label, expected] of Object.entries(config.textChecks)) {
      checks[label] = (await page.getByText(expected, { exact: false }).count()) > 0;
    }

    return {
      route: config.route,
      viewport: config.viewport,
      checks,
      consoleEvents,
      pageErrors,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const stdoutLogs = createLogBuffer("[web] ");
const stderrLogs = createLogBuffer("[web:err] ");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: webDir,
  env: { ...process.env, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
server.stderr.on("data", (chunk) => stderrLogs.push(chunk));

const routeConfigs = [
  {
    slug: "home",
    route: "/",
    selector: ".beta-entry-page",
    viewport: { width: 1440, height: 900 },
    textChecks: {
      publicProofHeading: "Exemplos públicos do que já sai do núcleo.",
      noFakeCaseClaim: "Sem case inventado.",
      creatorsAvailability: "3 creators centrais já abertos",
      publicOutputLabel: "Saída pública",
    },
  },
  {
    slug: "home",
    route: "/",
    selector: ".beta-entry-page",
    viewport: { width: 375, height: 812 },
    textChecks: {
      publicProofHeading: "Exemplos públicos do que já sai do núcleo.",
      creatorsAvailability: "3 creators centrais já abertos",
    },
  },
  {
    slug: "how-it-works",
    route: "/how-it-works",
    selector: ".how-it-works-page",
    viewport: { width: 1440, height: 900 },
    textChecks: {
      examplesHeading: "Do briefing ao que já sai do fluxo",
      noFakeClientClaim: "Sem cliente inventado.",
      publicOutputLabel: "Saída pública",
    },
  },
  {
    slug: "login",
    route: "/login",
    selector: ".auth-entry-shell",
    viewport: { width: 1440, height: 900 },
    textChecks: {
      creativeCoreLogin: "Entre no núcleo criativo",
      betaClosedLabel: "Beta fechado",
    },
  },
];

let browser;

try {
  await waitForHttpReady(`${baseUrl}/`);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const captures = [];
  for (const routeConfig of routeConfigs) {
    captures.push(await captureRoute(page, routeConfig));
  }

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    captures,
    passed: captures.every(
      (capture) =>
        capture.pageErrors.length === 0 &&
        capture.consoleEvents.length === 0 &&
        Object.values(capture.checks).every(Boolean)
    ),
  };

  fs.writeFileSync(path.join(outputDir, "public-proof-layer-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error("public_proof_layer_validation_failed");
  }

  console.log(`Public proof layer validation OK. Report: ${path.join(outputDir, "public-proof-layer-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    stdout: stdoutLogs.dump(),
    stderr: stderrLogs.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "public-proof-layer-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(server);
}
