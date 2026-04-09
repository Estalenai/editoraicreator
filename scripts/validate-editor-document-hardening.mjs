import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { attachMockApi, createMockApiState } from "./e2e/mockAppApi.mjs";

const APP_PORT = Number(process.env.E2E_WEB_PORT || 4700 + Math.floor(Math.random() * 120));
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), "output", "validation", "editor-document-hardening");
const REPORT_PATH = path.join(OUTPUT_DIR, "editor-document-hardening-report.json");
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const E2E_DIST_DIR = ".next-editor-document-hardening";

function shouldIgnoreConsoleEvent(message) {
  return (
    message.includes("Download the React DevTools") ||
    message.includes("[Fast Refresh]") ||
    message.includes("Input elements should have autocomplete attributes") ||
    message.includes("Password field is not contained in a form")
  );
}

function resolveBrowserExecutable() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  return candidates[0];
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
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

async function createContext(browser, state) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
  });
  await attachMockApi(context, state);
  await context.addInitScript((modeKey) => {
    window.localStorage.setItem(modeKey, "1");
  }, E2E_AUTH_MODE_KEY);
  const page = await context.newPage();
  return { context, page };
}

async function login(page, targetPath = "/dashboard", email = "qa@editorai.test") {
  await page.goto(`${BASE_URL}/login?next=${encodeURIComponent(targetPath)}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Test123!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(`**${targetPath}`, { timeout: 90000 });
}

async function saveCapture(page, name, report) {
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  report.captures.push(filePath);
}

function seedEditorProject(state) {
  const id = "proj_editor_guard";
  state.projects.set(id, {
    id,
    title: "Projeto de Texto • Hardening",
    kind: "text",
    data: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  state.projectOrder = [id, ...state.projectOrder.filter((item) => item !== id)];
  return id;
}

async function openTextEditor(page, projectId) {
  await login(page, `/editor/${projectId}`);
  await page.getByLabel("Conteúdo em edição").waitFor();
}

const sourceFile = path.join(process.cwd(), "apps", "web", "app", "editor", "[id]", "page.tsx");
const sourceText = await fs.readFile(sourceFile, "utf8");

const sourceChecks = {
  beforeUnloadGuardMounted: sourceText.includes("beforeunload"),
  localDraftRecoveryMounted: sourceText.includes("sessionStorage"),
  navigationConfirmMounted: sourceText.includes("window.confirm"),
  documentGuardUiMounted: sourceText.includes("editor-document-guard"),
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
  const { context, page } = await createContext(browser, state);

  page.on("console", (message) => {
    const text = message.text();
    if (!shouldIgnoreConsoleEvent(text)) {
      report.blockingConsoleEvents.push({ type: message.type(), text });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      report.failedResponses.push({
        url: response.url(),
        status: response.status(),
      });
    }
  });
  page.on("pageerror", (error) => {
    report.pageErrors.push(String(error));
  });

  const projectId = seedEditorProject(state);
  await openTextEditor(page, projectId);
  const editorUrl = page.url();
  const textarea = page.getByLabel("Conteúdo em edição");
  const initialText = await textarea.inputValue();
  const marker = `Documento sério ${Date.now()}`;
  const nextText = `${initialText}\n\n${marker}\nProteção contra perda de trabalho em progresso.`;
  await textarea.fill(nextText);
  await saveCapture(page, "editor-unsaved-state", report);

  const reloadPromise = page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
  const reloadDialog = await page.waitForEvent("dialog", { timeout: 10000 });
  report.checks.push({
    name: "reload_requires_beforeunload_guard",
    type: reloadDialog.type(),
    message: reloadDialog.message(),
  });
  assert.equal(reloadDialog.type(), "beforeunload");
  await reloadDialog.dismiss();
  await reloadPromise;
  await textarea.waitFor();
  await page.waitForFunction(() => window.location.pathname.startsWith("/editor/"));

  const stayClickPromise = page.getByRole("link", { name: "Projetos", exact: true }).click();
  const stayDialog = await page.waitForEvent("dialog", { timeout: 10000 });
  report.checks.push({
    name: "projects_navigation_is_blocked_when_dismissed",
    type: stayDialog.type(),
    message: stayDialog.message(),
  });
  assert.equal(stayDialog.type(), "confirm");
  await stayDialog.dismiss();
  await stayClickPromise.catch(() => null);
  await page.waitForFunction(() => window.location.pathname.startsWith("/editor/"));
  await saveCapture(page, "editor-navigation-dismissed", report);

  const leaveClickPromise = page.getByRole("link", { name: "Projetos", exact: true }).click();
  const leaveDialog = await page.waitForEvent("dialog", { timeout: 10000 });
  report.checks.push({
    name: "projects_navigation_can_leave_after_confirm",
    type: leaveDialog.type(),
    message: leaveDialog.message(),
  });
  await leaveDialog.accept();
  await leaveClickPromise.catch(() => null);
  await page.waitForURL("**/projects", { timeout: 30000 });

  await page.goto(editorUrl, { waitUntil: "domcontentloaded" });
  await page.getByText("Rascunho local recuperado", { exact: true }).waitFor({ timeout: 20000 });
  const recoveredText = await page.getByLabel("Conteúdo em edição").inputValue();
  report.checks.push({
    name: "local_draft_is_restored_after_return",
    recovered: recoveredText.includes(marker),
  });
  assert.equal(recoveredText.includes(marker), true);
  await saveCapture(page, "editor-draft-recovered", report);

  await page.getByRole("button", { name: /Salvar/ }).first().click();
  await page.getByText("Projeto sincronizado", { exact: true }).waitFor({ timeout: 30000 });
  await saveCapture(page, "editor-saved-state", report);

  let unexpectedDialog = null;
  const dialogHandler = async (dialog) => {
    unexpectedDialog = { type: dialog.type(), message: dialog.message() };
    await dialog.dismiss();
  };
  page.on("dialog", dialogHandler);
  await page.getByRole("link", { name: "Projetos", exact: true }).click();
  await page.waitForURL("**/projects", { timeout: 30000 });
  await delay(750);
  page.off("dialog", dialogHandler);

  report.checks.push({
    name: "saved_document_leaves_without_prompt",
    unexpectedDialog,
  });
  assert.equal(unexpectedDialog, null);

  await context.close();
  report.passed =
    report.blockingConsoleEvents.length === 0 &&
    report.failedResponses.length === 0 &&
    report.pageErrors.length === 0;

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  if (!report.passed) {
    throw new Error("editor_document_hardening_validation_failed");
  }
} catch (error) {
  report.passed = false;
  report.error = error instanceof Error ? error.message : String(error);
  if (server?.logs) {
    report.serverLogs = server.logs();
  }
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server?.child) await stopWebServer(server.child);
}
