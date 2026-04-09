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
const outputDir = path.join(rootDir, "output", "validation", "logged-clarity");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const port = 5260 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;

if (!nextBin) throw new Error("next_bin_missing");

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
  const projects = [
    {
      id: "proj_logged_1",
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
      id: "proj_logged_2",
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
      id: "proj_logged_3",
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

function filterBlockingConsoleEvents(events) {
  return events.filter((event) => {
    const text = String(event.text || "");
    return !(
      text.includes("Download the React DevTools") ||
      text.includes("[Fast Refresh]") ||
      text.includes("Route changed") ||
      (text.includes("Extra attributes from the server") && text.includes("data-reveal-bound")) ||
      (text.includes("Prop `%s` did not match") && text.includes("is-visible"))
    );
  });
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

      captures.push({
        route: routeConfig.slug,
        width: viewport.width,
        height: viewport.height,
        screenshot: path.relative(rootDir, screenshotPath).replaceAll("\\", "/"),
        pageErrors,
        failingResponses,
        consoleEvents,
        blockingConsoleEvents: filterBlockingConsoleEvents(consoleEvents),
        requiredTextChecks,
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

const dashboardSource = fs.readFileSync(path.join(webDir, "app", "dashboard", "page.tsx"), "utf8");
const creatorsSource = fs.readFileSync(path.join(webDir, "app", "creators", "page.tsx"), "utf8");
const projectsSource = fs.readFileSync(path.join(webDir, "app", "projects", "page.tsx"), "utf8");
const creditsSource = fs.readFileSync(path.join(webDir, "app", "credits", "page.tsx"), "utf8");
const supportSource = fs.readFileSync(path.join(webDir, "app", "support", "page.tsx"), "utf8");
const supportOpsSource = fs.readFileSync(path.join(webDir, "components", "support", "SupportOperationsPanel.tsx"), "utf8");

const sourceChecks = {
  dashboardQuickLinkCopyTightened:
    dashboardSource.includes("Abra Post, Scripts ou Clips com contexto pronto.") &&
    !dashboardSource.includes("Abra Post, Scripts ou Clips e gere a base criativa com contexto."),
  creatorsHeroCopyTightened:
    creatorsSource.includes("Briefing, geração, projeto e continuidade no mesmo workspace.") &&
    !creatorsSource.includes("Creators concentra briefing, geração, projeto e continuidade editorial no mesmo workspace."),
  projectsHeroCopyTightened:
    projectsSource.includes("Abra, continue e acompanhe a saída com clareza.") &&
    !projectsSource.includes("Abra um rascunho salvo, continue no editor e acompanhe a saída com clareza."),
  creditsOperationsCopyTightened:
    creditsSource.includes("Compra, conversão e confirmação final do ledger na mesma região.") &&
    !creditsSource.includes("Compra avulsa, conversão e confirmação final do ledger ficam alinhadas na mesma região principal."),
  supportHeroCopyTightened:
    supportSource.includes("Dúvidas, problemas e próximo passo com menos ida e volta em planos, ${CREATOR_COINS_PUBLIC_NAME} e publicação.") &&
    !supportSource.includes("publicação e integrações"),
  supportOpsCopyTightened:
    supportOpsSource.includes("Consultando a prontidão da plataforma.") &&
    !supportOpsSource.includes("Consultando a prontidão da plataforma antes de pedir que o usuário interprete o problema sozinho."),
};

const routeConfigs = [
  {
    slug: "dashboard",
    path: "/dashboard",
    readySelector: ".dashboard-page",
    requiredText: ["Creators", "Refine a peça no mesmo núcleo.", "O núcleo criativo vem primeiro."],
    viewports: [
      { width: 1440, height: 1200 },
      { width: 375, height: 1180 },
    ],
  },
  {
    slug: "creators",
    path: "/creators",
    readySelector: ".creators-page",
    requiredText: ["Briefing, geração, projeto e continuidade no mesmo workspace.", "O trio hero fica visível sem disputar o workspace."],
    viewports: [
      { width: 1440, height: 1400 },
      { width: 375, height: 1180 },
    ],
  },
  {
    slug: "projects",
    path: "/projects",
    readySelector: ".projects-page",
    requiredText: ["Abra, continue e acompanhe a saída com clareza.", "Veja os estados de saída sem abrir o handoff completo."],
    viewports: [
      { width: 1440, height: 1300 },
      { width: 375, height: 1180 },
    ],
  },
  {
    slug: "credits",
    path: "/credits",
    readySelector: ".credits-page",
    requiredText: ["Creator Coins reúne saldo, compra, conversão e histórico.", "Compra, conversão e confirmação final do ledger na mesma região."],
    viewports: [
      { width: 1440, height: 1400 },
      { width: 375, height: 1180 },
    ],
  },
  {
    slug: "support",
    path: "/support",
    readySelector: ".support-page",
    requiredText: ["Confirme a prontidão da plataforma antes de assumir erro geral.", "Consulte a base certa antes de abrir um caso."],
    viewports: [
      { width: 1440, height: 1400 },
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

  const page = await context.newPage();
  await login(page);

  const captures = [];
  for (const routeConfig of routeConfigs) {
    captures.push(...(await captureRoute(page, routeConfig)));
  }

  const blockingConsoleEventCount = captures.reduce((sum, item) => sum + item.blockingConsoleEvents.length, 0);
  const pageErrorCount = captures.reduce((sum, item) => sum + item.pageErrors.length, 0);
  const failedResponseCount = captures.reduce((sum, item) => sum + item.failingResponses.length, 0);
  const requiredTextFailures = captures.flatMap((capture) =>
    Object.entries(capture.requiredTextChecks)
      .filter(([, present]) => !present)
      .map(([text]) => `${capture.route}:${capture.width}:${text}`)
  );

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    sourceChecks,
    captures,
    blockingConsoleEventCount,
    pageErrorCount,
    failedResponseCount,
    requiredTextFailures,
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      blockingConsoleEventCount === 0 &&
      pageErrorCount === 0 &&
      failedResponseCount === 0 &&
      requiredTextFailures.length === 0,
  };

  fs.writeFileSync(path.join(outputDir, "logged-clarity-report.json"), JSON.stringify(report, null, 2));

  if (!report.passed) {
    throw new Error(`logged_clarity_validation_failed\n${JSON.stringify(report, null, 2)}`);
  }
} catch (error) {
  const failure = {
    generatedAt: new Date().toISOString(),
    error: String(error?.stack || error),
    nextLogs: nextLogs.dump(),
  };
  fs.writeFileSync(path.join(outputDir, "logged-clarity-error.json"), JSON.stringify(failure, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  await stopChild(nextProcess);
}
