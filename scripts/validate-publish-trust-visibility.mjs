import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const repoRoot = process.cwd();
const typescriptPath = path.join(repoRoot, "apps/web/node_modules/typescript/lib/typescript.js");
const ts = await import(`file:///${typescriptPath.replace(/\\/g, "/")}`);
const helperPath = path.join(repoRoot, "apps/web/components/projects/publishTrust.ts");
const componentPaths = [
  path.join(repoRoot, "apps/web/components/projects/PublishConfidenceState.tsx"),
  path.join(repoRoot, "apps/web/components/projects/GitHubWorkspaceCard.tsx"),
  path.join(repoRoot, "apps/web/components/projects/VercelPublishCard.tsx"),
];
const outputDir = path.join(repoRoot, "output/validation/publish-trust");
const outputPath = path.join(outputDir, "publish-trust-report.json");

const helperSource = await fs.readFile(helperPath, "utf8");
const compiledHelper = ts.default.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.default.ModuleKind.ES2022,
    target: ts.default.ScriptTarget.ES2022,
  },
}).outputText;

const helperModule = await import(`data:text/javascript;base64,${Buffer.from(compiledHelper).toString("base64")}`);
const { buildPublishTrustState } = helperModule;

function createFixture(overrides = {}) {
  return {
    repo: {
      id: "wesle/editor-ai-creator-web",
      branch: "main",
    },
    commit: {
      pullRequestNumber: 42,
      pullRequestState: "merged",
    },
    deployment: {
      environment: "production",
      deploymentId: "dpl_123",
      publishedUrl: "https://editor-ai-creator-web.vercel.app",
      projectName: "editor-ai-creator-web",
    },
    reconciliation: {
      state: "published",
      provider: "vercel",
      externalStatus: "published",
      confirmedExternally: true,
      terminal: true,
      retryable: false,
      needsAttention: false,
      stateSinceAt: "2026-04-10T10:15:00.000Z",
      lastConfirmedState: "published",
      lastConfirmedAt: "2026-04-10T10:15:00.000Z",
      note: "Produção confirmada pela Vercel.",
      summary: "A Vercel confirmou a publicação externa do projeto.",
      nextAction: "Só abra nova rodada quando houver nova iteração.",
      github: {
        status: "pull_request_merged",
        externalStatus: "pull_request_merged",
        repo: "wesle/editor-ai-creator-web",
        branch: "main",
        commitSha: "abcdef1234567890",
      },
      vercel: {
        status: "published",
        externalStatus: "published",
        environment: "production",
        deploymentId: "dpl_123",
        deploymentUrl: "https://editor-ai-creator-web.vercel.app",
      },
      timestamps: {
        reconciledAt: "2026-04-10T10:15:00.000Z",
        updatedAt: "2026-04-10T10:15:00.000Z",
      },
    },
    ...overrides,
  };
}

const baseFixture = createFixture();

const published = buildPublishTrustState({
  publish: baseFixture,
  scope: "overview",
});
assert.equal(published.kind, "published");
assert.equal(published.confirmationLabel, "Confirmado externamente");
assert.ok(published.meta.some((item) => item.label === "Último marco confiável" && String(item.value).includes("Publicado")));

const diverged = buildPublishTrustState({
  publish: {
    ...baseFixture,
    reconciliation: {
      ...baseFixture.reconciliation,
      state: "diverged",
      provider: "github",
      externalStatus: "diverged",
      confirmedExternally: true,
      needsAttention: true,
      summary: "O HEAD do GitHub divergiu do último commit salvo pelo produto.",
      note: "Existe drift real entre a source of truth do projeto e o estado atual da branch.",
      nextAction: "Reconcilie a branch antes de seguir.",
    },
  },
  scope: "github",
});
assert.equal(diverged.kind, "retry");
assert.ok(diverged.meta.some((item) => item.label === "Ação imediata" && String(item.value).includes("Precisa de atenção")));
assert.ok(diverged.details.some((item) => item.includes("Último marco externo confiável")));

const manual = buildPublishTrustState({
  publish: {
    ...baseFixture,
    reconciliation: {
      ...baseFixture.reconciliation,
      state: "manually_resolved",
      provider: "manual",
      externalStatus: null,
      confirmedExternally: false,
      terminal: true,
      needsAttention: true,
      summary: "O publish foi encerrado manualmente, sem confirmação externa completa.",
      note: "Existe marca operacional de exportação/publicação, mas não há reconciliação confiável com provider.",
      nextAction: "Trate esse estado como exceção operacional.",
    },
  },
  scope: "vercel",
});
assert.equal(manual.kind, "retry");
assert.equal(manual.confirmationLabel, "Manual, sem confirmação externa");
assert.ok(manual.details.some((item) => item.includes("não substitui confirmação externa")));

const componentUsage = [];
for (const componentPath of componentPaths) {
  const content = await fs.readFile(componentPath, "utf8");
  const usesHelper = content.includes("buildPublishTrustState");
  assert.ok(usesHelper, `${path.basename(componentPath)} should use buildPublishTrustState`);
  componentUsage.push({
    file: path.relative(repoRoot, componentPath),
    usesPublishTrustHelper: usesHelper,
  });
}

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  outputPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      helper: path.relative(repoRoot, helperPath),
      scenarios: {
        published,
        diverged,
        manual,
      },
      componentUsage,
    },
    null,
    2
  )
);

console.log(JSON.stringify({ ok: true, output: path.relative(repoRoot, outputPath) }, null, 2));
