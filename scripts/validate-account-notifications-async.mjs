import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { attachMockApi, createMockApiState } from "./e2e/mockAppApi.mjs";

const APP_PORT = Number(process.env.E2E_WEB_PORT || 4820 + Math.floor(Math.random() * 120));
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), "output", "validation", "account-notifications-async");
const REPORT_PATH = path.join(OUTPUT_DIR, "account-notifications-async-report.json");
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const E2E_DIST_DIR = ".next-account-notifications-async";
const READ_IDS_STORAGE_KEY = "editor_ai_account_notification_reads_v1";
const LOCAL_NOTIFICATION_STORAGE_KEY = "editor_ai_account_local_notifications_v1";

function shouldIgnoreConsoleEvent(message) {
  return (
    message.includes("Download the React DevTools") ||
    message.includes("[Fast Refresh]") ||
    message.includes("Input elements should have autocomplete attributes") ||
    message.includes("favicon.ico")
  );
}

function resolveBrowserExecutable() {
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

async function ensureOutputDir() {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
}

function startWebServer() {
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/c", "pnpm", "-C", "apps/web", "exec", "next", "dev", "--turbo", "-p", String(APP_PORT)], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NEXT_PUBLIC_E2E_AUTH_MODE: "1",
            NEXT_DIST_DIR: E2E_DIST_DIR,
          },
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn("pnpm", ["-C", "apps/web", "exec", "next", "dev", "--turbo", "-p", String(APP_PORT)], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NEXT_PUBLIC_E2E_AUTH_MODE: "1",
            NEXT_DIST_DIR: E2E_DIST_DIR,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });

  const stdout = [];
  const stderr = [];
  child.stdout?.on("data", (chunk) => stdout.push(String(chunk)));
  child.stderr?.on("data", (chunk) => stderr.push(String(chunk)));

  return {
    child,
    logs() {
      return {
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      };
    },
  };
}

async function stopWebServer(child) {
  if (!child?.pid) return;

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        cwd: process.cwd(),
        shell: true,
        stdio: "ignore",
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  await new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => resolve(), 5000);
  });
}

