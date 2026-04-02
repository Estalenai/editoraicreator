import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const browserStoragePattern = /\b(localStorage|sessionStorage)\b/g;

const criticalFiles = [
  "apps/web/components/projects/GitHubWorkspaceCard.tsx",
  "apps/web/components/projects/VercelPublishCard.tsx",
  "apps/web/components/projects/PublishConfidenceState.tsx",
  "apps/web/lib/githubWorkspace.ts",
  "apps/web/lib/vercelWorkspace.ts",
  "apps/web/lib/api.ts",
  "apps/api/src/routes/githubRoutes.js",
  "apps/api/src/routes/vercelRoutes.js",
  "apps/api/src/routes/vercelWebhookRoutes.js",
  "apps/api/src/utils/vercelPublishMachine.js",
];

const knownReasons = {
  "apps/web/lib/supabaseClient.ts": "Persistencia de autenticacao do Supabase e shim de e2e.",
  "apps/web/app/credits/page.tsx": "Contexto temporario de checkout para retorno pos-redirecionamento.",
  "apps/web/components/dashboard/CreditsPackagesCard.tsx": "Contexto temporario do checkout antes do redirecionamento.",
  "apps/web/components/dashboard/ApprovedBetaOnboardingCard.tsx": "Sinal local nao critico de onboarding ja visto.",
};

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".next" || entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    files.push(full);
  }
  return files;
}

function collectMatches(filePath, content) {
  const lines = content.split(/\r?\n/);
  const matches = [];
  lines.forEach((line, index) => {
    const found = line.match(browserStoragePattern);
    if (!found) return;
    matches.push({
      line: index + 1,
      snippet: line.trim(),
      tokens: [...new Set(found)],
    });
  });
  return matches;
}

async function scanFiles(files) {
  const results = [];
  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    const content = await readFile(absolutePath, "utf8");
    const matches = collectMatches(relativePath, content);
    if (!matches.length) continue;
    results.push({
      file: relativePath,
      matches,
    });
  }
  return results;
}

async function main() {
  const webAndApiFiles = await walk(path.join(root, "apps"));
  const allRelativeFiles = webAndApiFiles.map((file) => path.relative(root, file).replace(/\\/g, "/"));
  const allUsage = await scanFiles(allRelativeFiles);
  const criticalUsage = allUsage.filter((item) => criticalFiles.includes(item.file));
  const remainingUsage = allUsage
    .filter((item) => !criticalFiles.includes(item.file))
    .map((item) => ({
      ...item,
      reason: knownReasons[item.file] || "Uso local restante fora do fluxo critico de publish/integracoes.",
    }));

  const backendTruthSignals = await Promise.all(
    [
      "apps/web/components/projects/VercelPublishCard.tsx",
      "apps/web/components/projects/PublishConfidenceState.tsx",
      "apps/web/components/projects/GitHubWorkspaceCard.tsx",
    ].map(async (relativePath) => {
      const content = await readFile(path.join(root, relativePath), "utf8");
      return {
        file: relativePath,
        usesPublishMachine: content.includes("resolveVercelPublishMachine"),
        usesBackendApi:
          content.includes("api.getVercelConnection") ||
          content.includes("api.saveVercelWorkspace") ||
          content.includes("api.getGitHubConnection") ||
          content.includes("api.saveGitHubWorkspace"),
      };
    })
  );

  const report = {
    generatedAt: new Date().toISOString(),
    criticalFiles,
    criticalViolations: criticalUsage,
    remainingBrowserStorageUsage: remainingUsage,
    backendTruthSignals,
    passed: criticalUsage.length === 0,
  };

  const outputDir = path.join(root, "output", "validation");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "browser-storage-boundary.json");
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  process.stdout.write(`${outputPath}\n`);
  if (criticalUsage.length > 0) {
    process.stderr.write("Critical publish/integration paths still reference browser storage.\n");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
