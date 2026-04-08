import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyPublishSourceOfTruth,
  buildPublishSourceOfTruth,
} from "../apps/api/src/utils/publishSourceOfTruth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function read(relativePath) {
  return readFile(path.join(rootDir, relativePath), "utf8");
}

function baseProject() {
  return {
    schema: "editor-ai-creator.project.v1",
    delivery: {
      stage: "draft",
      exportTarget: "device",
      connectedStorage: null,
      mediaRetention: "externalized",
      lastExportedAt: null,
      lastPublishedAt: null,
      history: [],
    },
    deliverable: {},
    integrations: {
      github: { binding: null, versions: [], exports: [] },
      vercel: { binding: null, lastManifestExportedAt: null, lastDeploymentCheckedAt: null, history: [] },
    },
  };
}

function buildGitHubSample() {
  const sample = baseProject();
  sample.integrations.github.binding = {
    provider: "github",
    owner: "acme",
    repo: "editor-ai-creator",
    branch: "ea/source-of-truth",
    rootPath: "/apps/web",
    target: "site",
    connectedAt: "2026-04-08T10:00:00.000Z",
    updatedAt: "2026-04-08T10:03:00.000Z",
    repositoryUrl: "https://github.com/acme/editor-ai-creator",
    defaultBranch: "main",
    lastVerifiedAt: "2026-04-08T10:02:00.000Z",
    lastResolvedCommitSha: "1234567890abcdef1234567890abcdef12345678",
    lastSyncStatus: "synced",
    lastSyncedAt: "2026-04-08T10:07:00.000Z",
    lastCommitSha: "1234567890abcdef1234567890abcdef12345678",
    lastCommitUrl: "https://github.com/acme/editor-ai-creator/commit/1234567",
    lastPullRequestNumber: 42,
    lastPullRequestUrl: "https://github.com/acme/editor-ai-creator/pull/42",
    lastPullRequestState: "open",
  };
  sample.integrations.github.versions = [
    {
      id: "checkpoint-1",
      savedAt: "2026-04-08T10:05:00.000Z",
      handoffTarget: "site",
      repoLabel: "acme/editor-ai-creator",
      branch: "ea/source-of-truth",
      commitMessage: "chore: sync",
    },
  ];
  sample.integrations.github.exports = [
    {
      id: "export-1",
      exportedAt: "2026-04-08T10:07:00.000Z",
      handoffTarget: "site",
      repoLabel: "acme/editor-ai-creator",
      branch: "ea/source-of-truth",
      path: ".editor-ai-creator/handoffs/project.json",
      commitSha: "1234567890abcdef1234567890abcdef12345678",
      commitUrl: "https://github.com/acme/editor-ai-creator/commit/1234567",
      status: "pr_open",
      pullRequestNumber: 42,
      pullRequestUrl: "https://github.com/acme/editor-ai-creator/pull/42",
    },
  ];
  sample.delivery = {
    ...sample.delivery,
    stage: "exported",
    exportTarget: "connected_storage",
    connectedStorage: "github",
    lastExportedAt: "2026-04-08T10:07:00.000Z",
    history: [
      {
        id: "history-1",
        ts: "2026-04-08T10:08:00.000Z",
        stage: "exported",
        channel: "github",
        title: "Pull request aberto",
        note: "PR #42 aberto.",
      },
    ],
  };
  return sample;
}

