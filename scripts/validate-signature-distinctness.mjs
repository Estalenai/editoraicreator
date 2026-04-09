import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { attachMockApi, createMockApiState } from "./e2e/mockAppApi.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");
const outputDir = path.join(rootDir, "output", "validation", "signature-distinctness");
const globalsPath = path.join(webDir, "app", "globals.css");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 5560 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;

if (!nextBin) {
  throw new Error("next_bin_missing");
}

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-80)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 240) lines.splice(0, lines.length - 240);
    },
    dump() {
      return lines.join("\n");
    },
  };
}

function seedMockState(state) {
  const projects = [
    {
      id: "proj_signature_1",
      title: "Campanha Creator Hero",
      kind: "post",
      updated_at: "2026-04-08T16:18:00.000Z",
      created_at: "2026-04-07T10:12:00.000Z",
      data: {
        version: "project.v2",
        delivery: { stage: "published" },
      },
    },
    {
      id: "proj_signature_2",
      title: "Roteiro de aquisição",
      kind: "script",
      updated_at: "2026-04-08T13:24:00.000Z",
      created_at: "2026-04-07T09:00:00.000Z",
      data: {
        version: "project.v2",
        delivery: { stage: "draft" },
      },
    },
  ];

  for (const project of projects) {
    state.projects.set(project.id, project);
    state.projectOrder.push(project.id);
  }

  state.transactions = [
    {
      id: "tx_signature_1",
      coin_type: "pro",
      amount: 60,
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: "pkg_signature",
      created_at: "2026-04-08T15:10:00.000Z",
    },
  ];

  state.supportRequests = [
    {
      id: "support_signature_1",
      category: "duvida",
      subject: "Validação interna",
      message: "Mock apenas para render do dashboard.",
      status: "open",
      admin_note: null,
      created_at: "2026-04-08T16:20:00.000Z",
    },
  ];
}

