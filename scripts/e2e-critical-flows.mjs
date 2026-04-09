import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { attachMockApi, createMockApiState } from "./e2e/mockAppApi.mjs";

const APP_PORT = Number(process.env.E2E_WEB_PORT || 3200 + Math.floor(Math.random() * 200));
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), "output", "validation", "critical-flows");
const REPORT_PATH = path.join(OUTPUT_DIR, "critical-flows-report.json");
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const E2E_DIST_DIR = ".next-e2e-critical";

function log(message) {
  process.stdout.write(`${message}\n`);
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
    await new Promise((resolve) => setTimeout(resolve, 500));
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

async function login(page, email = "qa@editorai.test") {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Test123!");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/dashboard", { timeout: 90000 });
}

async function selectPremiumOption(page, ariaLabel, optionLabel) {
  const nativeSelect = page.locator(`select[aria-label="${ariaLabel}"]`);
  if (await nativeSelect.count()) {
    await nativeSelect.selectOption({ label: optionLabel });
    return;
  }

  await page.getByRole("button", { name: ariaLabel }).click();
  await page.waitForFunction((label) => {
    return Array.from(document.querySelectorAll('[role="option"]')).some((node) =>
      node.textContent?.trim() === label
    );
  }, optionLabel);
  await page.evaluate((label) => {
    const option = Array.from(document.querySelectorAll('[role="option"]')).find((node) =>
      node.textContent?.trim() === label
    );
    if (!option) throw new Error(`option_not_found:${label}`);
    option.click();
  }, optionLabel);
}

async function maybeApplyInlinePrompt(page) {
  const applyButton = page.getByRole("button", { name: "Aplicar prompt" });
  if (await applyButton.count()) {
    const visible = await applyButton.first().isVisible().catch(() => false);
    if (visible) {
      await applyButton.first().click();
    }
  }
}

async function continuePlanner(page, buttonLabel) {
  const continueButton = page.getByRole("button", { name: buttonLabel });
  if (await continueButton.count()) {
    const visible = await continueButton.first().isVisible().catch(() => false);
    if (visible) {
      await continueButton.first().click();
    }
  }
}

async function saveFailureArtifact(page, name) {
  try {
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `${name}.png`),
      fullPage: true,
    });
  } catch {}
}

async function runFlow(browser, name, fn, results) {
  const state = createMockApiState();
  const { context, page } = await createContext(browser, state);

  try {
    await fn({ page, state });
    results.push({ name, ok: true });
    log(`OK  ${name}`);
  } catch (error) {
    await saveFailureArtifact(page, name);
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
    log(`FAIL ${name}`);
  } finally {
    await context.close();
  }
}

async function assertEditorHandoff(page, label) {
  await page.waitForURL("**/editor/**", { timeout: 90000 });
  await Promise.race([
    page.getByText(label, { exact: true }).waitFor({ timeout: 15000 }),
    page.getByRole("heading", { name: "Preparando o projeto salvo", exact: true }).waitFor({ timeout: 15000 }),
  ]);
}

async function testLogin({ page }) {
  await login(page);
  await page.getByRole("link", { name: /Creators Gerar base criativa com contexto/i }).waitFor();
  await page.getByRole("link", { name: /Projetos Continuidade, saída e registro/i }).waitFor();
}