function buildVercelSample() {
  const sample = buildGitHubSample();
  sample.integrations.vercel.binding = {
    provider: "vercel",
    projectId: "prj_123",
    projectName: "editor-ai-creator",
    teamId: "team_123",
    teamSlug: "editor-ai",
    framework: "nextjs",
    rootDirectory: "apps/web",
    target: "production",
    deployStatus: "published",
    previewUrl: "https://editor-ai-creator-git-preview.vercel.app",
    productionUrl: "https://editor-ai-creator.vercel.app",
    projectUrl: "https://vercel.com/editor-ai/editor-ai-creator",
    connectedAt: "2026-04-08T10:09:00.000Z",
    updatedAt: "2026-04-08T10:15:00.000Z",
    lastVerifiedAt: "2026-04-08T10:10:00.000Z",
    linkedRepoId: "repo_123",
    linkedRepoType: "github",
    lastDeploymentId: "dpl_123",
    lastDeploymentUrl: "https://editor-ai-creator.vercel.app",
    lastDeploymentInspectorUrl: "https://vercel.com/editor-ai/editor-ai-creator/deployments/dpl_123",
    lastDeploymentState: "READY",
    lastDeploymentTarget: "production",
    lastDeploymentRef: "ea/source-of-truth",
    lastDeployRequestedAt: "2026-04-08T10:12:00.000Z",
    lastDeployReadyAt: "2026-04-08T10:15:00.000Z",
    lastDeployError: null,
    publishMachine: {
      version: "vercel.publish-machine.v1",
      state: "published",
      sourceOfTruth: "provider",
      reconcileMode: "webhook+poll",
      externalState: "READY",
      confirmed: true,
      terminal: true,
      retryable: false,
      lastSource: "provider_webhook",
      lastEventType: "deployment.succeeded",
      lastTransitionAt: "2026-04-08T10:15:00.000Z",
      lastCheckedAt: "2026-04-08T10:15:00.000Z",
      lastWebhookAt: "2026-04-08T10:15:00.000Z",
      lastPollAt: "2026-04-08T10:14:00.000Z",
      lastSuccessAt: "2026-04-08T10:15:00.000Z",
      lastFailureAt: null,
      nextCheckAt: null,
      note: "Produção confirmada pela Vercel em https://editor-ai-creator.vercel.app.",
    },
  };
  sample.integrations.vercel.lastDeploymentCheckedAt = "2026-04-08T10:15:00.000Z";
  sample.delivery = {
    ...sample.delivery,
    stage: "published",
    connectedStorage: "vercel",
    lastPublishedAt: "2026-04-08T10:15:00.000Z",
  };
  return sample;
}

async function main() {
  const githubRoutes = await read("apps/api/src/routes/githubRoutes.js");
  const vercelRoutes = await read("apps/api/src/routes/vercelRoutes.js");
  const vercelWebhookRoutes = await read("apps/api/src/routes/vercelWebhookRoutes.js");
  const projectModel = await read("apps/web/lib/projectModel.ts");

  const githubSample = applyPublishSourceOfTruth(buildGitHubSample());
  const vercelSample = applyPublishSourceOfTruth(buildVercelSample());
  const directSnapshot = buildPublishSourceOfTruth(buildVercelSample());

  assert.equal(githubSample.schema, "editor-ai-creator.project.v2");
  assert.equal(githubSample.publish.primary.provider, "github");
  assert.equal(githubSample.publish.primary.status, "pull_request_open");
  assert.equal(githubSample.publish.repo.id, "acme/editor-ai-creator");
  assert.equal(githubSample.publish.commit.sha, "1234567890abcdef1234567890abcdef12345678");
  assert.equal(githubSample.publish.commit.pullRequestNumber, 42);
  assert.equal(githubSample.publish.timestamps.commitSyncedAt, "2026-04-08T10:07:00.000Z");

  assert.equal(vercelSample.schema, "editor-ai-creator.project.v2");
  assert.equal(vercelSample.publish.primary.provider, "vercel");
  assert.equal(vercelSample.publish.primary.status, "published");
  assert.equal(vercelSample.publish.deployment.deploymentId, "dpl_123");
  assert.equal(vercelSample.publish.deployment.deploymentUrl, "https://editor-ai-creator.vercel.app");
  assert.equal(vercelSample.publish.deployment.environment, "production");
  assert.equal(vercelSample.publish.timestamps.publishedAt, "2026-04-08T10:15:00.000Z");
  assert.equal(directSnapshot.primary.commitSha, "1234567890abcdef1234567890abcdef12345678");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceChecks: {
      githubRoutesApplyPublishSource: githubRoutes.includes("applyPublishSourceOfTruth(nextData)"),
      vercelRoutesApplyPublishSource: vercelRoutes.includes("applyPublishSourceOfTruth(nextData)"),
      vercelWebhookApplyPublishSource: vercelWebhookRoutes.includes("applyPublishSourceOfTruth(nextData)"),
      projectModelHasPublishType: projectModel.includes("export type ProjectPublishSourceOfTruth"),
      projectModelReturnsPublish: projectModel.includes("publish: nextPublish") && projectModel.includes("publish: data.publish"),
    },
    githubSnapshot: {
      primary: githubSample.publish.primary,
      repo: githubSample.publish.repo,
      commit: githubSample.publish.commit,
      timestamps: githubSample.publish.timestamps,
    },
    vercelSnapshot: {
      primary: vercelSample.publish.primary,
      deployment: vercelSample.publish.deployment,
      timestamps: vercelSample.publish.timestamps,
    },
    passed: true,
  };

  const outputDir = path.join(rootDir, "output", "validation", "publish-source-of-truth");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "publish-source-of-truth-report.json");
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
