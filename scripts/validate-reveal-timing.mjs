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
const outputDir = path.join(rootDir, "output", "validation", "reveal-timing");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 5760 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;

if (!nextBin) throw new Error("next_bin_missing");

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-120)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 360) lines.splice(0, lines.length - 360);
    },
    dump() {
      return lines.join("\n");
    },
  };
}

function json(data, status = 200) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    },
    body: JSON.stringify(data),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function seedMockState(state) {
  const projects = [
    {
      id: "proj_reveal_1",
      title: "Lançamento Creator Hero",
      kind: "post",
      updated_at: "2026-04-08T16:18:00.000Z",
      created_at: "2026-04-07T10:12:00.000Z",
      data: {
        version: "project.v2",
        delivery: { stage: "published" },
        publish: {
          primary: {
            provider: "vercel",
            status: "published",
            externalStatus: "READY",
            environment: "production",
            repo: "acme/editor-ai-creator",
            branch: "main",
            commitSha: "a1b2c3d4",
            deploymentId: "dpl_001",
            deploymentUrl: "https://editor-ai-creator-preview.vercel.app",
            publishedUrl: "https://editorai.example.com",
          },
          timestamps: {
            publishedAt: "2026-04-08T16:18:00.000Z",
            updatedAt: "2026-04-08T16:18:00.000Z",
          },
        },
      },
    },
    {
      id: "proj_reveal_2",
      title: "Roteiro de aquisição",
      kind: "script",
      updated_at: "2026-04-08T13:24:00.000Z",
      created_at: "2026-04-07T09:00:00.000Z",
      data: {
        version: "project.v2",
        delivery: { stage: "exported" },
      },
    },
    {
      id: "proj_reveal_3",
      title: "Sequência de lançamento",
      kind: "clips",
      updated_at: "2026-04-08T11:06:00.000Z",
      created_at: "2026-04-06T18:22:00.000Z",
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
      id: "tx_reveal_1",
      coin_type: "pro",
      amount: 60,
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: "pkg_001",
      created_at: "2026-04-08T15:10:00.000Z",
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
      (text.includes("Prop `%s` did not match") && text.includes("is-visible"))
    );
  });
}

