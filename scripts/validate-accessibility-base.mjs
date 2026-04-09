import assert from "node:assert/strict";
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
const outputDir = path.join(rootDir, "output", "validation", "accessibility-base");
const port = 4460 + Math.floor(Math.random() * 120);
const baseUrl = `http://127.0.0.1:${port}`;
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const E2E_BUILD_FLAG = "NEXT_PUBLIC_E2E_AUTH_MODE";
const E2E_DIST_DIR = ".next-accessibility-base";

fs.mkdirSync(outputDir, { recursive: true });

function createLogBuffer(prefix) {
  const lines = [];
  return {
    push(chunk) {
      const text = String(chunk || "").trim();
      if (!text) return;
      for (const line of text.split(/\r?\n/).filter(Boolean).slice(-100)) {
        lines.push(`${prefix}${line}`);
      }
      if (lines.length > 240) lines.splice(0, lines.length - 240);
    },
    dump() {
      return lines.join("\n");
    },
  };
}

async function waitForHttpReady(url, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`timeout_waiting_for:${url}`);
}

async function stopChild(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await delay(1000);
  if (child.exitCode != null) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

function parseRgb(color) {
  const match = String(color || "").match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((value) => !Number.isFinite(value))) return null;
  return {
    r: parts[0],
    g: parts[1],
    b: parts[2],
    a: Number.isFinite(parts[3]) ? parts[3] : 1,
  };
}

function relativeLuminance({ r, g, b }) {
  const normalize = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
}

function contrastRatio(foreground, background) {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function createContext(browser, reducedMotion = "no-preference") {
  const state = createMockApiState();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    reducedMotion,
  });
  await attachMockApi(context, state);
  await context.addInitScript((modeKey) => {
    window.localStorage.setItem(modeKey, "1");
  }, E2E_AUTH_MODE_KEY);
  const page = await context.newPage();
  return { context, page };
}

async function login(page, email = "qa@editorai.test") {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Test123!");
  await page.locator('button[type="submit"]').click();
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  await page.waitForFunction(() => window.location.pathname === "/dashboard");
}

async function countVisibleHeadings(page) {
  return page.locator("h1:visible").count();
}

const sourceChecks = {
  skipLinkMountedInLayout: /href="#app-main-content"/.test(
    fs.readFileSync(path.join(webDir, "app", "layout.tsx"), "utf8")
  ),
  mainTargetFocusable: /id="app-main-content"/.test(
    fs.readFileSync(path.join(webDir, "app", "layout.tsx"), "utf8")
  ),
  skipLinkStyled: /\.app-skip-link/.test(fs.readFileSync(path.join(webDir, "app", "globals.css"), "utf8")),
  reducedMotionStylesExist: /@media \(prefers-reduced-motion: reduce\)/.test(
    fs.readFileSync(path.join(webDir, "app", "globals.css"), "utf8")
  ),
  loginUsesButtonGroupNotTabs: !/role="tablist"|role="tab"|aria-selected=/.test(
    fs.readFileSync(path.join(webDir, "app", "(auth)", "login", "page.tsx"), "utf8")
  ),
  creditsPurchaseModeUsesButtonGroupNotTabs: !/role="tablist"|role="tab"|aria-selected=/.test(
    fs.readFileSync(path.join(webDir, "components", "dashboard", "CreditsPackagesCard.tsx"), "utf8")
  ),
};

