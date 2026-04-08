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
const globalsPath = path.join(webDir, "app", "globals.css");
const outputDir = path.join(rootDir, "output", "validation", "structure-discipline");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const port = 4610 + Math.floor(Math.random() * 120);
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
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-50)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 200) lines.splice(0, lines.length - 200);
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

function seedMockState(state) {
  const now = new Date("2026-04-08T17:30:00.000Z").toISOString();
  state.planCode = "EDITOR_PRO";
  state.wallet = {
    common: 1240,
    pro: 168,
    ultra: 36,
    updated_at: now,
  };
  state.usageItems = [
    { feature: "creator_post", used: 16, limit: 40 },
    { feature: "creator_scripts", used: 11, limit: 30 },
    { feature: "creator_clips", used: 4, limit: 12 },
    { feature: "editor_revisions", used: 22, limit: 60 },
  ];
  state.transactions = [
    {
      id: "tx_ledger_1",
      coin_type: "common",
      amount: 320,
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: "quote_301",
      created_at: "2026-04-08T16:42:00.000Z",
    },
    {
      id: "tx_ledger_2",
      coin_type: "pro",
      amount: -24,
      reason: "Uso operacional",
      feature: "Creator Scripts",
      ref_kind: "usage",
      ref_id: "usage_902",
      created_at: "2026-04-08T15:28:00.000Z",
    },
    {
      id: "tx_ledger_3",
      coin_type: "ultra",
      amount: 8,
      reason: "Ajuste conciliado",
      feature: "Reconciliação",
      ref_kind: "ledger",
      ref_id: "adj_18",
      created_at: "2026-04-08T14:10:00.000Z",
    },
  ];

  const projects = [
    {
      id: "proj_dashboard_core",
      title: "Campanha Creator Pro",
      kind: "post",
      updated_at: "2026-04-08T16:18:00.000Z",
      created_at: "2026-04-07T10:12:00.000Z",
      data: {
        version: "project.v2",
        delivery: {
          stage: "published",
          lastPublishedAt: "2026-04-08T16:18:00.000Z",
          lastExportedAt: "2026-04-08T16:02:00.000Z",
        },
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
            workspaceVerifiedAt: "2026-04-08T15:56:00.000Z",
            commitSyncedAt: "2026-04-08T16:00:00.000Z",
            publishedAt: "2026-04-08T16:18:00.000Z",
            updatedAt: "2026-04-08T16:18:00.000Z",
          },
        },
      },
    },
    {
      id: "proj_editor_chain",
      title: "Sequência de saída editorial",
      kind: "script",
      updated_at: "2026-04-08T13:24:00.000Z",
      created_at: "2026-04-07T09:00:00.000Z",
      data: {
        version: "project.v2",
        delivery: {
          stage: "exported",
          lastExportedAt: "2026-04-08T13:24:00.000Z",
        },
        publish: {
          primary: {
            provider: "github",
            status: "commit_synced",
            externalStatus: "synced",
            environment: "preview",
            repo: "acme/editor-ai-creator",
            branch: "ea/editorial-sequence",
            commitSha: "9f8e7d6c",
          },
          timestamps: {
            workspaceVerifiedAt: "2026-04-08T12:56:00.000Z",
            checkpointAt: "2026-04-08T13:02:00.000Z",
            commitSyncedAt: "2026-04-08T13:24:00.000Z",
            updatedAt: "2026-04-08T13:24:00.000Z",
          },
        },
      },
    },
    {
      id: "proj_draft_chain",
      title: "Rascunho de landing editorial",
      kind: "post",
      updated_at: "2026-04-08T11:08:00.000Z",
      created_at: "2026-04-06T08:20:00.000Z",
      data: {
        version: "project.v2",
        delivery: {
          stage: "draft",
        },
        publish: {
          primary: {
            provider: "github",
            status: "workspace_verified",
            externalStatus: "verified",
            environment: "preview",
            repo: "acme/editor-ai-creator",
            branch: "ea/landing-editorial",
          },
          timestamps: {
            workspaceVerifiedAt: "2026-04-08T10:54:00.000Z",
            updatedAt: "2026-04-08T11:08:00.000Z",
          },
        },
      },
    },
  ];

  for (const project of projects) {
    state.projects.set(project.id, project);
    state.projectOrder.push(project.id);
  }
}

