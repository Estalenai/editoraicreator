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
const outputDir = path.join(rootDir, "output", "validation", "perceived-performance");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 5620 + Math.floor(Math.random() * 120);
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
      id: "proj_perf_1",
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
      id: "proj_perf_2",
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
      id: "proj_perf_3",
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

  state.supportRequests = [
    {
      id: "support_1",
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
      id: "tx_credit_1",
      coin_type: "pro",
      amount: 60,
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: "pkg_001",
      created_at: "2026-04-08T15:10:00.000Z",
    },
    {
      id: "tx_debit_1",
      coin_type: "common",
      amount: -12,
      reason: "Consumo confirmado",
      feature: "Creator Post",
      ref_kind: "generation",
      ref_id: "gen_001",
      created_at: "2026-04-08T14:40:00.000Z",
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

async function attachAdminMocks(context) {
  const supportItems = [
    {
      id: "support_admin_1",
      user_id: "user_alpha",
      category: "problema_tecnico",
      subject: "Publish ficou em reconciliação",
      message: "O projeto já subiu, mas a tela continuou com status antigo.",
      status: "in_review",
      admin_note: "Validando retorno do provider.",
      created_at: "2026-04-08T16:20:00.000Z",
      updated_at: "2026-04-08T16:32:00.000Z",
    },
    {
      id: "support_admin_2",
      user_id: "user_beta",
      category: "duvida",
      subject: "Saldo demorou para refletir",
      message: "A compra entrou na Stripe, mas o saldo ainda não apareceu.",
      status: "open",
      admin_note: null,
      created_at: "2026-04-08T14:00:00.000Z",
      updated_at: "2026-04-08T14:00:00.000Z",
    },
  ];

  const betaAccessItems = [
    {
      id: "beta_1",
      email: "alice@editorai.test",
      user_id: "user_alpha",
      status: "pending",
      admin_note: null,
      created_at: "2026-04-08T15:00:00.000Z",
      updated_at: "2026-04-08T15:00:00.000Z",
      approved_at: null,
    },
    {
      id: "beta_2",
      email: "bob@editorai.test",
      user_id: "user_beta",
      status: "approved",
      admin_note: "Acesso liberado.",
      created_at: "2026-04-08T12:00:00.000Z",
      updated_at: "2026-04-08T12:10:00.000Z",
      approved_at: "2026-04-08T12:10:00.000Z",
    },
  ];

  await context.route("**/api/admin/overview?**", async (route) => {
    await route.fulfill(
      json({
        usage: { total: 82, errors: 3, replays: 5 },
        coins: {
          debit: { common: 120, pro: 44, ultra: 12 },
          credit: { common: 200, pro: 90, ultra: 20 },
        },
        subs: { active: 16, trialing: 3, past_due: 1, canceled: 2 },
        stripe: { processed: 28, ignored: 2, failed: 1 },
      })
    );
  });

  await context.route("**/api/health/ready", async (route) => {
    await route.fulfill(
      json({
        ok: true,
        deps: {
          db: true,
          supabaseAdmin: true,
        },
      })
    );
  });

  await context.route("**/api/status", async (route) => {
    await route.fulfill(
      json({
        ok: true,
        uptime_seconds: 182400,
        routing_defaults: {
          default_mode: "balanced",
          recommended_mode: "balanced",
        },
        metrics_snapshot: {
          total_usage_samples: 82,
          total_metrics_logged: 144,
        },
        internal_cost_totals: {
          global: {
            total_cost_score: 184,
          },
        },
      })
    );
  });

  await context.route("**/api/dashboard/errors", async (route) => {
    await route.fulfill(
      json({
        items: [
          { error: "provider_timeout", count: 2 },
          { error: "beta_access_required", count: 1 },
        ],
      })
    );
  });

  await context.route("**/api/dashboard/routing", async (route) => {
    await route.fulfill(
      json({
        modes: { balanced: 18, quality: 5 },
        providers: [
          { provider: "openai", count: 19 },
          { provider: "runway", count: 4 },
        ],
      })
    );
  });

  await context.route("**/api/events/recent?**", async (route) => {
    await route.fulfill(
      json({
        items: [
          { event: "publish.reconciled", userId: "user_alpha", plan: "EDITOR_PRO", timestamp: nowIso() },
          { event: "coins.checkout.completed", userId: "user_beta", plan: "EDITOR_FREE", timestamp: nowIso() },
        ],
      })
    );
  });

  await context.route("**/api/support/admin/requests?**", async (route) => {
    await route.fulfill(json({ items: supportItems }));
  });

  await context.route("**/api/beta-access/admin/requests?**", async (route) => {
    await route.fulfill(json({ items: betaAccessItems }));
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

async function warmRoute(page, routePath, rootSelector, contentSelector) {
  await page.goto(`${baseUrl}${routePath}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForSelector(rootSelector, { timeout: 30000 });
  if (contentSelector) {
    await page.waitForSelector(contentSelector, { timeout: 30000 });
  }
}

async function measureRoute(context, config) {
  const page = await context.newPage();
  const requestTimeline = [];
  const consoleEvents = [];
  const pageErrors = [];
  const failingResponses = [];
  const screenshotDir = path.join(outputDir, config.slug);
  fs.mkdirSync(screenshotDir, { recursive: true });

  const onRequest = (request) => {
    const pathname = new URL(request.url()).pathname;
    if (config.trackRequests.includes(pathname)) {
      requestTimeline.push({ pathname, startedAt: Date.now() });
    }
  };
  const onConsole = (message) => consoleEvents.push({ type: message.type(), text: message.text() });
  const onPageError = (error) => pageErrors.push(String(error));
  const onResponse = (response) => {
    if (response.status() >= 500) {
      failingResponses.push({ status: response.status(), url: response.url() });
    }
  };

  page.on("request", onRequest);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  try {
    await page.setViewportSize({ width: config.viewport.width, height: config.viewport.height });
    const startedAt = Date.now();
    await page.goto(`${baseUrl}${config.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector(config.rootSelector, { timeout: 30000 });
    const shellMs = Date.now() - startedAt;
    await page.waitForSelector(config.contentSelector, { timeout: 30000 });
    const contentMs = Date.now() - startedAt;

    const timeline = requestTimeline.map((entry) => ({
      pathname: entry.pathname,
      startedMs: entry.startedAt - startedAt,
    }));

    const earliestBootstrapMs = timeline.length
      ? Math.min(
          ...timeline
            .filter((entry) => config.bootstrapRequests.includes(entry.pathname))
            .map((entry) => entry.startedMs)
        )
      : null;
    const earliestSecondaryMs = timeline.length
      ? Math.min(
          ...timeline
            .filter((entry) => config.secondaryRequests.includes(entry.pathname))
            .map((entry) => entry.startedMs)
        )
      : null;

    const secondaryLagMs =
      Number.isFinite(earliestBootstrapMs) && Number.isFinite(earliestSecondaryMs)
        ? earliestSecondaryMs - earliestBootstrapMs
        : null;

    const requestCounts = Object.fromEntries(
      config.trackRequests.map((pathname) => [
        pathname,
        timeline.filter((entry) => entry.pathname === pathname).length,
      ])
    );

    const screenshotPath = path.join(screenshotDir, `${config.slug}-${config.viewport.width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });

    return {
      slug: config.slug,
      path: config.path,
      shellMs,
      contentMs,
      secondaryLagMs,
      timeline,
      requestCounts,
      pageErrors,
      failingResponses,
      consoleEvents,
      blockingConsoleEvents: filterBlockingConsoleEvents(consoleEvents),
      screenshot: path.relative(rootDir, screenshotPath).replaceAll("\\", "/"),
    };
  } finally {
    page.off("request", onRequest);
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
    await page.close();
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const bootstrapSource = fs.readFileSync(path.join(webDir, "hooks", "useDashboardBootstrap.ts"), "utf8");
const dashboardSource = fs.readFileSync(path.join(webDir, "app", "dashboard", "page.tsx"), "utf8");
const creditsSource = fs.readFileSync(path.join(webDir, "app", "credits", "page.tsx"), "utf8");
const creatorsSource = fs.readFileSync(path.join(webDir, "app", "creators", "page.tsx"), "utf8");
const adminSource = fs.readFileSync(path.join(webDir, "app", "admin", "page.tsx"), "utf8");

const sourceChecks = {
  bootstrapRemovedDuplicatePlanFetch: !bootstrapSource.includes('apiFetch("/api/subscriptions/me"'),
  bootstrapUsesSharedDashboardPromise: bootstrapSource.includes("const dashboardPromise = loadDashboard"),
  dashboardStartsUsageOnAccessReady: dashboardSource.includes("if (accessReady)") && !dashboardSource.includes("if (!loading && !betaBlocked)"),
  creditsStartsLedgerOnAccessReady: creditsSource.includes("if (accessReady)") && !creditsSource.includes("if (!loading && !betaBlocked)"),
  creatorsUsesDynamicImports: creatorsSource.includes('import dynamic from "next/dynamic"'),
  adminRemovedExtraBetaQueueEffect: !adminSource.includes("}, [betaAccessFilter, forbidden]);\n\n  if (forbidden)") && !adminSource.includes("if (!forbidden) {\r\n      loadBetaAccessRequests();"),
};

const routeConfigs = [
  {
    slug: "dashboard",
    path: "/dashboard",
    rootSelector: ".dashboard-page",
    contentSelector: ".dashboard-progress-bar",
    bootstrapRequests: ["/api/beta-access/me", "/api/subscriptions/me", "/api/coins/balance", "/api/projects"],
    secondaryRequests: ["/api/usage/summary"],
    trackRequests: ["/api/beta-access/me", "/api/subscriptions/me", "/api/coins/balance", "/api/projects", "/api/usage/summary"],
    viewport: { width: 1440, height: 1200 },
  },
  {
    slug: "creators",
    path: "/creators",
    rootSelector: ".creators-page",
    contentSelector: ".creator-zone-title",
    bootstrapRequests: ["/api/beta-access/me", "/api/subscriptions/me", "/api/coins/balance", "/api/projects"],
    secondaryRequests: [],
    trackRequests: ["/api/beta-access/me", "/api/subscriptions/me", "/api/coins/balance", "/api/projects"],
    viewport: { width: 1440, height: 1400 },
  },
  {
    slug: "projects",
    path: "/projects",
    rootSelector: ".projects-page",
    contentSelector: ".projects-list-stack .dashboard-project-link",
    bootstrapRequests: ["/api/beta-access/me", "/api/subscriptions/me", "/api/coins/balance", "/api/projects"],
    secondaryRequests: [],
    trackRequests: ["/api/beta-access/me", "/api/subscriptions/me", "/api/coins/balance", "/api/projects", "/api/github/connection", "/api/vercel/connection"],
    viewport: { width: 1440, height: 1300 },
  },
  {
    slug: "credits",
    path: "/credits",
    rootSelector: ".credits-page",
    contentSelector: ".credits-history-item",
    bootstrapRequests: ["/api/beta-access/me", "/api/subscriptions/me", "/api/coins/balance", "/api/projects"],
    secondaryRequests: ["/api/coins/transactions"],
    trackRequests: ["/api/beta-access/me", "/api/subscriptions/me", "/api/coins/balance", "/api/projects", "/api/coins/transactions"],
    viewport: { width: 1440, height: 1400 },
  },
  {
    slug: "support",
    path: "/support",
    rootSelector: ".support-page",
    contentSelector: ".support-guide-card",
    bootstrapRequests: ["/api/beta-access/me"],
    secondaryRequests: ["/api/support/requests/me"],
    trackRequests: ["/api/beta-access/me", "/api/support/requests/me", "/api/health/ready"],
    viewport: { width: 1440, height: 1400 },
  },
  {
    slug: "admin",
    path: "/admin",
    rootSelector: ".admin-page",
    contentSelector: ".admin-overview-item",
    bootstrapRequests: ["/api/admin/overview", "/api/health/ready", "/api/status", "/api/dashboard/errors", "/api/dashboard/routing", "/api/events/recent"],
    secondaryRequests: ["/api/support/admin/requests", "/api/beta-access/admin/requests"],
    trackRequests: ["/api/admin/overview", "/api/health/ready", "/api/status", "/api/dashboard/errors", "/api/dashboard/routing", "/api/events/recent", "/api/support/admin/requests", "/api/beta-access/admin/requests"],
    viewport: { width: 1440, height: 1400 },
  },
];

const delayedPaths = new Set([
  "/api/beta-access/me",
  "/api/subscriptions/me",
  "/api/coins/balance",
  "/api/projects",
  "/api/usage/summary",
  "/api/coins/transactions",
  "/api/admin/overview",
  "/api/health/ready",
  "/api/status",
  "/api/dashboard/errors",
  "/api/dashboard/routing",
  "/api/events/recent",
  "/api/support/admin/requests",
  "/api/beta-access/admin/requests",
  "/api/support/requests/me",
]);

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
  await attachAdminMocks(context);

  await context.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (delayedPaths.has(pathname)) {
      await delay(650);
    }
    await route.fallback();
  });

  const loginPage = await context.newPage();
  await login(loginPage);

  for (const routeConfig of routeConfigs) {
    await warmRoute(loginPage, routeConfig.path, routeConfig.rootSelector, routeConfig.contentSelector);
  }
  await loginPage.close();

  const captures = [];
  for (const routeConfig of routeConfigs) {
    captures.push(await measureRoute(context, routeConfig));
  }

  const blockingConsoleEventCount = captures.reduce(
    (sum, capture) => sum + capture.blockingConsoleEvents.length,
    0
  );
  const pageErrorCount = captures.reduce((sum, capture) => sum + capture.pageErrors.length, 0);
  const failedResponseCount = captures.reduce((sum, capture) => sum + capture.failingResponses.length, 0);

  const dashboardMetrics = captures.find((capture) => capture.slug === "dashboard");
  const creditsMetrics = captures.find((capture) => capture.slug === "credits");
  const creatorsMetrics = captures.find((capture) => capture.slug === "creators");
  const adminMetrics = captures.find((capture) => capture.slug === "admin");
  const adminBetaQueueRequestCount =
    adminMetrics?.requestCounts?.["/api/beta-access/admin/requests"] ?? null;
  const adminSupportQueueRequestCount =
    adminMetrics?.requestCounts?.["/api/support/admin/requests"] ?? null;

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    sourceChecks,
    captures,
    highlights: {
      dashboardUsageRequestLagMs: dashboardMetrics?.secondaryLagMs ?? null,
      creditsLedgerRequestLagMs: creditsMetrics?.secondaryLagMs ?? null,
      creatorsShellMs: creatorsMetrics?.shellMs ?? null,
      creatorsContentMs: creatorsMetrics?.contentMs ?? null,
      adminBetaQueueRequestCount,
      adminSupportQueueRequestCount,
    },
    blockingConsoleEventCount,
    pageErrorCount,
    failedResponseCount,
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      blockingConsoleEventCount === 0 &&
      pageErrorCount === 0 &&
      failedResponseCount === 0 &&
      Number(dashboardMetrics?.secondaryLagMs ?? Infinity) < 1800 &&
      Number(creditsMetrics?.secondaryLagMs ?? Infinity) < 1800 &&
      Number(adminBetaQueueRequestCount ?? Infinity) === Number(adminSupportQueueRequestCount ?? -1),
  };

  fs.writeFileSync(
    path.join(outputDir, "perceived-performance-report.json"),
    JSON.stringify(report, null, 2)
  );

  if (!report.passed) {
    throw new Error(`perceived_performance_validation_failed\n${JSON.stringify(report, null, 2)}`);
  }
} catch (error) {
  const failure = {
    generatedAt: new Date().toISOString(),
    error: String(error?.stack || error),
    nextLogs: nextLogs.dump(),
  };
  fs.writeFileSync(
    path.join(outputDir, "perceived-performance-error.json"),
    JSON.stringify(failure, null, 2)
  );
  throw error;
} finally {
  if (browser) await browser.close();
  await stopChild(nextProcess);
}