const stdoutLogs = createLogBuffer("[web] ");
const stderrLogs = createLogBuffer("[web:err] ");

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
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
  assert.ok(Object.values(sourceChecks).every(Boolean), "source_checks_failed");
  server =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/c", "pnpm", "-C", "apps/web", "exec", "next", "dev", "--turbo", "-p", String(port)], {
          cwd: rootDir,
          env: { ...process.env, [E2E_BUILD_FLAG]: "1", NEXT_DIST_DIR: E2E_DIST_DIR },
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn("pnpm", ["-C", "apps/web", "exec", "next", "dev", "--turbo", "-p", String(port)], {
          cwd: rootDir,
          env: { ...process.env, [E2E_BUILD_FLAG]: "1", NEXT_DIST_DIR: E2E_DIST_DIR },
          stdio: ["ignore", "pipe", "pipe"],
        });

  server.stdout.on("data", (chunk) => stdoutLogs.push(chunk));
  server.stderr.on("data", (chunk) => stderrLogs.push(chunk));

  await waitForHttpReady(`${baseUrl}/login`);

  browser = await chromium.launch({ headless: true });

  {
    const { context, page } = await createContext(browser);

    page.on("console", (message) => {
      const text = message.text();
      if (!text.includes("Download the React DevTools") && !text.includes("[Fast Refresh]")) {
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

    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Entre no núcleo criativo" }).waitFor();
    assert.equal(await countVisibleHeadings(page), 1);
    await page.keyboard.press("Tab");
    const skipLinkInfo = await page.evaluate(() => {
      const active = document.activeElement;
      const style = active ? window.getComputedStyle(active) : null;
      return {
        text: active?.textContent?.trim() || "",
        className: active?.className || "",
        boxShadow: style?.boxShadow || "",
      };
    });
    report.checks.push({
      name: "skip_link_is_first_keyboard_stop",
      text: skipLinkInfo.text,
      className: skipLinkInfo.className,
      focusVisible: skipLinkInfo.boxShadow !== "none",
    });
    assert.equal(skipLinkInfo.text, "Pular para o conteúdo");
    assert.notEqual(skipLinkInfo.boxShadow, "none");
    await page.keyboard.press("Enter");
    const mainTargetId = await page.evaluate(() => document.activeElement?.id || "");
    report.checks.push({
      name: "skip_link_moves_focus_to_main",
      activeId: mainTargetId,
    });
    assert.equal(mainTargetId, "app-main-content");

    const loginSemantics = {
      emailVisible: await page.getByLabel("E-mail").isVisible(),
      passwordVisible: await page.getByLabel("Senha").isVisible(),
      submitVisible: await page.locator('button[type="submit"]').isVisible(),
    };
    report.checks.push({
      name: "login_has_labeled_controls",
      ...loginSemantics,
    });
    assert.equal(loginSemantics.emailVisible, true);
    assert.equal(loginSemantics.passwordVisible, true);
    assert.equal(loginSemantics.submitVisible, true);

    const loginContrast = await page.locator("h1").evaluate((element) => {
      function parse(color) {
        const match = String(color || "").match(/rgba?\(([^)]+)\)/i);
        if (!match) return null;
        const parts = match[1].split(",").map((part) => Number(part.trim()));
        return { r: parts[0], g: parts[1], b: parts[2] };
      }

      function findBackground(node) {
        let current = node;
        while (current) {
          const style = window.getComputedStyle(current);
          const parsed = parse(style.backgroundColor);
          if (parsed && !(parsed.r === 0 && parsed.g === 0 && parsed.b === 0 && style.backgroundColor.includes(", 0"))) {
            return style.backgroundColor;
          }
          current = current.parentElement;
        }
        return "rgb(8, 16, 30)";
      }

      return {
        color: window.getComputedStyle(element).color,
        backgroundColor: findBackground(element),
      };
    });

    const foreground = parseRgb(loginContrast.color);
    const background = parseRgb(loginContrast.backgroundColor);
    const ratio = foreground && background ? Number(contrastRatio(foreground, background).toFixed(2)) : 0;
    report.checks.push({
      name: "login_primary_heading_has_basic_contrast",
      ratio,
    });
    assert.ok(ratio >= 4.5);

    const loginShot = path.join(outputDir, "login-keyboard-1440.png");
    await page.screenshot({ path: loginShot, fullPage: true });
    report.captures.push(path.relative(rootDir, loginShot).replaceAll("\\", "/"));

    await context.close();
  }

  for (const item of [
    { route: "/dashboard", heading: "Dashboard" },
    { route: "/creators", heading: "Creators" },
    { route: "/projects", heading: "Projetos" },
    { route: "/credits", heading: "Creator Coins" },
    { route: "/support", heading: "Suporte" },
    { route: "/editor/new", heading: "Abra um projeto com contexto pronto" },
  ]) {
    const { context, page } = await createContext(browser);
    await login(page);
    await page.goto(`${baseUrl}${item.route}`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: item.heading, exact: true }).waitFor();
    const visibleH1Count = await countVisibleHeadings(page);
    report.checks.push({
      name: `route_has_single_h1:${item.route}`,
      visibleH1Count,
    });
    assert.equal(visibleH1Count, 1);
    await context.close();
  }

  {
    const { context, page } = await createContext(browser);
    await login(page, "Desenvolvedordeappsai@gmail.com");
    await page.goto(`${baseUrl}/admin`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Admin", exact: true }).waitFor();
    const visibleH1Count = await countVisibleHeadings(page);
    report.checks.push({
      name: "admin_has_single_h1_when_authorized",
      visibleH1Count,
    });
    assert.equal(visibleH1Count, 1);
    await context.close();
  }

  {
    const { context, page } = await createContext(browser, "reduce");
    await login(page);
    await page.goto(`${baseUrl}/creators`, { waitUntil: "networkidle" });
    await delay(400);
    const reducedMotionSnapshot = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("[data-reveal]")).slice(0, 10);
      return items.map((item) => {
        const style = window.getComputedStyle(item);
        return {
          opacity: style.opacity,
          transform: style.transform,
          animationDuration: style.animationDuration,
          transitionDuration: style.transitionDuration,
        };
      });
    });

    const reducedMotionValid = reducedMotionSnapshot.every(
      (item) =>
        item.opacity === "1" &&
        (item.transform === "none" || item.transform === "matrix(1, 0, 0, 1, 0, 0)")
    );

    report.checks.push({
      name: "reduced_motion_disables_reveal_displacement",
      reducedMotionValid,
      sampleCount: reducedMotionSnapshot.length,
    });
    assert.equal(reducedMotionValid, true);

    const reducedMotionShot = path.join(outputDir, "creators-reduced-motion-1440.png");
    await page.screenshot({ path: reducedMotionShot, fullPage: true });
    report.captures.push(path.relative(rootDir, reducedMotionShot).replaceAll("\\", "/"));
    await context.close();
  }

  assert.equal(report.failedResponses.length, 0);
  assert.equal(report.blockingConsoleEvents.length, 0);
  assert.equal(report.pageErrors.length, 0);
  report.passed = true;
} catch (error) {
  report.error = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(path.join(outputDir, "accessibility-base-report.json"), JSON.stringify(report, null, 2));
  const logs = [stdoutLogs.dump(), stderrLogs.dump()].filter(Boolean).join("\n");
  if (logs) {
    fs.writeFileSync(path.join(outputDir, "accessibility-base-server.log"), logs, "utf8");
  }
  if (browser) await browser.close();
  await stopChild(server);
  process.exit(process.exitCode || 0);
}
