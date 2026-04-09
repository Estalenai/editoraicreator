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
const outputDir = path.join(rootDir, "output", "validation", "surface-uniformity");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 5840 + Math.floor(Math.random() * 120);
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
      (text.includes("Extra attributes from the server") && text.includes("style")) ||
      (text.includes("Extra attributes from the server") && text.includes("data-reveal-bound")) ||
      (text.includes("Prop `%s` did not match") && text.includes("is-visible"))
    );
  });
}

function seedMockState(state) {
  const projects = [
    {
      id: "proj_surface_1",
      title: "Campanha Creator Hero",
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
      id: "proj_surface_2",
      title: "Roteiro de aquisição",
      kind: "script",
      updated_at: "2026-04-08T13:24:00.000Z",
      created_at: "2026-04-07T09:00:00.000Z",
      data: {
        version: "project.v2",
        delivery: { stage: "exported" },
      },
    },
  ];

  for (const project of projects) {
    state.projects.set(project.id, project);
    state.projectOrder.push(project.id);
  }

  state.supportRequests = [
    {
      id: "support_surface_1",
      category: "problema_tecnico",
      subject: "Publish ficou em reconciliação",
      message: "O projeto já subiu, mas a tela continuou com status antigo.",
      status: "in_review",
      admin_note: "Equipe validando retorno do provider e o histórico do deploy.",
      created_at: "2026-04-08T16:20:00.000Z",
    },
  ];

  state.transactions = [
    {
      id: "tx_surface_1",
      coin_type: "pro",
      amount: 60,
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: "pkg_surface_001",
      created_at: "2026-04-08T15:10:00.000Z",
    },
    {
      id: "tx_surface_2",
      coin_type: "common",
      amount: -12,
      reason: "Consumo confirmado",
      feature: "Creator Post",
      ref_kind: "generation",
      ref_id: "gen_surface_001",
      created_at: "2026-04-08T14:40:00.000Z",
    },
  ];
}

async function attachProviderMocks(context) {
  await context.route("**/api/github/connection", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
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
      }),
    });
  });

  await context.route("**/api/vercel/connection", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
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
      }),
    });
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

async function inspectSurface(page, selectors) {
  return page.evaluate((selectorMap) => {
    const entries = Object.entries(selectorMap).map(([key, selector]) => {
      const element = document.querySelector(selector);
      if (!element) {
        return [key, { exists: false }];
      }
      const computed = window.getComputedStyle(element);
      const backgroundImage = computed.backgroundImage || "";
      const boxShadow = computed.boxShadow || "";
      const borderRadius = computed.borderRadius || "";
      return [
        key,
        {
          exists: true,
          backgroundImage,
          boxShadow,
          borderRadius,
          hasBackgroundImage: backgroundImage !== "none",
          hasBoxShadow: boxShadow !== "none",
        },
      ];
    });

    return Object.fromEntries(entries);
  }, selectors);
}