async function waitForServer(url, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for_server:${url}`);
}

function seedAsyncProjects(state) {
  const now = new Date().toISOString();
  state.projects.set("proj_async_retry", {
    id: "proj_async_retry",
    title: "Projeto com retry",
    kind: "text",
    data: {
      integrations: {
        github: {
          exports: [{ id: "gh_retry", status: "retrying", exportedAt: now }],
        },
      },
    },
    created_at: now,
    updated_at: now,
  });
  state.projects.set("proj_async_partial", {
    id: "proj_async_partial",
    title: "Projeto parcial",
    kind: "video",
    data: {
      integrations: {
        github: {
          exports: [{ id: "gh_partial", status: "partial_failure", exportedAt: now }],
        },
      },
    },
    created_at: now,
    updated_at: now,
  });
  state.projectOrder = ["proj_async_retry", "proj_async_partial", ...state.projectOrder.filter((id) => !["proj_async_retry", "proj_async_partial"].includes(id))];
}

async function createContext(browser, state) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1280 },
  });
  await attachMockApi(context, state);
  await context.addInitScript(
    ({ modeKey, readsKey, localKey }) => {
      window.localStorage.setItem(modeKey, "1");
      window.localStorage.removeItem(readsKey);
      window.localStorage.removeItem(localKey);
    },
    {
      modeKey: E2E_AUTH_MODE_KEY,
      readsKey: READ_IDS_STORAGE_KEY,
      localKey: LOCAL_NOTIFICATION_STORAGE_KEY,
    }
  );
  const page = await context.newPage();
  return { context, page };
}

async function login(page, targetPath = "/dashboard/account", email = "qa@editorai.test") {
  await page.goto(`${BASE_URL}/login?next=${encodeURIComponent(targetPath)}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Test123!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**${targetPath}`, { timeout: 90000 }).catch(() => null);
  if (!page.url().includes(targetPath)) {
    await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: "domcontentloaded" });
  }
}

async function saveCapture(page, name, report) {
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  report.captures.push(filePath);
}

const filesToCheck = {
  layout: path.join(process.cwd(), "apps", "web", "app", "layout.tsx"),
  accountRoute: path.join(process.cwd(), "apps", "web", "app", "dashboard", "account", "page.tsx"),
  provider: path.join(process.cwd(), "apps", "web", "components", "account", "AccountCenterProvider.tsx"),
  supportAssistant: path.join(process.cwd(), "apps", "web", "components", "dashboard", "SupportAssistantCard.tsx"),
};

const sourceChecks = {
  layoutHasProvider: (await fsp.readFile(filesToCheck.layout, "utf8")).includes("AccountCenterProvider"),
  layoutHasShellControls: (await fsp.readFile(filesToCheck.layout, "utf8")).includes("AppShellAccountControls"),
  accountRouteExists: fs.existsSync(filesToCheck.accountRoute),
  providerHasDrawer: (await fsp.readFile(filesToCheck.provider, "utf8")).includes("account-notification-drawer"),
  supportCreatesNotification: (await fsp.readFile(filesToCheck.supportAssistant, "utf8")).includes("pushLocalNotification"),
};

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  sourceChecks,
  checks: [],
  captures: [],
  blockingConsoleEvents: [],
  failedResponses: [],
  pageErrors: [],
  passed: false,
};

let browser;
let server;

try {
  await ensureOutputDir();
  assert.ok(Object.values(sourceChecks).every(Boolean), "source_checks_failed");

  server = startWebServer();
  await waitForServer(`${BASE_URL}/login`);

  browser = await chromium.launch({
    headless: true,
    executablePath: resolveBrowserExecutable(),
  });

  const state = createMockApiState();
  seedAsyncProjects(state);
  const { context, page } = await createContext(browser, state);

  page.on("console", (message) => {
    const text = message.text();
    if (!shouldIgnoreConsoleEvent(text)) {
      report.blockingConsoleEvents.push({ type: message.type(), text });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      report.failedResponses.push({ url: response.url(), status: response.status() });
    }
  });
  page.on("pageerror", (error) => {
    report.pageErrors.push(String(error));
  });

  await login(page);
  await page.getByRole("heading", { name: "Conta", exact: true }).waitFor({ timeout: 30000 });
  await saveCapture(page, "account-page", report);

  const asyncCards = page.locator(".account-async-card");
  const asyncCardCount = await asyncCards.count();
  report.checks.push({ name: "account_async_cards_render", count: asyncCardCount });
  assert.equal(asyncCardCount, 7);

  await page.locator(".app-account-inbox-button").click();
  await page.locator(".account-notification-drawer").waitFor({ timeout: 15000 });
  await saveCapture(page, "account-drawer-open", report);

  const drawerText = await page.locator(".account-notification-drawer").innerText();
  report.checks.push({
    name: "drawer_exposes_async_vocabulary",
    hasRetrying: drawerText.includes("Retrying"),
    hasPartial: drawerText.includes("Partially failed"),
    hasAttention: drawerText.includes("Needs attention"),
  });
  assert.equal(drawerText.includes("Retrying"), true);
  assert.equal(drawerText.includes("Partially failed"), true);
  assert.equal(drawerText.includes("Needs attention"), true);

  await page.getByRole("button", { name: "Marcar tudo como lido" }).click();
  await delay(300);
  const inboxButtonText = await page.locator(".app-account-inbox-button").innerText();
  report.checks.push({
    name: "mark_all_read_updates_shell",
    shellText: inboxButtonText,
  });
  assert.equal(inboxButtonText.includes("Tudo acompanhado"), true);

  await page.locator(".account-notification-overlay").click({ position: { x: 8, y: 8 } });
  await page.getByRole("button", { name: "Salvar preferências" }).click();
  await page.locator(".account-toast-card").filter({ hasText: "Preferências atualizadas" }).waitFor({ timeout: 20000 });
  await saveCapture(page, "account-preferences-saved", report);

  await page.goto(`${BASE_URL}/support`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Assunto").fill("Validação account center");
  await page.getByLabel("Mensagem").fill("Abrindo um caso para validar inbox e continuidade fora da tela atual.");
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  await page.getByText("Solicitação registrada", { exact: true }).waitFor({ timeout: 20000 });
  await page.locator(".account-toast-card").filter({ hasText: "Solicitação enviada" }).waitFor({ timeout: 20000 });
  await saveCapture(page, "support-local-notification", report);

  await page.locator(".app-account-inbox-button").click();
  await page.locator(".account-notification-drawer").waitFor({ timeout: 15000 });
  const supportNotificationVisible = await page.locator(".account-notification-item").filter({ hasText: "Solicitação enviada" }).count();
  report.checks.push({
    name: "support_submission_enters_notification_center",
    supportNotificationVisible,
  });
  assert.equal(supportNotificationVisible > 0, true);

  await context.close();

  report.passed =
    report.blockingConsoleEvents.length === 0 &&
    report.failedResponses.length === 0 &&
    report.pageErrors.length === 0;

  await fsp.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  if (!report.passed) {
    throw new Error("account_notifications_async_validation_failed");
  }
} catch (error) {
  report.passed = false;
  report.error = error instanceof Error ? error.message : String(error);
  if (server?.logs) {
    report.serverLogs = server.logs();
  }
  await fsp.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server?.child) await stopWebServer(server.child);
}