async function testCreatorPostFlow({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/creators`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Creators", exact: true }).waitFor();
  await page.getByLabel("Tema do post").fill("Lançamento do beta pago controlado");
  await page.getByRole("button", { name: "Revisar plano e gerar" }).first().click();
  await continuePlanner(page, "Continuar com o post");
  await maybeApplyInlinePrompt(page);
  await page.getByText("Post pronto para revisar e salvar").waitFor();
  await page.getByRole("button", { name: /Salvar.*abrir no Editor/ }).click();
  await assertEditorHandoff(page, "Base do Creator Post carregada");
}

async function testCreatorScriptsFlow({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/creators`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Creators", exact: true }).waitFor();
  await page.locator(".creator-tab-btn").filter({ hasText: "Creator Scripts" }).first().click();
  await page.getByLabel("Tema").fill("Roteiro para explicar o produto em 60 segundos");
  await page.getByRole("button", { name: "Revisar plano e gerar" }).first().click();
  await continuePlanner(page, "Continuar com o roteiro");
  await maybeApplyInlinePrompt(page);
  await page.getByText("Roteiro pronto para revisar").waitFor();
  await page.getByRole("button", { name: /Salvar.*abrir no Editor/ }).click();
  await assertEditorHandoff(page, "Base do Creator Scripts carregada");
}

async function testCreatorClipsFlow({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/creators`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Creators", exact: true }).waitFor();
  await page.locator(".creator-tab-btn").filter({ hasText: "Creator Clips" }).first().click();
  await page.getByLabel("Tema/ideia do clipe").fill("Clipe premium mostrando o workspace em ação");
  await page.getByRole("button", { name: "Revisar plano e gerar" }).first().click();
  await continuePlanner(page, "Continuar com o clipe");
  await maybeApplyInlinePrompt(page);
  await page.getByText("Job registrado e pronto para acompanhamento").waitFor();
  await page.getByRole("button", { name: "Atualizar status" }).first().click();
  await page.locator(".creator-output-card-link").waitFor();
  await page.getByRole("button", { name: /Salvar.*abrir no Editor/ }).click();
  await assertEditorHandoff(page, "Base do Creator Clips carregada");
}

async function testPlanCheckoutFlow({ page, state }) {
  await login(page);
  await page.goto(`${BASE_URL}/plans`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Planos", exact: true }).waitFor();
  await page.getByText("Plano atual: Iniciante").waitFor();
  await page.getByRole("button", { name: "Abrir checkout seguro", exact: true }).first().waitFor();
  await page.getByText("Escolha com contexto").waitFor();
  assert.equal(state.planCode, "EDITOR_FREE");
}

async function testCreditsFlow({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/credits`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Creator Coins", exact: true }).waitFor();
  const walletSummary = page.locator(".credits-summary-card-primary .executive-value");
  await walletSummary.waitFor();
  await page.waitForFunction(() => {
    const node = document.querySelector(".credits-summary-card-primary .executive-value");
    return Boolean(node?.textContent?.includes("960 Comum"));
  });
  const initialWalletText = await walletSummary.innerText();
  assert.match(initialWalletText, /960 Comum/);
  await page.getByText("Comprar, converter e confirmar na mesma operação").waitFor();
  await page.getByText("Ledger recente de Creator Coins").waitFor();
}

async function testDashboardRoute({ page }) {
  await login(page);
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page.getByRole("link", { name: /Creators Gerar base criativa com contexto/i }).waitFor();
  await page.getByRole("link", { name: /Projetos Continuidade, saída e registro/i }).waitFor();
}

async function testProjectsRoute({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/projects`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Projetos", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Projetos" }).waitFor();
  await page.getByRole("heading", { name: "Abrir no editor" }).waitFor();
  await page.getByRole("heading", { name: /Rascunho, saída registrada e publicado/i }).waitFor();
}

async function testSupportRoute({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/support`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Suporte" }).waitFor();
  await page.getByRole("heading", { name: "Support Assistant", exact: true }).waitFor();
  await page.getByText("Perguntas frequentes", { exact: true }).waitFor();
}

async function testEditorNewRoute({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/editor/new`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Abra um projeto com contexto pronto/i }).waitFor();
  await page.getByText("Projeto de Vídeo").waitFor();
  await page.getByText("Projeto de Texto").waitFor();
}

async function testAdminRoute({ page }) {
  await login(page, "Desenvolvedordeappsai@gmail.com");
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Admin" }).waitFor();
  await page.getByText("Console operacional").waitFor();
  await page.getByRole("button", { name: "Atualizar", exact: true }).waitFor();
}

async function main() {
  await ensureOutputDir();

  const browserExecutable = resolveBrowserExecutable();
  const server = startWebServer();
  const results = [];

  try {
    await waitForServer(`${BASE_URL}/login`);
    const browser = await chromium.launch({
      executablePath: browserExecutable,
      headless: true,
    });

    try {
      await runFlow(browser, "login", testLogin, results);
      await runFlow(browser, "creator-post-editor-save-export", testCreatorPostFlow, results);
      await runFlow(browser, "creator-scripts-editor-review-export", testCreatorScriptsFlow, results);
      await runFlow(browser, "creator-clips-editor-published", testCreatorClipsFlow, results);
      await runFlow(browser, "plans-checkout-return", testPlanCheckoutFlow, results);
      await runFlow(browser, "credits-checkout-state-update", testCreditsFlow, results);
      await runFlow(browser, "dashboard-route-core-sanity", testDashboardRoute, results);
      await runFlow(browser, "projects-route-sanity", testProjectsRoute, results);
      await runFlow(browser, "support-route-sanity", testSupportRoute, results);
      await runFlow(browser, "editor-new-route-sanity", testEditorNewRoute, results);
      await runFlow(browser, "admin-route-sanity", testAdminRoute, results);
    } finally {
      await browser.close();
    }
  } finally {
    await stopWebServer(server.child);
  }

  const failed = results.filter((item) => !item.ok);
  await fs.writeFile(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        passed: failed.length === 0,
        totalFlows: results.length,
        failedFlowCount: failed.length,
        results,
      },
      null,
      2
    )
  );
  log("");
  log("E2E results:");
  for (const result of results) {
    log(`- ${result.ok ? "PASS" : "FAIL"} ${result.name}${result.ok ? "" : ` :: ${result.error}`}`);
  }

  if (failed.length) {
    throw new Error(`e2e_failed:${failed.map((item) => item.name).join(",")}`);
  }
}

main().catch((error) => {
  console.error("[e2e-critical-flows] failed", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
