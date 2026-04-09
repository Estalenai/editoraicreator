import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const APP_PORT = Number(process.env.PUBLIC_FOUNDATION_PORT || 3400 + Math.floor(Math.random() * 200));
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), "output", "validation", "public-launch-foundation");
const REPORT_PATH = path.join(OUTPUT_DIR, "public-launch-foundation-report.json");
const SERVER_LOG_PATH = path.join(OUTPUT_DIR, "public-launch-foundation-server.log");
const DIST_DIR = ".next-public-launch-foundation";

const REQUIRED_ROUTES = [
  { path: "/", title: "A mesma peça vai do creator à saída." },
  { path: "/login", title: "Entre no núcleo criativo" },
  { path: "/how-it-works", title: "Como funciona" },
  { path: "/termos", title: "Regras base de uso do Editor AI Creator" },
  { path: "/privacidade", title: "Como tratamos dados nesta fase" },
  { path: "/transparencia-ia", title: "O que a IA faz, o que não faz e onde pode falhar" },
  { path: "/uso-aceitavel", title: "O que não pode acontecer dentro da plataforma" },
  { path: "/cancelamento-e-reembolso", title: "Como tratamos assinatura, cancelamento e ajustes financeiros hoje" },
  { path: "/como-operamos", title: "Camada pública de operação do produto" },
];

function resolveBrowserExecutable() {
  return "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
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
            NEXT_DIST_DIR: DIST_DIR,
          },
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn("pnpm", ["-C", "apps/web", "exec", "next", "dev", "--turbo", "-p", String(APP_PORT)], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NEXT_DIST_DIR: DIST_DIR,
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

async function runChecks(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  const page = await context.newPage();
  const checks = [];
  const captures = [];

  for (const route of REQUIRED_ROUTES) {
    const response = await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
    assert(response, `missing_response:${route.path}`);
    assert.equal(response.status(), 200, `unexpected_status:${route.path}:${response.status()}`);
    await page.getByRole("heading", { name: route.title, exact: true }).waitFor({ timeout: 45000 });
    checks.push({ name: `route_ok:${route.path}`, status: response.status() });
  }

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  for (const label of [
    "Termos de uso",
    "Privacidade",
    "Transparência de IA",
    "Uso aceitável",
    "Cancelamento e reembolso",
    "Como operamos",
  ]) {
    await page.getByRole("link", { name: label, exact: true }).first().waitFor({ timeout: 30000 });
  }
  const homeCapture = path.join(OUTPUT_DIR, "home-public-foundation-1440.png");
  await page.screenshot({ path: homeCapture, fullPage: true });
  captures.push(homeCapture);

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: "Privacidade", exact: true }).first().waitFor({ timeout: 30000 });
  const loginCapture = path.join(OUTPUT_DIR, "login-public-foundation-1440.png");
  await page.screenshot({ path: loginCapture, fullPage: true });
  captures.push(loginCapture);

  await context.close();
  return { checks, captures };
}

async function readSourceChecks() {
  const readme = await fs.readFile(path.join(process.cwd(), "README.md"), "utf8");
  const runbook = await fs.readFile(path.join(process.cwd(), "docs", "launch-runbook.md"), "utf8");

  return {
    readmeHasPublicRoutes: readme.includes("/termos") && readme.includes("/como-operamos"),
    readmeHasLaunchValidation: readme.includes("validate-accessibility-base") && readme.includes("e2e-critical-flows"),
    runbookHasDeploy: runbook.includes("## 3. Deploy"),
    runbookHasRollback: runbook.includes("## 5. Rollback"),
    runbookHasIncidentResponse: runbook.includes("## 6. Resposta inicial a incidente"),
  };
}

async function main() {
  await ensureOutputDir();
  const sourceChecks = await readSourceChecks();
  const browserExecutable = resolveBrowserExecutable();
  const server = startWebServer();

  try {
    await waitForServer(`${BASE_URL}/`);
    const browser = await chromium.launch({
      executablePath: browserExecutable,
      headless: true,
    });

    let results;
    try {
      results = await runChecks(browser);
    } finally {
      await browser.close();
    }

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      sourceChecks,
      checks: results.checks,
      captures: results.captures,
      passed: Object.values(sourceChecks).every(Boolean) && results.checks.every((item) => item.status === 200),
    };

    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  } finally {
    const logs = server.logs();
    await fs.writeFile(SERVER_LOG_PATH, `${logs.stdout}\n${logs.stderr}`);
    await stopWebServer(server.child);
  }
}

main().catch(async (error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    passed: false,
    error: error instanceof Error ? error.message : String(error),
  };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  process.exit(1);
});
