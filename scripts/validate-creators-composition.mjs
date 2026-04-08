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
const creatorsPagePath = path.join(webDir, "app", "creators", "page.tsx");
const globalsPath = path.join(webDir, "app", "globals.css");
const outputDir = path.join(rootDir, "output", "validation", "creators-composition");
const nextBinCandidates = [
  path.join(webDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(rootDir, "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextBinCandidates.find((candidate) => fs.existsSync(candidate));
const E2E_AUTH_MODE_KEY = "__editor_ai_creator_e2e_auth_mode";
const port = 4720 + Math.floor(Math.random() * 120);
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
  const now = new Date("2026-04-08T17:50:00.000Z").toISOString();
  state.planCode = "EDITOR_PRO";
  state.wallet = {
    common: 1280,
    pro: 174,
    ultra: 34,
    updated_at: now,
  };
  state.usageItems = [
    { feature: "creator_post", used: 12, limit: 40 },
    { feature: "creator_scripts", used: 9, limit: 30 },
    { feature: "creator_clips", used: 4, limit: 12 },
  ];

  const projects = [
    {
      id: "proj_creators_1",
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
      id: "proj_creators_2",
      title: "Roteiro de aquisição",
      kind: "script",
      updated_at: "2026-04-08T13:24:00.000Z",
      created_at: "2026-04-07T09:00:00.000Z",
      data: {
        version: "project.v2",
        delivery: { stage: "exported" },
      },
    },
  ];

  for (const project of projects) {
    state.projects.set(project.id, project);
    state.projectOrder.push(project.id);
  }
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

function filterBlockingConsoleEvents(events) {
  return events.filter((event) => {
    const text = String(event.text || "");
    return !(
      text.includes("Download the React DevTools") ||
      text.includes("[Fast Refresh]") ||
      text.includes("Route changed") ||
      (text.includes("Prop `%s` did not match") && text.includes("is-visible")) ||
      (text.includes("Extra attributes from the server") && text.includes("data-reveal-bound"))
    );
  });
}

async function captureCreators(page, width, height) {
  const routeDir = path.join(outputDir, "creators");
  fs.mkdirSync(routeDir, { recursive: true });

  const consoleEvents = [];
  const pageErrors = [];
  const failingResponses = [];

  const onConsole = (message) => {
    consoleEvents.push({ type: message.type(), text: message.text() });
  };
  const onPageError = (error) => {
    pageErrors.push(String(error));
  };
  const onResponse = (response) => {
    if (response.status() >= 500) {
      failingResponses.push({
        status: response.status(),
        url: response.url(),
      });
    }
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  try {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}/creators?tab=post`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(".creators-page", { timeout: 30000 });
    await page.screenshot({
      path: path.join(routeDir, `creators-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });

    const supplementalScreenshots = [];
    if (width === 1440) {
      await page.locator(".creators-hero-core-section .focus-shell-toggle").click();
      await page.waitForTimeout(180);
      const showcasePath = path.join(routeDir, "creators-showcase-1440.png");
      await page.screenshot({ path: showcasePath, fullPage: true, animations: "disabled" });
      supplementalScreenshots.push(path.relative(rootDir, showcasePath).replaceAll("\\", "/"));

      await page.locator(".creators-secondary-section .focus-shell-toggle").click();
      await page.waitForTimeout(180);
      const catalogPath = path.join(routeDir, "creators-catalog-1440.png");
      await page.screenshot({ path: catalogPath, fullPage: true, animations: "disabled" });
      supplementalScreenshots.push(path.relative(rootDir, catalogPath).replaceAll("\\", "/"));

      await page.locator(".creator-workspace-shell .focus-shell-toggle").click();
      await page.waitForTimeout(180);
    }

    const metrics = await page.evaluate(({ viewportWidth }) => {
      function collect(selector) {
        return Array.from(document.querySelectorAll(selector)).map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            width: Number(rect.width.toFixed(2)),
            height: Number(rect.height.toFixed(2)),
            top: Number(rect.top.toFixed(2)),
            left: Number(rect.left.toFixed(2)),
            right: Number(rect.right.toFixed(2)),
            bottom: Number(rect.bottom.toFixed(2)),
          };
        });
      }

      function summarize(selector) {
        const rects = collect(selector);
        if (rects.length === 0) return { count: 0, rects: [] };
        const heights = rects.map((item) => item.height);
        const widths = rects.map((item) => item.width);
        return {
          count: rects.length,
          rects,
          minHeight: Math.min(...heights),
          maxHeight: Math.max(...heights),
          heightSpread: Number((Math.max(...heights) - Math.min(...heights)).toFixed(2)),
          minWidth: Math.min(...widths),
          maxWidth: Math.max(...widths),
        };
      }

      return {
        viewportWidth,
        headings: Array.from(document.querySelectorAll(".creators-page h1, .creators-page h2"))
          .map((node) => node.textContent?.trim())
          .filter(Boolean),
        groups: {
          hero: summarize(".creators-hero-split > *"),
          proof: summarize(".proof-value-grid-creators > *"),
          showcase: summarize(".creators-hero-core-grid > *"),
          catalog: summarize(".creators-secondary-grid > *"),
          workspace: summarize(".creator-workspace-grid > *"),
          workspaceStack: summarize(".creator-workspace-main-stack > *"),
        },
      };
    }, { viewportWidth: width });

    const overlapWarnings = [];
    for (const [groupName, groupMetrics] of Object.entries(metrics.groups)) {
      if (!groupMetrics?.rects || groupMetrics.rects.length < 2) continue;
      for (let index = 0; index < groupMetrics.rects.length; index += 1) {
        for (let compareIndex = index + 1; compareIndex < groupMetrics.rects.length; compareIndex += 1) {
          if (rectOverlap(groupMetrics.rects[index], groupMetrics.rects[compareIndex])) {
            overlapWarnings.push({ groupName, index, compareIndex });
          }
        }
      }
    }

    const blockingConsoleEvents = filterBlockingConsoleEvents(consoleEvents);

    return {
      width,
      height,
      consoleEvents,
      blockingConsoleEvents,
      pageErrors,
      failingResponses,
      overlapWarnings,
      metrics,
      screenshot: path.relative(rootDir, path.join(routeDir, `creators-${width}.png`)).replaceAll("\\", "/"),
      supplementalScreenshots,
    };
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}