async function attachAdminMocks(context) {
  const overviewPayload = {
    usage: { total: 248, errors: 6, replays: 14 },
    coins: {
      debit: { common: 420, pro: 92, ultra: 24 },
      credit: { common: 980, pro: 180, ultra: 42 },
    },
    subs: { active: 38, trialing: 7, past_due: 2, canceled: 3 },
    stripe: { processed: 44, ignored: 1, failed: 2 },
  };
  const routingPayload = {
    modes: { quality: 22, economy: 8, manual: 4 },
    providers: [
      { provider: "openai", count: 26 },
      { provider: "anthropic", count: 5 },
      { provider: "fallback", count: 3 },
    ],
  };
  const errorsPayload = {
    items: [
      { error: "insufficient_balance", count: 4 },
      { error: "publish_reconcile_timeout", count: 2 },
      { error: "provider_unavailable", count: 1 },
    ],
  };
  const eventsPayload = {
    items: [
      { event: "publish.reconciled", userId: "usr_1", plan: "EDITOR_PRO", timestamp: "2026-04-08T16:19:00.000Z" },
      { event: "coins.quote.used", userId: "usr_2", plan: "EDITOR_PRO", timestamp: "2026-04-08T16:02:00.000Z" },
      { event: "support.request.updated", userId: "usr_3", plan: "EDITOR_FREE", timestamp: "2026-04-08T15:45:00.000Z" },
    ],
  };
  const usersPayload = {
    items: [
      { user_id: "usr_1", email: "ops@editorai.test", plan_code: "EDITOR_PRO", created_at: "2026-03-28T10:00:00.000Z" },
      { user_id: "usr_2", email: "finance@editorai.test", plan_code: "EDITOR_ULTRA", created_at: "2026-03-25T12:00:00.000Z" },
    ],
  };
  const timelinePayload = {
    items: [
      { type: "support", created_at: "2026-04-08T15:45:00.000Z", feature: "Ticket atualizado", status: "in_review" },
      { type: "publish", created_at: "2026-04-08T16:19:00.000Z", event_type: "publish.reconciled", status: "published" },
      { type: "coins", created_at: "2026-04-08T16:02:00.000Z", plan_code: "EDITOR_PRO", status: "quoted" },
    ],
  };
  const supportPayload = {
    items: [
      {
        id: "sup_1",
        user_id: "usr_1",
        category: "problema_tecnico",
        subject: "Publicação não avançou",
        message: "O status ficou em sincronização.",
        status: "in_review",
        admin_note: "Reconciliação já iniciada.",
        created_at: "2026-04-08T15:12:00.000Z",
      },
      {
        id: "sup_2",
        user_id: "usr_2",
        category: "pedido_financeiro",
        subject: "Recibo de compra",
        message: "Preciso confirmar a referência da cotação.",
        status: "open",
        created_at: "2026-04-08T14:20:00.000Z",
      },
    ],
  };
  const betaPayload = {
    items: [
      {
        id: "beta_1",
        email: "creator@editorai.test",
        user_id: "usr_4",
        status: "pending",
        created_at: "2026-04-08T13:40:00.000Z",
      },
      {
        id: "beta_2",
        email: "studio@editorai.test",
        user_id: "usr_5",
        status: "approved",
        approved_at: "2026-04-07T18:00:00.000Z",
        created_at: "2026-04-07T16:42:00.000Z",
      },
    ],
  };

  const jsonHeaders = {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  };
  const json = (payload, status = 200) => ({
    status,
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });

  await context.route("**/api/health/ready", async (route) => {
    await route.fulfill(json({ ok: true, deps: { db: true, supabaseAdmin: true } }));
  });
  await context.route("**/api/status", async (route) => {
    await route.fulfill(
      json({
        ok: true,
        uptime_seconds: 86400,
        routing_defaults: { default_mode: "quality", recommended_mode: "quality" },
        metrics_snapshot: { total_usage_samples: 248, total_metrics_logged: 912 },
        internal_cost_totals: { global: { total_cost_score: 42.8 } },
      })
    );
  });
  await context.route("**/api/dashboard/errors", async (route) => {
    await route.fulfill(json(errorsPayload));
  });
  await context.route("**/api/dashboard/routing", async (route) => {
    await route.fulfill(json(routingPayload));
  });
  await context.route("**/api/events/recent?*", async (route) => {
    await route.fulfill(json(eventsPayload));
  });
  await context.route("**/api/admin/visibility", async (route) => {
    await route.fulfill(json({ is_admin: true }));
  });
  await context.route("**/api/admin/overview?*", async (route) => {
    await route.fulfill(json(overviewPayload));
  });
  await context.route("**/api/admin/users/search?*", async (route) => {
    await route.fulfill(json(usersPayload));
  });
  await context.route("**/api/admin/user/*/timeline?*", async (route) => {
    await route.fulfill(json(timelinePayload));
  });
  await context.route("**/api/support/admin/requests?*", async (route) => {
    await route.fulfill(json(supportPayload));
  });
  await context.route("**/api/support/admin/requests/*/status", async (route) => {
    await route.fulfill(json({ ok: true }));
  });
  await context.route("**/api/beta-access/admin/requests?*", async (route) => {
    await route.fulfill(json(betaPayload));
  });
  await context.route("**/api/beta-access/admin/requests/*", async (route) => {
    await route.fulfill(json({ ok: true, email_notification: { sent: true } }));
  });
  await context.route("**/api/github/connection", async (route) => {
    await route.fulfill(json({ connected: true, account: { login: "acme" } }));
  });
  await context.route("**/api/github/projects/*/workspace", async (route) => {
    await route.fulfill(
      json({
        ok: true,
        workspace: {
          owner: "acme",
          repo: "editor-ai-creator",
          branch: "ea/validation-flow",
          rootPath: "/",
          target: "app",
          verificationStatus: "verified",
        },
      })
    );
  });
  await context.route("**/api/github/projects/*/checkpoints", async (route) => {
    await route.fulfill(json({ ok: true, checkpoint: { id: "chk_1", commitMessage: "Validation checkpoint" } }));
  });
  await context.route("**/api/github/projects/*/sync", async (route) => {
    await route.fulfill(json({ ok: true, commitSha: "a1b2c3d4", status: "synced" }));
  });
  await context.route("**/api/github/projects/*/pull-request", async (route) => {
    await route.fulfill(json({ ok: true, number: 42, status: "open", url: "https://github.com/acme/editor-ai-creator/pull/42" }));
  });
  await context.route("**/api/vercel/connection", async (route) => {
    await route.fulfill(json({ connected: true, team: { slug: "editorai" } }));
  });
  await context.route("**/api/vercel/projects/*/workspace", async (route) => {
    await route.fulfill(
      json({
        ok: true,
        workspace: {
          projectName: "editor-ai-creator",
          environment: "production",
          productionUrl: "https://editorai.example.com",
        },
      })
    );
  });
  await context.route("**/api/vercel/projects/*/deploy", async (route) => {
    await route.fulfill(
      json({
        ok: true,
        deploymentId: "dpl_001",
        deploymentUrl: "https://editor-ai-creator-preview.vercel.app",
        state: "READY",
      })
    );
  });
  await context.route("**/api/vercel/projects/*/reconcile", async (route) => {
    await route.fulfill(
      json({
        ok: true,
        publishMachine: { state: "published", externalState: "READY", confirmed: true },
      })
    );
  });
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 45000 });
  await page.getByLabel("E-mail").fill("qa@editorai.test");
  await page.getByLabel("Senha").fill("Test123!");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
  await page.waitForSelector(".dashboard-page", { timeout: 30000 });
}

function rectOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
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
    await page.waitForSelector(selector, { timeout: 30000 });
    await page.screenshot({
      path: path.join(routeDir, `${slug}-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });

    const metrics = await page.evaluate(({ slug, width }) => {
      function collectRects(selector) {
        return Array.from(document.querySelectorAll(selector)).map((node) => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return {
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2)),
            top: Number(rect.top.toFixed(2)),
            left: Number(rect.left.toFixed(2)),
            right: Number(rect.right.toFixed(2)),
            bottom: Number(rect.bottom.toFixed(2)),
            display: style.display,
          };
        });
      }

      const summarize = (selector) => {
        const rects = collectRects(selector);
        if (rects.length === 0) return { count: 0 };
        const heights = rects.map((item) => item.height);
        const widths = rects.map((item) => item.width);
        return {
          count: rects.length,
          rects,
          minHeight: Math.min(...heights),
          maxHeight: Math.max(...heights),
          heightSpread: Math.max(...heights) - Math.min(...heights),
          minWidth: Math.min(...widths),
          maxWidth: Math.max(...widths),
        };
      };

      const selectorsBySlug = {
        dashboard: {
          summary: ".dashboard-summary-grid > *",
          workspace: ".dashboard-workspace-grid > *",
          main: ".dashboard-workspace-main > *",
        },
        projects: {
          hero: ".projects-hero-split > *",
          publish: ".projects-publish-grid .proof-value-block",
          handoff: ".github-workspace-grid > *, .vercel-publish-grid > *",
        },
        credits: {
          layout: ".credits-page-layout > *",
          summary: ".credits-summary-grid > *",
          rail: ".credits-support-rail > *",
        },
        admin: {
          overview: ".admin-overview-strip > *",
          observability: ".admin-observability-grid > *",
          attention: ".admin-attention-grid > *",
        },
      };

      return {
        viewportWidth: width,
        groups: Object.fromEntries(
          Object.entries(selectorsBySlug[slug] || {}).map(([key, value]) => [key, summarize(value)])
        ),
      };
    }, { slug, width });

    const overlapWarnings = [];
    for (const [groupName, groupMetrics] of Object.entries(metrics.groups)) {
      if (!groupMetrics?.rects || groupMetrics.rects.length < 2) continue;
      for (let index = 0; index < groupMetrics.rects.length; index += 1) {
        for (let compareIndex = index + 1; compareIndex < groupMetrics.rects.length; compareIndex += 1) {
          const current = groupMetrics.rects[index];
          const next = groupMetrics.rects[compareIndex];
          if (rectOverlap(current, next)) {
            overlapWarnings.push({ groupName, index, compareIndex });
          }
        }
      }
    }

    return {
      route: routePath,
      selector,
      viewport: { width, height },
      screenshot: path.join(routeDir, `${slug}-${width}.png`),
      consoleEvents,
      pageErrors,
      metrics,
      overlapWarnings,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const css = fs.readFileSync(globalsPath, "utf8");
const sourceChecks = {
  structureMarker: css.includes("Shared structure discipline foundation"),
  dashboardRatios:
    css.includes(".dashboard-workspace-grid") &&
    css.includes("1.52fr") &&
    css.includes("dashboard-main-card-projects") &&
    css.includes("grid-column: span 8"),
  projectsStructure:
    css.includes(".projects-page .projects-hero-split") &&
    css.includes(".projects-page .projects-publish-grid") &&
    css.includes("grid-column: span 6"),
  creditsStructure:
    css.includes(".credits-page-layout") &&
    css.includes(".credits-page .credits-summary-grid") &&
    css.includes("credits-summary-card-primary"),
  adminStructure:
    css.includes(".admin-overview-strip") &&
    css.includes("repeat(auto-fit, minmax(min(100%, 180px), 1fr))") &&
    css.includes(".admin-page .admin-subpanel-stat"),
  mobileCollapse:
    css.includes("@media (max-width: 1180px)") &&
    css.includes("@media (max-width: 768px)") &&
    css.includes("min-height: 0 !important"),
};

const webStdout = createLogBuffer("[web] ");
const webStderr = createLogBuffer("[web:err] ");

const webServer = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: webDir,
  env: {
    ...process.env,
    NODE_ENV: "development",
    NEXT_PUBLIC_E2E_AUTH_MODE: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

webServer.stdout.on("data", (chunk) => webStdout.push(chunk));
webServer.stderr.on("data", (chunk) => webStderr.push(chunk));

let browser;

try {
  await waitForHttpReady(`${baseUrl}/login`);

  const state = createMockApiState();
  seedMockState(state);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await attachMockApi(context, state);
  await attachAdminMocks(context);
  await context.addInitScript((modeKey) => {
    window.localStorage.setItem(modeKey, "1");
  }, E2E_AUTH_MODE_KEY);

  const page = await context.newPage();
  await login(page);

  const routes = [
    { slug: "dashboard", path: "/dashboard", selector: ".dashboard-page" },
    { slug: "projects", path: "/projects", selector: ".projects-page" },
    { slug: "credits", path: "/credits", selector: ".credits-page" },
    { slug: "admin", path: "/admin", selector: ".admin-page" },
  ];
  const viewports = [
    { width: 1440, height: 1200 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ];

  const captures = [];
  for (const route of routes) {
    for (const viewport of viewports) {
      captures.push(
        await captureRoute(page, route.slug, route.path, route.selector, viewport.width, viewport.height)
      );
    }
  }

  const overlapCount = captures.reduce((sum, capture) => sum + capture.overlapWarnings.length, 0);
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    authMode: "e2e_mock",
    sourceChecks,
    captures,
    consoleEventCount: captures.reduce((sum, capture) => sum + capture.consoleEvents.length, 0),
    pageErrors: captures.flatMap((capture) => capture.pageErrors),
    overlapCount,
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      overlapCount === 0 &&
      captures.every((capture) => capture.pageErrors.length === 0),
  };

  fs.writeFileSync(path.join(outputDir, "structure-discipline-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error("structure_discipline_validation_failed");
  }

  console.log(
    `Structure discipline validation OK. Report: ${path.join(outputDir, "structure-discipline-report.json")}`
  );
} catch (error) {
  const errorReport = {
    error: String(error),
    webStdout: webStdout.dump(),
    webStderr: webStderr.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "structure-discipline-error.json"), JSON.stringify(errorReport, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(webServer);
}
