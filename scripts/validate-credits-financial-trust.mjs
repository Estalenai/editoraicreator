import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const apiDir = path.join(rootDir, "apps", "api");
const webDir = path.join(rootDir, "apps", "web");
const buildDir = path.join(webDir, ".next");
const outputDir = path.join(rootDir, "output", "validation", "credits-financial-trust");
const apiStartPath = path.join(apiDir, "start.js");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const apiPort = 3700 + Math.floor(Math.random() * 80);
const webPort = 4800 + Math.floor(Math.random() * 120);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const baseUrl = `http://127.0.0.1:${webPort}`;
const validationEmail = String(process.env.VALIDATION_EMAIL || "").trim();
const validationPassword = String(process.env.VALIDATION_PASSWORD || "").trim();
const creditsPagePath = path.join(rootDir, "apps", "web", "app", "credits", "page.tsx");
const creditsCardPath = path.join(rootDir, "apps", "web", "components", "dashboard", "CreditsPackagesCard.tsx");
const cssPath = path.join(rootDir, "apps", "web", "app", "globals.css");

if (!fs.existsSync(buildDir)) throw new Error("web_build_missing: run `pnpm -C apps/web build` first.");
if (!fs.existsSync(apiStartPath)) throw new Error("api_start_missing");
if (!nextBin) throw new Error("next_bin_missing");
if (!validationEmail || !validationPassword) throw new Error("validation_credentials_missing");

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-30)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 120) lines.splice(0, lines.length - 120);
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

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 45000 });
  await page.getByLabel("E-mail").fill(validationEmail);
  await page.getByLabel("Senha").fill(validationPassword);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30000 });
}

async function captureRoute(page, width, height) {
  const routeDir = path.join(outputDir, "credits");
  fs.mkdirSync(routeDir, { recursive: true });
  const consoleEvents = [];
  const pageErrors = [];

  const onConsole = (message) => consoleEvents.push({ type: message.type(), text: message.text() });
  const onPageError = (error) => pageErrors.push(String(error));

  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}/credits`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(".credits-page", { timeout: 30000 });
    await page.screenshot({
      path: path.join(routeDir, `credits-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    const bodyText = await page.locator("body").innerText();
    fs.writeFileSync(path.join(routeDir, `credits-${width}.txt`), bodyText, "utf8");
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
  }

  return {
    viewport: { width, height },
    screenshot: path.join(routeDir, `credits-${width}.png`),
    textDump: path.join(routeDir, `credits-${width}.txt`),
    consoleEvents,
    pageErrors,
  };
}

fs.mkdirSync(outputDir, { recursive: true });

const creditsPageSource = fs.readFileSync(creditsPagePath, "utf8");
const creditsCardSource = fs.readFileSync(creditsCardPath, "utf8");
const cssSource = fs.readFileSync(cssPath, "utf8");

const sourceChecks = {
  creditsReceiptLayer:
    creditsPageSource.includes("Recibo e conciliação") &&
    creditsPageSource.includes("Ledger recente de") &&
    creditsPageSource.includes("Revalidar saldo e histórico"),
  creditsPurchaseReceipt:
    creditsCardSource.includes("Recibo antes do pagamento") &&
    creditsCardSource.includes("Processamento: Stripe Checkout com retorno para conciliação em Créditos"),
  creditsFinancialTrustCss: cssSource.includes("Financial trust reinforcement for credits"),
};

const apiStdout = createLogBuffer("[api] ");
const apiStderr = createLogBuffer("[api:err] ");
const webStdout = createLogBuffer("[web] ");
const webStderr = createLogBuffer("[web:err] ");

const apiServer = spawn(process.execPath, [apiStartPath], {
  cwd: apiDir,
  env: { ...process.env, NODE_ENV: "development", PORT: String(apiPort) },
  stdio: ["ignore", "pipe", "pipe"],
});
apiServer.stdout.on("data", (chunk) => apiStdout.push(chunk));
apiServer.stderr.on("data", (chunk) => apiStderr.push(chunk));

const webServer = spawn(process.execPath, [nextBin, "start", "-p", String(webPort)], {
  cwd: webDir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
    API_BASE_URL: apiBaseUrl,
    APP_BASE_URL: apiBaseUrl,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
webServer.stdout.on("data", (chunk) => webStdout.push(chunk));
webServer.stderr.on("data", (chunk) => webStderr.push(chunk));

let browser;

try {
  await waitForHttpReady(`${apiBaseUrl}/health`);
  await waitForHttpReady(`${baseUrl}/login`);

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);

  const captures = [];
  for (const viewport of [
    { width: 1440, height: 1024 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    captures.push(await captureRoute(page, viewport.width, viewport.height));
  }

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    apiBaseUrl,
    sourceChecks,
    captures,
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      captures.every((capture) => capture.pageErrors.length === 0),
  };

  fs.writeFileSync(path.join(outputDir, "credits-financial-trust-report.json"), JSON.stringify(report, null, 2));
  if (!report.passed) {
    throw new Error("credits_financial_trust_validation_failed");
  }

  console.log(`Credits financial trust validation OK. Report: ${path.join(outputDir, "credits-financial-trust-report.json")}`);
} catch (error) {
  fs.writeFileSync(
    path.join(outputDir, "credits-financial-trust-error.json"),
    JSON.stringify(
      {
        error: String(error),
        apiStdout: apiStdout.dump(),
        apiStderr: apiStderr.dump(),
        webStdout: webStdout.dump(),
        webStderr: webStderr.dump(),
      },
      null,
      2
    )
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(webServer);
  await stopChild(apiServer);
}