fs.mkdirSync(outputDir, { recursive: true });

const pageSource = fs.readFileSync(creatorsPagePath, "utf8");
const css = fs.readFileSync(globalsPath, "utf8");

const sourceChecks = {
  coreCanvasMarkup: pageSource.includes('className="creators-core-canvas layout-contract-region"'),
  proofPrimaryClass: pageSource.includes("creators-proof-card-primary"),
  showcaseGroupData: pageSource.includes("data-group={tab.group}"),
  workspaceMainStackMarkup: pageSource.includes('className="creator-workspace-main-stack"'),
  coreCanvasCss: css.includes(".creators-page .creators-core-canvas"),
  proofTwelveColGrid: css.includes(".creators-page .proof-value-grid-creators") && css.includes("grid-template-columns: repeat(12, minmax(0, 1fr));"),
  showcaseSupportSpan: css.includes('.creators-page .creators-hero-core-card[data-group="secondary"]'),
  workspaceMainStackCss: css.includes(".creators-page .creator-workspace-main-stack"),
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
  await context.route("**/api/plans/catalog**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ plans: [] }),
    });
  });
  await context.addInitScript((modeKey) => {
    window.localStorage.setItem(modeKey, "1");
  }, E2E_AUTH_MODE_KEY);

  const page = await context.newPage();
  await login(page);

  const captures = [];
  for (const viewport of [
    { width: 1440, height: 1200 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ]) {
    captures.push(await captureCreators(page, viewport.width, viewport.height));
  }

  const blockingConsoleEventCount = captures.reduce(
    (sum, capture) => sum + capture.blockingConsoleEvents.length,
    0
  );
  const overlapCount = captures.reduce((sum, capture) => sum + capture.overlapWarnings.length, 0);

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    authMode: "e2e_mock",
    sourceChecks,
    captures,
    blockingConsoleEventCount,
    overlapCount,
    pageErrors: captures.flatMap((capture) => capture.pageErrors),
    passed:
      Object.values(sourceChecks).every(Boolean) &&
      blockingConsoleEventCount === 0 &&
      overlapCount === 0 &&
      captures.every((capture) => capture.pageErrors.length === 0),
  };

  fs.writeFileSync(
    path.join(outputDir, "creators-composition-report.json"),
    JSON.stringify(report, null, 2)
  );

  if (!report.passed) {
    throw new Error("creators_composition_validation_failed");
  }

  console.log(
    `Creators composition validation OK. Report: ${path.join(outputDir, "creators-composition-report.json")}`
  );
} catch (error) {
  const errorReport = {
    error: String(error),
    webStdout: webStdout.dump(),
    webStderr: webStderr.dump(),
  };
  fs.writeFileSync(
    path.join(outputDir, "creators-composition-error.json"),
    JSON.stringify(errorReport, null, 2)
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await stopChild(webServer);
}