async function waitForHttpReady(url, timeoutMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for:${url}`);
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
    return !(
      text.includes("Download the React DevTools") ||
      text.includes("[Fast Refresh]") ||
      text.includes("Route changed") ||
      text.includes("Extra attributes from the server") ||
      text.includes("Prop `%s` did not match") ||
      text.includes("data-reveal-bound") ||
      text.includes("is-visible")
    );
  });
}

async function inspectSignatureTarget(page, selector) {
  return page.evaluate((resolvedSelector) => {
    const node = document.querySelector(resolvedSelector);
    if (!node) return { found: false };

    const style = window.getComputedStyle(node);
    const before = window.getComputedStyle(node, "::before");
    const after = window.getComputedStyle(node, "::after");

    return {
      found: true,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      beforeDisplay: before.display,
      beforeBackgroundImage: before.backgroundImage,
      afterDisplay: after.display,
      afterBackgroundImage: after.backgroundImage,
    };
  }, selector);
}

function hasSignatureLayer(reading) {
  return (
    reading?.found &&
    reading.beforeBackgroundImage &&
    reading.beforeBackgroundImage !== "none" &&
    reading.afterBackgroundImage &&
    reading.afterBackgroundImage !== "none"
  );
}

async function login(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("__editor_ai_creator_e2e_auth_mode", "1");
  });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 45000 });
  await page.getByLabel("E-mail").fill("qa@editorai.test");
  await page.getByLabel("Senha").fill("Test123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
  await page.waitForSelector(".dashboard-page", { timeout: 30000 });
}

async function captureRoute(page, config) {
  const routeDir = path.join(outputDir, config.slug);
  fs.mkdirSync(routeDir, { recursive: true });
  const captures = [];

  for (const viewport of config.viewports) {
    const consoleEvents = [];
    const pageErrors = [];
    const failingResponses = [];

    const onConsole = (message) => consoleEvents.push({ type: message.type(), text: message.text() });
    const onPageError = (error) => pageErrors.push(String(error));
    const onResponse = (response) => {
      if (response.status() >= 500) {
        failingResponses.push({ status: response.status(), url: response.url() });
      }
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    try {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}${config.path}`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForSelector(config.readySelector, { timeout: 30000 });

      const signatureReadings = {};
      for (const [label, selector] of Object.entries(config.signatureSelectors)) {
        signatureReadings[label] = await inspectSignatureTarget(page, selector);
      }

      const signatureChecks = Object.fromEntries(
        Object.entries(signatureReadings).map(([label, reading]) => [label, hasSignatureLayer(reading)])
      );

      const screenshotPath = path.join(routeDir, `${config.slug}-${viewport.width}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });

      captures.push({
        route: config.slug,
        width: viewport.width,
        height: viewport.height,
        screenshot: path.relative(rootDir, screenshotPath).replaceAll("\\", "/"),
        pageErrors,
        failingResponses,
        consoleEvents,
        blockingConsoleEvents: filterBlockingConsoleEvents(consoleEvents),
        signatureChecks,
        signatureReadings,
      });
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("response", onResponse);
    }
  }

  return captures;
}

fs.mkdirSync(outputDir, { recursive: true });

const css = fs.readFileSync(globalsPath, "utf8");
const sourceChecks = {
  panelOrbitToken: css.includes("--ea-signature-panel-orbit"),
  panelSeamToken: css.includes("--ea-signature-panel-seam"),
  panelTraceToken: css.includes("--ea-signature-panel-trace"),
  dashboardPanelSignature: css.includes(".dashboard-page-canvas .dashboard-summary-card-primary"),
  loginPanelSignature: css.includes(".auth-entry-context-item"),
  homePanelSignature: css.includes(".beta-entry-command-surface"),
};

const routeConfigs = [
  {
    slug: "home",
    path: "/",
    readySelector: ".beta-entry-page",
    signatureSelectors: {
      commandSurface: ".beta-entry-command-surface",
      proofItem: ".beta-entry-proof-item",
      trustItem: ".beta-entry-trust-item",
    },
    viewports: [
      { width: 1440, height: 1100 },
      { width: 768, height: 1024 },
      { width: 375, height: 812 },
    ],
  },
  {
    slug: "login",
    path: "/login",
    readySelector: ".auth-entry-shell",
    signatureSelectors: {
      contextItem: ".auth-entry-context-item",
      supportNote: ".auth-entry-support-note",
      inlineNote: ".auth-entry-inline-note",
    },
    viewports: [
      { width: 1440, height: 1100 },
      { width: 768, height: 1024 },
      { width: 375, height: 812 },
    ],
  },
  {
    slug: "dashboard",
    path: "/dashboard",
    readySelector: ".dashboard-page",
    signatureSelectors: {
      summaryCard: ".dashboard-summary-card-primary",
      quickLink: ".dashboard-quick-link",
      signalChip: ".signal-chip",
    },
    viewports: [
      { width: 1440, height: 1200 },
      { width: 768, height: 1180 },
      { width: 375, height: 980 },
    ],
  },
];

const stdoutLogs = createLogBuffer("[web] ");
const stderrLogs = createLogBuffer("[web:err] ");
const server = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: webDir,
  env: {
    ...process.env,
    NODE_ENV: "development",
    NEXT_PUBLIC_E2E_AUTH_MODE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
server.stderr.on("data", (chunk) => stderrLogs.push(chunk));

let browser;

try {
  await waitForHttpReady(`${baseUrl}/`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const state = createMockApiState();
  seedMockState(state);
  await attachMockApi(context, state);

  const page = await context.newPage();
  const captures = [];

  captures.push(...(await captureRoute(page, routeConfigs[0])));
  captures.push(...(await captureRoute(page, routeConfigs[1])));

  await login(page);

  captures.push(...(await captureRoute(page, routeConfigs[2])));

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    sourceChecks,
    captures,
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      captures.every(
        (capture) =>
          capture.pageErrors.length === 0 &&
          capture.failingResponses.length === 0 &&
          capture.blockingConsoleEvents.length === 0 &&
          Object.values(capture.signatureChecks).every(Boolean)
      ),
  };

  fs.writeFileSync(path.join(outputDir, "signature-distinctness-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error("signature_distinctness_validation_failed");
  }

  console.log(`Signature distinctness validation OK. Report: ${path.join(outputDir, "signature-distinctness-report.json")}`);
} catch (error) {
  const errorReport = {
    error: String(error),
    stdout: stdoutLogs.dump(),
    stderr: stderrLogs.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "signature-distinctness-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(server);
}
