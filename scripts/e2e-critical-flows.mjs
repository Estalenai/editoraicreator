import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { attachMockApi, createMockApiState } from "./e2e/mockAppApi.mjs";

const APP_PORT = Number(process.env.E2E_WEB_PORT || 3200 + Math.floor(Math.random() * 200));
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), "output", "playwright");
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const E2E_BUILD_FLAG = "NEXT_PUBLIC_E2E_AUTH_MODE";

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

async function runWebBuild() {
  await new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["-C", "apps/web", "exec", "next", "build"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        [E2E_BUILD_FLAG]: "1",
      },
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`next_build_failed:${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
}

function startWebServer() {
  const child = spawn("pnpm", ["-C", "apps/web", "exec", "next", "start", "-p", String(APP_PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_E2E_AUTH_MODE: "1",
    },
    shell: process.platform === "win32",
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

async function waitForServer(url, timeoutMs = 30000) {
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
  await page.waitForURL("**/dashboard");
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
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

async function testLogin({ page }) {
  await login(page);
  await page.getByText("Plano: Iniciante").waitFor();
  await page.getByText("Saldo total").waitFor();
}

async function testCreatorPostFlow({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/creators`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Tema do post").fill("Lançamento do beta pago controlado");
  await page.getByRole("button", { name: "Revisar plano e gerar" }).first().click();
  await continuePlanner(page, "Continuar com o post");
  await maybeApplyInlinePrompt(page);
  await page.getByText("Post pronto para revisar e salvar").waitFor();
  await page.getByRole("button", { name: /Salvar.*abrir no Editor/ }).click();
  await page.waitForURL("**/editor/**");

  const editorText = page.locator("textarea.editor-shell-textarea").first();
  await editorText.waitFor();
  assert.match(await editorText.inputValue(), /Gancho direto/i);

  await page.getByRole("button", { name: /Salvar/ }).first().click();
  await page.getByText("Projeto salvo", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Registrar exported" }).click();
  await page.getByText("Exportação registrada", { exact: true }).last().waitFor();
}

async function testCreatorScriptsFlow({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/creators`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Creator Scripts/ }).click();
  await page.getByLabel("Tema").fill("Roteiro para explicar o produto em 60 segundos");
  await page.getByRole("button", { name: "Revisar plano e gerar" }).first().click();
  await continuePlanner(page, "Continuar com o roteiro");
  await maybeApplyInlinePrompt(page);
  await page.getByText("Roteiro pronto para revisar").waitFor();
  await page.getByRole("button", { name: /Salvar.*abrir no Editor/ }).click();
  await page.waitForURL("**/editor/**");

  const editorText = page.locator("textarea.editor-shell-textarea").first();
  await editorText.waitFor();
  assert.match(await editorText.inputValue(), /Você está travando/i);

  await page.getByRole("tab", { name: "Biblioteca IA" }).click();
  await page.getByLabel("Afirmação para verificar").fill("O roteiro está pronto para revisão.");
  await page.getByRole("button", { name: "Verificar" }).click();
  await page.getByText("Veredito", { exact: true }).waitFor();

  await page.getByRole("button", { name: /Salvar/ }).first().click();
  await page.getByText("Projeto salvo", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Marcar roteiro pronto para revisão/ }).click();
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll("button")).find((node) =>
      node.textContent?.trim() === "Registrar exported"
    );
    return Boolean(button && !button.hasAttribute("disabled"));
  });
  await page.getByRole("button", { name: "Registrar exported" }).click();
  await page.getByText("Exportação registrada", { exact: true }).last().waitFor();
}

async function testCreatorClipsFlow({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/creators`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Creator Clips/ }).click();
  await page.getByLabel("Tema/ideia do clipe").fill("Clipe premium mostrando o workspace em ação");
  await page.getByRole("button", { name: "Revisar plano e gerar" }).first().click();
  await continuePlanner(page, "Continuar com o clipe");
  await maybeApplyInlinePrompt(page);
  await page.getByText("Job registrado e pronto para acompanhamento").waitFor();
  await page.getByRole("button", { name: "Atualizar status" }).first().click();
  await page.locator(".creator-output-card-link").waitFor();
  await page.getByRole("button", { name: /Salvar.*abrir no Editor/ }).click();
  await page.waitForURL("**/editor/**");

  const projectId = new URL(page.url()).pathname.split("/").pop();
  await selectPremiumOption(page, "Status básico do deploy", "Publicado (manual)");
  await page.waitForFunction(() => {
    const trigger = Array.from(document.querySelectorAll("button")).find((node) =>
      node.getAttribute("aria-label") === "Status básico do deploy"
    );
    return Boolean(trigger?.textContent?.includes("Publicado"));
  });
  await page.getByRole("button", { name: /Salvar base Vercel|Atualizar base local/ }).click();
  await page.getByText("Base salva").waitFor();
  const storedDeployStatus = await page.evaluate((currentProjectId) => {
    const raw = window.localStorage.getItem("ea:vercel:workspace:v1");
    if (!raw) return null;
    const workspace = JSON.parse(raw);
    return workspace?.projectBindings?.[currentProjectId]?.deployStatus || null;
  }, projectId);
  assert.equal(storedDeployStatus, "published");
}

async function testPlanCheckoutFlow({ page, state }) {
  await login(page);
  await page.goto(`${BASE_URL}/plans`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Abrir checkout seguro/ }).first().click();
  await page.waitForURL("**/plans?checkout=success");
  await page.getByText("Plano atual: Editor Pro").waitFor();
  assert.equal(state.planCode, "EDITOR_PRO");
}

async function testCreditsFlow({ page }) {
  await login(page);
  await page.goto(`${BASE_URL}/credits`, { waitUntil: "domcontentloaded" });
  const walletSummary = page.locator(".credits-summary-card-primary .executive-value");
  await walletSummary.waitFor();
  await page.waitForFunction(() => {
    const node = document.querySelector(".credits-summary-card-primary .executive-value");
    return Boolean(node?.textContent?.includes("960 Comum"));
  });
  const initialWalletText = await walletSummary.innerText();
  assert.match(initialWalletText, /960 Comum/);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/coins/convert") && response.ok()),
    page.getByRole("button", { name: "Converter créditos" }).click(),
  ]);
  await page.getByText("Conversão concluída").waitFor();
  await page.waitForFunction(() => {
    const node = document.querySelector(".credits-summary-card-primary .executive-value");
    return Boolean(node?.textContent?.includes("949 Comum"));
  });
  assert.equal(await walletSummary.innerText(), "949 Comum • 130 Pro • 24 Ultra");
  await page.getByText("Conversão de créditos").waitFor();
}

async function main() {
  await ensureOutputDir();
  await runWebBuild();

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
    } finally {
      await browser.close();
    }
  } finally {
    await stopWebServer(server.child);
  }

  const failed = results.filter((item) => !item.ok);
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