async function attachProviderMocks(context) {
  await context.route("**/api/github/connection", async (route) => {
    await route.fulfill(
      json({
        connection: {
          connected: true,
          login: "editor-ai-dev",
          name: "Editor AI Creator",
          avatarUrl: null,
          htmlUrl: "https://github.com/editor-ai-dev",
          scopes: ["repo", "read:user"],
          updatedAt: "2026-04-08T16:20:00.000Z",
          mode: "token",
        },
      })
    );
  });

  await context.route("**/api/vercel/connection", async (route) => {
    await route.fulfill(
      json({
        connection: {
          connected: true,
          id: "usr_vercel_01",
          username: "editor-ai-dev",
          email: "ops@editorai.test",
          name: "Editor AI Creator",
          avatarUrl: null,
          defaultTeamId: "team_editorai",
          defaultTeamSlug: "editor-ai",
          teams: [{ id: "team_editorai", slug: "editor-ai", name: "Editor AI" }],
          updatedAt: "2026-04-08T16:22:00.000Z",
          mode: "token",
        },
      })
    );
  });
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

function buildCheckpoints(viewportHeight) {
  const candidates = [0, Math.round(viewportHeight * 0.72), Math.round(viewportHeight * 1.45)];
  return [...new Set(candidates)];
}

async function measureReveal(page, rootSelector) {
  await page.waitForSelector(rootSelector, { timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll("[data-reveal]").length > 0,
    {},
    { timeout: 30000 }
  );

  return page.evaluate(() => {
    const vh = window.innerHeight;
    const items = [...document.querySelectorAll("[data-reveal]")].map((node, index) => {
      const element = node;
      const rect = element.getBoundingClientRect();
      const visible = element.classList.contains("is-visible");
      return {
        index,
        visible,
        top: Number(rect.top.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        className: String(element.className || "").trim().split(/\s+/).slice(0, 4).join(" "),
      };
    });

    const lateItems = items.filter(
      (item) => item.bottom > 0 && item.top <= vh * 0.9 && !item.visible
    );
    const nearFoldItems = items.filter(
      (item) => item.bottom > 0 && item.top <= vh * 1.02
    );
    const nearFoldLagItems = nearFoldItems.filter((item) => !item.visible);

    return {
      viewportHeight: vh,
      revealCount: items.length,
      visibleCount: items.filter((item) => item.visible).length,
      lateCount: lateItems.length,
      nearFoldCount: nearFoldItems.length,
      nearFoldLagCount: nearFoldLagItems.length,
      lateItems: lateItems.slice(0, 6),
      nearFoldLagItems: nearFoldLagItems.slice(0, 6),
    };
  });
}

async function inspectRoute(context, config, viewport) {
  const page = await context.newPage();
  const consoleEvents = [];
  const pageErrors = [];
  const failingResponses = [];
  const screenshotDir = path.join(outputDir, config.slug);
  fs.mkdirSync(screenshotDir, { recursive: true });

  page.on("console", (message) => consoleEvents.push({ type: message.type(), text: message.text() }));
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      failingResponses.push({ status: response.status(), url: response.url() });
    }
  });

  try {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}${config.path}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(config.rootSelector, { timeout: 30000 });

    const checkpoints = [];
    const maxScroll = await page.evaluate(() =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    );

    for (const checkpoint of buildCheckpoints(viewport.height)) {
      const scrollY = Math.min(checkpoint, maxScroll);
      await page.evaluate((nextY) => window.scrollTo({ top: nextY, behavior: "instant" }), scrollY);
      await delay(280);

      const metrics = await measureReveal(page, config.rootSelector);
      const screenshotPath = path.join(
        screenshotDir,
        `${config.slug}-${viewport.width}-${scrollY}.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: false, animations: "disabled" });

      checkpoints.push({
        scrollY,
        metrics,
        screenshot: path.relative(rootDir, screenshotPath).replaceAll("\\", "/"),
      });
    }

    return {
      slug: config.slug,
      path: config.path,
      viewport,
      checkpoints,
      pageErrors,
      failingResponses,
      consoleEvents,
      blockingConsoleEvents: filterBlockingConsoleEvents(consoleEvents),
    };
  } finally {
    await page.close();
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const motionRuntimeSource = fs.readFileSync(
  path.join(webDir, "components", "ui", "MotionRuntime.tsx"),
  "utf8"
);
const globalsCssSource = fs.readFileSync(path.join(webDir, "app", "globals.css"), "utf8");

const sourceChecks = {
  tighterThresholds: motionRuntimeSource.includes("const REVEAL_THRESHOLD = [0, 0.002, 0.012];"),
  earlierDesktopMargin: motionRuntimeSource.includes('const REVEAL_ROOT_MARGIN = "0px 0px 24% 0px";'),
  earlierCompactMargin: motionRuntimeSource.includes('const REVEAL_ROOT_MARGIN_COMPACT = "0px 0px 30% 0px";'),
  reducedDelayScale: motionRuntimeSource.includes("const REVEAL_DELAY_SCALE = 0.24;"),
  reducedCompactDelayScale: motionRuntimeSource.includes("const REVEAL_DELAY_SCALE_COMPACT = 0.14;"),
  shorterCssTransitions:
    globalsCssSource.includes("opacity var(--reveal-duration, 210ms)") &&
    globalsCssSource.includes("filter 220ms ease"),
  creatorsRevealRestored: !globalsCssSource.includes(".motion-runtime .creators-page [data-reveal]"),
  projectsRevealRestored: !globalsCssSource.includes(".motion-runtime .projects-page [data-reveal]"),
  dashboardMobileRevealRestored:
    !globalsCssSource.includes(".motion-runtime .dashboard-page [data-reveal],") ||
    !globalsCssSource.includes("@media (max-width: 768px)")
};

const routeConfigs = [
  { slug: "home", path: "/", rootSelector: ".beta-entry-page", requiresAuth: false },
  { slug: "dashboard", path: "/dashboard", rootSelector: ".dashboard-page", requiresAuth: true },
  { slug: "creators", path: "/creators", rootSelector: ".creators-page", requiresAuth: true },
];

const viewports = [
  { width: 1440, height: 1200, label: "desktop" },
  { width: 768, height: 1100, label: "tablet" },
  { width: 375, height: 980, label: "mobile" },
];

const nextLogs = createLogBuffer("[next] ");
const nextProcess = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: webDir,
  env: { ...process.env, NEXT_PUBLIC_E2E_AUTH_MODE: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

nextProcess.stdout.on("data", (chunk) => nextLogs.push(chunk));
nextProcess.stderr.on("data", (chunk) => nextLogs.push(chunk));

let browser;

try {
  await waitForHttpReady(`${baseUrl}/login`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const state = createMockApiState();
  seedMockState(state);

  await attachMockApi(context, state);
  await attachProviderMocks(context);

  const loginPage = await context.newPage();
  await login(loginPage);
  await loginPage.close();

  const captures = [];

  for (const routeConfig of routeConfigs) {
    for (const viewport of viewports) {
      captures.push(await inspectRoute(context, routeConfig, viewport));
    }
  }

  const lateRevealCount = captures.reduce(
    (sum, capture) =>
      sum +
      capture.checkpoints.reduce((routeSum, checkpoint) => routeSum + checkpoint.metrics.lateCount, 0),
    0
  );
  const nearFoldLagCount = captures.reduce(
    (sum, capture) =>
      sum +
      capture.checkpoints.reduce(
        (routeSum, checkpoint) => routeSum + checkpoint.metrics.nearFoldLagCount,
        0
      ),
    0
  );
  const blockingConsoleEventCount = captures.reduce(
    (sum, capture) => sum + capture.blockingConsoleEvents.length,
    0
  );
  const pageErrorCount = captures.reduce((sum, capture) => sum + capture.pageErrors.length, 0);
  const failedResponseCount = captures.reduce(
    (sum, capture) => sum + capture.failingResponses.length,
    0
  );

  const highlights = captures.map((capture) => ({
    route: capture.slug,
    viewport: capture.viewport.label,
    maxLateCount: Math.max(...capture.checkpoints.map((checkpoint) => checkpoint.metrics.lateCount)),
    maxNearFoldLagCount: Math.max(
      ...capture.checkpoints.map((checkpoint) => checkpoint.metrics.nearFoldLagCount)
    ),
    revealCount: capture.checkpoints[0]?.metrics.revealCount ?? 0,
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    sourceChecks,
    captures,
    highlights,
    totals: {
      lateRevealCount,
      nearFoldLagCount,
      blockingConsoleEventCount,
      pageErrorCount,
      failedResponseCount,
    },
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      lateRevealCount === 0 &&
      nearFoldLagCount === 0 &&
      blockingConsoleEventCount === 0 &&
      pageErrorCount === 0 &&
      failedResponseCount === 0,
  };

  fs.writeFileSync(
    path.join(outputDir, "reveal-timing-report.json"),
    JSON.stringify(report, null, 2)
  );

  if (!report.passed) {
    throw new Error(`reveal_timing_validation_failed\n${JSON.stringify(report, null, 2)}`);
  }
} catch (error) {
  const failure = {
    generatedAt: new Date().toISOString(),
    error: String(error?.stack || error),
    nextLogs: nextLogs.dump(),
  };
  fs.writeFileSync(
    path.join(outputDir, "reveal-timing-error.json"),
    JSON.stringify(failure, null, 2)
  );
  throw error;
} finally {
  if (browser) await browser.close();
  await stopChild(nextProcess);
}
