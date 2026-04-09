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
const homePath = path.join(webDir, "app", "page.tsx");
const buildDir = path.join(webDir, ".next");
const outputDir = path.join(rootDir, "output", "validation", "home-proposition");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 5620 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;

if (!fs.existsSync(buildDir)) throw new Error("web_build_missing: run `pnpm -C apps/web build` first.");
if (!nextBin) throw new Error("next_bin_missing");

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-60)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 180) lines.splice(0, lines.length - 180);
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

function filterBlockingConsoleEvents(events) {
  return events.filter((event) => {
    const text = String(event.text || "");
    return !(text.includes("Download the React DevTools") || text.includes("[Fast Refresh]"));
  });
}

async function captureHome(page, viewport) {
  const consoleEvents = [];
  const pageErrors = [];
  const onConsole = (message) => consoleEvents.push({ type: message.type(), text: message.text() });
  const onPageError = (error) => pageErrors.push(String(error));

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(".beta-entry-page", { timeout: 30000 });

    const routeDir = path.join(outputDir, "home");
    fs.mkdirSync(routeDir, { recursive: true });
    const screenshotPath = path.join(routeDir, `home-${viewport.width}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: viewport.width !== 1440,
      animations: "disabled",
    });

    const snapshot = await page.evaluate(() => {
      const title = document.querySelector(".beta-entry-title")?.textContent?.trim() || "";
      const copy = document.querySelector(".beta-entry-copy")?.textContent?.trim() || "";
      const proofHeading = document.querySelector(".beta-entry-proof-head h2")?.textContent?.trim() || "";
      const proofCopy = document.querySelector(".beta-entry-proof-head .helper-text-ea")?.textContent?.trim() || "";
      const commandPrompt = document.querySelector(".beta-entry-command-prompt strong")?.textContent?.trim() || "";
      const badge = document.querySelector(".beta-entry-headline-stack .beta-entry-badge")?.textContent?.trim() || "";
      const cardLabels = Array.from(document.querySelectorAll(".beta-entry-proof-row .proof-value-label"))
        .map((node) => node.textContent?.trim())
        .filter(Boolean);

      const heroWords = `${title} ${copy}`.trim().split(/\s+/).filter(Boolean).length;

      return {
        title,
        copy,
        proofHeading,
        proofCopy,
        commandPrompt,
        badge,
        cardLabels,
        heroWords,
      };
    });

    return {
      viewport,
      screenshot: path.relative(rootDir, screenshotPath).replaceAll("\\", "/"),
      consoleEvents,
      blockingConsoleEvents: filterBlockingConsoleEvents(consoleEvents),
      pageErrors,
      snapshot,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const homeSource = fs.readFileSync(homePath, "utf8");
const sourceChecks = {
  newHeadlinePresent: homeSource.includes("A mesma peça vai do creator à saída."),
  oldHeadlineRemoved: !homeSource.includes("Não é prompt solto. É creators, editor e projetos na mesma continuidade."),
  newCommandPromptPresent: homeSource.includes("Você não gera e descarta. Você continua."),
  oldDefensiveProofRemoved: !homeSource.includes("Sem case inventado."),
  conciseProofHeadingPresent: homeSource.includes("Veja o tipo de peça que já sai daqui."),
  simplifiedProofLabelsPresent:
    homeSource.includes('<span className="proof-value-label">Entrada</span>') &&
    homeSource.includes('<span className="proof-value-label">Saída</span>') &&
    homeSource.includes('<span className="proof-value-label">Continuação</span>'),
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

  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 375, height: 812 },
  ]) {
    captures.push(await captureHome(page, viewport));
  }

  const home1440 = captures.find((capture) => capture.viewport.width === 1440);
  const snippet = [
    home1440?.snapshot.title || "",
    home1440?.snapshot.copy || "",
    home1440?.snapshot.commandPrompt || "",
    home1440?.snapshot.proofHeading || "",
    home1440?.snapshot.proofCopy || "",
  ]
    .filter(Boolean)
    .join("\n");

  fs.writeFileSync(path.join(outputDir, "home-snippet.txt"), snippet);

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    sourceChecks,
    captures,
    heroWordCount: home1440?.snapshot.heroWords ?? null,
    badgeText: home1440?.snapshot.badge ?? "",
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      captures.every(
        (capture) =>
          capture.pageErrors.length === 0 &&
          capture.blockingConsoleEvents.length === 0
      ) &&
      Boolean(home1440?.snapshot.title === "A mesma peça vai do creator à saída.") &&
      Boolean(home1440?.snapshot.commandPrompt === "Você não gera e descarta. Você continua.") &&
      Boolean(home1440?.snapshot.proofHeading === "Veja o tipo de peça que já sai daqui.") &&
      Boolean((home1440?.snapshot.heroWords ?? 999) <= 24),
  };

  fs.writeFileSync(path.join(outputDir, "home-proposition-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error("home_proposition_validation_failed");
  }

  console.log(`Home proposition validation OK. Report: ${path.join(outputDir, "home-proposition-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    stdout: stdoutLogs.dump(),
    stderr: stderrLogs.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "home-proposition-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(server);
}