async function captureRoute(page, routeConfig) {
  const routeDir = path.join(outputDir, routeConfig.slug);
  fs.mkdirSync(routeDir, { recursive: true });
  const captures = [];

  for (const viewport of routeConfig.viewports) {
    const consoleEvents = [];
    const pageErrors = [];
    const failingResponses = [];

    const onConsole = (message) => consoleEvents.push({ type: message.type(), text: message.text() });
    const onPageError = (error) => pageErrors.push(String(error));
    const onResponse = (response) => {
      if (response.status() >= 500) failingResponses.push({ status: response.status(), url: response.url() });
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("response", onResponse);

    try {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${baseUrl}${routeConfig.path}`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForSelector(routeConfig.readySelector, { timeout: 30000 });
      const screenshotPath = path.join(routeDir, `${routeConfig.slug}-${viewport.width}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });

      const pageText = await page.locator("body").innerText();
      const requiredTextChecks = Object.fromEntries(
        (routeConfig.requiredText || []).map((text) => [text, pageText.includes(text)])
      );

      let lowerSectionScreenshot = null;
      if (viewport.width === 1440 && routeConfig.lowerSectionSelector) {
        const lowerSection = page.locator(routeConfig.lowerSectionSelector).first();
        if (await lowerSection.count()) {
          const lowerSectionPath = path.join(routeDir, `${routeConfig.slug}-lower-${viewport.width}.png`);
          await lowerSection.screenshot({ path: lowerSectionPath, animations: "disabled" });
          lowerSectionScreenshot = path.relative(rootDir, lowerSectionPath).replaceAll("\\", "/");
        }
      }

      const surfaceChecks = routeConfig.surfaceSelectors
        ? await inspectSurface(page, routeConfig.surfaceSelectors)
        : {};

      captures.push({
        route: routeConfig.slug,
        width: viewport.width,
        height: viewport.height,
        screenshot: path.relative(rootDir, screenshotPath).replaceAll("\\", "/"),
        lowerSectionScreenshot,
        pageErrors,
        failingResponses,
        consoleEvents,
        blockingConsoleEvents: filterBlockingConsoleEvents(consoleEvents),
        requiredTextChecks,
        surfaceChecks,
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

const globalsSource = fs.readFileSync(path.join(webDir, "app", "globals.css"), "utf8");
const supportSource = fs.readFileSync(path.join(webDir, "app", "support", "page.tsx"), "utf8");

const sourceChecks = {
  supportCanvasActivated: supportSource.includes('className="support-page-canvas"'),
  continuityPassPresent: globalsSource.includes("Top-to-base surface continuity pass"),
  creditsCanvasRaised:
    globalsSource.includes(".credits-page-canvas {") &&
    globalsSource.includes("var(--ea-unified-surface-strong) !important;"),
  supportLowerSurfaceRaised:
    globalsSource.includes(".support-page .support-reference-section") &&
    globalsSource.includes(".support-page .support-privacy-rail"),
};

const routeConfigs = [
  {
    slug: "home",
    path: "/",
    readySelector: "main, .landing-page, .home-page, body",
    requiredText: ["A mesma peça vai do creator à saída.", "Você não gera e descarta. Você continua."],
    viewports: [
      { width: 1440, height: 1400 },
      { width: 768, height: 1360 },
      { width: 375, height: 1180 },
    ],
  },
  {
    slug: "dashboard",
    path: "/dashboard",
    readySelector: ".dashboard-page",
    requiredText: ["Dashboard", "Retomar projeto"],
    viewports: [
      { width: 1440, height: 1400 },
      { width: 768, height: 1360 },
      { width: 375, height: 1180 },
    ],
  },
  {
    slug: "credits",
    path: "/credits",
    readySelector: ".credits-page",
    requiredText: ["Creator Coins", "Ledger recente de Creator Coins"],
    lowerSectionSelector: "#credits-history",
    surfaceSelectors: {
      creditsCanvas: ".credits-page-canvas",
      creditsOperations: ".credits-main-section.credits-operations-region",
      creditsHistory: ".credits-history-region",
      creditsSupport: ".credits-support-section",
    },
    viewports: [
      { width: 1440, height: 1480 },
      { width: 768, height: 1360 },
      { width: 375, height: 1180 },
    ],
  },
  {
    slug: "support",
    path: "/support",
    readySelector: ".support-page",
    requiredText: ["Suporte", "Bases de apoio e respostas rápidas"],
    lowerSectionSelector: "#support-guide",
    surfaceSelectors: {
      supportCanvas: ".support-page-canvas",
      supportReference: ".support-reference-section",
      supportPrivacyRail: ".support-privacy-rail",
      supportOps: ".support-ops-section",
    },
    viewports: [
      { width: 1440, height: 1480 },
      { width: 768, height: 1360 },
      { width: 375, height: 1180 },
    ],
  },
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

  const publicPage = await context.newPage();
  const captures = [];
  captures.push(...(await captureRoute(publicPage, routeConfigs[0])));
  await publicPage.close();

  const page = await context.newPage();
  await login(page);

  for (const routeConfig of routeConfigs.slice(1)) {
    captures.push(...(await captureRoute(page, routeConfig)));
  }

  const blockingConsoleEventCount = captures.reduce((sum, item) => sum + item.blockingConsoleEvents.length, 0);
  const pageErrorCount = captures.reduce((sum, item) => sum + item.pageErrors.length, 0);
  const failedResponseCount = captures.reduce((sum, item) => sum + item.failingResponses.length, 0);
  const requiredTextFailures = captures.flatMap((capture) =>
    Object.entries(capture.requiredTextChecks || {})
      .filter(([, present]) => !present)
      .map(([text]) => `${capture.route}:${capture.width}:${text}`)
  );

  const creditsDesktop = captures.find((capture) => capture.route === "credits" && capture.width === 1440);
  const supportDesktop = captures.find((capture) => capture.route === "support" && capture.width === 1440);

  const computedChecks = {
    creditsCanvasHasSurface:
      Boolean(creditsDesktop?.surfaceChecks?.creditsCanvas?.exists) &&
      Boolean(creditsDesktop?.surfaceChecks?.creditsCanvas?.hasBackgroundImage) &&
      Boolean(creditsDesktop?.surfaceChecks?.creditsCanvas?.hasBoxShadow),
    creditsLowerSectionsHaveSurface:
      Boolean(creditsDesktop?.surfaceChecks?.creditsOperations?.exists) &&
      Boolean(creditsDesktop?.surfaceChecks?.creditsOperations?.hasBackgroundImage) &&
      Boolean(creditsDesktop?.surfaceChecks?.creditsHistory?.exists) &&
      Boolean(creditsDesktop?.surfaceChecks?.creditsHistory?.hasBackgroundImage) &&
      Boolean(creditsDesktop?.surfaceChecks?.creditsSupport?.exists) &&
      Boolean(creditsDesktop?.surfaceChecks?.creditsSupport?.hasBackgroundImage),
    supportCanvasHasSurface:
      Boolean(supportDesktop?.surfaceChecks?.supportCanvas?.exists) &&
      Boolean(supportDesktop?.surfaceChecks?.supportCanvas?.hasBackgroundImage) &&
      Boolean(supportDesktop?.surfaceChecks?.supportCanvas?.hasBoxShadow),
    supportLowerSectionsHaveSurface:
      Boolean(supportDesktop?.surfaceChecks?.supportReference?.exists) &&
      Boolean(supportDesktop?.surfaceChecks?.supportReference?.hasBackgroundImage) &&
      Boolean(supportDesktop?.surfaceChecks?.supportReference?.hasBoxShadow) &&
      Boolean(supportDesktop?.surfaceChecks?.supportPrivacyRail?.exists) &&
      Boolean(supportDesktop?.surfaceChecks?.supportPrivacyRail?.hasBackgroundImage) &&
      Boolean(supportDesktop?.surfaceChecks?.supportOps?.exists) &&
      Boolean(supportDesktop?.surfaceChecks?.supportOps?.hasBackgroundImage),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    sourceChecks,
    computedChecks,
    captures,
    blockingConsoleEventCount,
    pageErrorCount,
    failedResponseCount,
    requiredTextFailures,
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      Object.values(computedChecks).every(Boolean) &&
      blockingConsoleEventCount === 0 &&
      pageErrorCount === 0 &&
      failedResponseCount === 0 &&
      requiredTextFailures.length === 0,
  };

  fs.writeFileSync(path.join(outputDir, "surface-uniformity-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error(`surface_uniformity_validation_failed\n${JSON.stringify(report, null, 2)}`);
  }
} catch (error) {
  const failure = {
    generatedAt: new Date().toISOString(),
    error: String(error?.stack || error),
    nextLogs: nextLogs.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "surface-uniformity-error.json"), JSON.stringify(failure, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  await stopChild(nextProcess);
}
