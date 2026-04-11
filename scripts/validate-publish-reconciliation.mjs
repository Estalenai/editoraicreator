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
    schema: "editor-ai-creator.project.v2",
    delivery: {
      stage: "draft",
      exportTarget: "device",
      connectedStorage: null,
      mediaRetention: "externalized",
      lastExportedAt: null,
      lastPublishedAt: null,
      history: [],
    },
    deliverable: {
      label: "Projeto",
      kind: "Projeto",
      summary: "Projeto em publish",
      reviewStatus: "approved",
      primaryOutputId: null,
      latestVersionId: "checkpoint-1",
      latestCheckpointId: "checkpoint-1",
      nextAction: "Publicar",
    },
    integrations: {
      github: {
        binding: null,
        versions: [],
        exports: [],
      },
      vercel: {
        binding: null,
        lastManifestExportedAt: null,
        lastDeploymentCheckedAt: null,
        history: [],
      },
    },
  };
}

function addGitHubBinding(project, { status, pullRequestState = null, pullRequestUpdatedAt = null, updatedAt = "2026-04-10T12:00:00.000Z" }) {
  const next = structuredClone(project);
  next.integrations.github.binding = {
    provider: "github",
    owner: "acme",
    repo: "editor-ai-creator",
    branch: "ea/publish",
    rootPath: "/apps/web",
    target: "site",
    connectedAt: "2026-04-10T10:00:00.000Z",
    updatedAt,
    repositoryUrl: "https://github.com/acme/editor-ai-creator",
    defaultBranch: "main",
    lastVerifiedAt: "2026-04-10T10:10:00.000Z",
    verificationStatus: "verified",
    tokenConfigured: true,
    lastResolvedCommitSha: "1111111111111111111111111111111111111111",
    lastCommitStatus: status === "diverged" ? "diverged" : "confirmed",
    lastSyncStatus: status,
    lastSyncedAt: "2026-04-10T11:00:00.000Z",
    lastCommitSha: "1111111111111111111111111111111111111111",
    lastCommitUrl: "https://github.com/acme/editor-ai-creator/commit/1111111",
    lastPullRequestNumber: pullRequestState ? 42 : null,
    lastPullRequestUrl: pullRequestState ? "https://github.com/acme/editor-ai-creator/pull/42" : null,
    lastPullRequestState: pullRequestState,
    lastPullRequestUpdatedAt: pullRequestUpdatedAt,
    lastReconciledAt: updatedAt,
  };
  next.integrations.github.exports = [
    {
      id: "export-1",
      exportedAt: "2026-04-10T11:00:00.000Z",
      handoffTarget: "site",
      repoLabel: "acme/editor-ai-creator",
      branch: "ea/publish",
      path: ".editor-ai-creator/handoffs/project.json",
      commitSha: "1111111111111111111111111111111111111111",
      commitUrl: "https://github.com/acme/editor-ai-creator/commit/1111111",
      status,
      statusUpdatedAt: updatedAt,
      pullRequestNumber: pullRequestState ? 42 : null,
      pullRequestUrl: pullRequestState ? "https://github.com/acme/editor-ai-creator/pull/42" : null,
      pullRequestState,
    },
  ];
  next.integrations.github.versions = [
    {
      id: "checkpoint-1",
      savedAt: "2026-04-10T10:45:00.000Z",
      handoffTarget: "site",
      repoLabel: "acme/editor-ai-creator",
      branch: "ea/publish",
      commitMessage: "chore: sync project",
    },
  ];
  next.delivery = {
    ...next.delivery,
    stage: "exported",
    exportTarget: "connected_storage",
    connectedStorage: "github",
    lastExportedAt: "2026-04-10T11:00:00.000Z",
  };
  return next;
}

function addVercelBinding(project, { machineState, target = "preview", observedAt = "2026-04-10T12:20:00.000Z", readyAt = null, errorMessage = null }) {
  const next = structuredClone(project);
  next.integrations.vercel.binding = {
    provider: "vercel",
    projectId: "prj_123",
    projectName: "editor-ai-creator-web",
    teamId: "team_123",
    teamSlug: "editor-ai",
    framework: "nextjs",
    rootDirectory: "apps/web",
    target,
    deployStatus: machineState === "published" ? "published" : machineState === "deployment_ready" ? "ready" : "draft",
    previewUrl: machineState === "deployment_ready" && target !== "production" ? "https://preview.vercel.app" : "",
    productionUrl: machineState === "published" ? "https://editor-ai-creator.vercel.app" : "",
    projectUrl: "https://vercel.com/editor-ai/editor-ai-creator-web",
    connectedAt: "2026-04-10T12:00:00.000Z",
    updatedAt: observedAt,
    lastVerifiedAt: "2026-04-10T12:00:00.000Z",
    verificationStatus: "verified",
    tokenConfigured: true,
    linkedRepoId: "repo_123",
    linkedRepoType: "github",
    lastDeploymentId: "dpl_123",
    lastDeploymentUrl:
      machineState === "published"
        ? "https://editor-ai-creator.vercel.app"
        : machineState === "deployment_ready"
          ? "https://preview.vercel.app"
          : "https://queued.vercel.app",
    lastDeploymentInspectorUrl: "https://vercel.com/editor-ai/editor-ai-creator-web/deployments/dpl_123",
    lastDeploymentState:
      machineState === "published" || machineState === "deployment_ready"
        ? "READY"
        : machineState === "deployment_failed"
          ? "ERROR"
          : machineState === "deployment_running"
            ? "BUILDING"
            : "QUEUED",
    lastDeploymentTarget: target,
    lastDeploymentRef: "ea/publish",
    lastDeployRequestedAt: "2026-04-10T12:05:00.000Z",
    lastDeployReadyAt: readyAt,
    lastDeployError: errorMessage,
    lastDeploymentObservedAt: observedAt,
    lastReconciledAt: observedAt,
    publishMachine: {
      version: "vercel.publish-machine.v1",
      state: machineState,
      sourceOfTruth: machineState === "deployment_requested" || machineState === "deployment_running" ? "provider" : "backend",
      reconcileMode: "webhook+poll",
      externalState:
        machineState === "published" || machineState === "deployment_ready"
          ? "READY"
          : machineState === "deployment_failed"
            ? "ERROR"
            : machineState === "deployment_running"
              ? "BUILDING"
              : "QUEUED",
      confirmed: machineState === "published" || machineState === "deployment_ready" || machineState === "deployment_failed",
      terminal: machineState === "published" || machineState === "deployment_ready" || machineState === "deployment_failed",
      retryable: machineState === "deployment_failed",
      lastSource: "provider_poll",
      lastEventType: "deployment_reconciled",
      lastTransitionAt: observedAt,
      lastCheckedAt: observedAt,
      lastWebhookAt: null,
      lastPollAt: observedAt,
      lastSuccessAt: machineState === "published" || machineState === "deployment_ready" ? readyAt || observedAt : null,
      lastFailureAt: machineState === "deployment_failed" ? observedAt : null,
      nextCheckAt: null,
      note: machineState,
    },
  };
  next.integrations.vercel.lastDeploymentCheckedAt = observedAt;
  next.delivery = {
    ...next.delivery,
    stage: machineState === "published" ? "published" : "exported",
    exportTarget: "connected_storage",
    connectedStorage: "vercel",
    lastExportedAt: "2026-04-10T12:05:00.000Z",
    lastPublishedAt: machineState === "published" ? readyAt || observedAt : null,
  };
  return next;
}

function scenario(name, project) {
  const applied = applyPublishSourceOfTruth(project);
  return {
    name,
    state: applied.publish.reconciliation.state,
    provider: applied.publish.reconciliation.provider,
    stateSinceAt: applied.publish.reconciliation.stateSinceAt,
    lastConfirmedState: applied.publish.reconciliation.lastConfirmedState,
    lastConfirmedAt: applied.publish.reconciliation.lastConfirmedAt,
    needsAttention: applied.publish.reconciliation.needsAttention,
    confirmedExternally: applied.publish.reconciliation.confirmedExternally,
    snapshot: applied.publish,
  };
}

async function main() {
  const apiPublishSource = await read("apps/api/src/utils/publishSourceOfTruth.js");
  const apiPublishReconciliation = await read("apps/api/src/utils/publishReconciliation.js");
  const projectModel = await read("apps/web/lib/projectModel.ts");
  const webPublishReconciliation = await read("apps/web/lib/publishReconciliation.ts");

  const githubRequested = scenario("github_requested", addGitHubBinding(baseProject(), { status: "synced" }));
  assert.equal(githubRequested.state, "requested");
  assert.equal(githubRequested.provider, "github");

  const githubReady = scenario(
    "github_ready",
    addGitHubBinding(baseProject(), {
      status: "pr_open",
      pullRequestState: "open",
      pullRequestUpdatedAt: "2026-04-10T11:30:00.000Z",
      updatedAt: "2026-04-10T11:30:00.000Z",
    })
  );
  assert.equal(githubReady.state, "ready");
  assert.equal(githubReady.provider, "github");

  const githubMerged = scenario(
    "github_merged",
    addGitHubBinding(baseProject(), {
      status: "pr_merged",
      pullRequestState: "merged",
      pullRequestUpdatedAt: "2026-04-10T11:45:00.000Z",
      updatedAt: "2026-04-10T11:45:00.000Z",
    })
  );
  assert.equal(githubMerged.state, "merged");
  assert.equal(githubMerged.provider, "github");

  const vercelRunning = scenario(
    "vercel_running",
    addVercelBinding(baseProject(), {
      machineState: "deployment_running",
      observedAt: "2026-04-10T12:10:00.000Z",
    })
  );
  assert.equal(vercelRunning.state, "running");
  assert.equal(vercelRunning.provider, "vercel");

  const vercelReady = scenario(
    "vercel_ready",
    addVercelBinding(baseProject(), {
      machineState: "deployment_ready",
      observedAt: "2026-04-10T12:20:00.000Z",
      readyAt: "2026-04-10T12:20:00.000Z",
    })
  );
  assert.equal(vercelReady.state, "ready");
  assert.equal(vercelReady.provider, "vercel");

  const vercelPublished = scenario(
    "vercel_published",
    addVercelBinding(baseProject(), {
      machineState: "published",
      target: "production",
      observedAt: "2026-04-10T12:30:00.000Z",
      readyAt: "2026-04-10T12:30:00.000Z",
    })
  );
  assert.equal(vercelPublished.state, "published");
  assert.equal(vercelPublished.provider, "vercel");

  const vercelFailed = scenario(
    "vercel_failed",
    addVercelBinding(baseProject(), {
      machineState: "deployment_failed",
      observedAt: "2026-04-10T12:40:00.000Z",
      errorMessage: "build_failed",
    })
  );
  assert.equal(vercelFailed.state, "failed");
  assert.equal(vercelFailed.provider, "vercel");
  assert.equal(vercelFailed.snapshot.reconciliation.needsAttention, true);

  const diverged = scenario(
    "github_diverged",
    addGitHubBinding(baseProject(), {
      status: "diverged",
      updatedAt: "2026-04-10T12:50:00.000Z",
    })
  );
  assert.equal(diverged.state, "diverged");
  assert.equal(diverged.snapshot.reconciliation.retryable, true);

  const repoMissing = scenario(
    "github_repo_missing",
    addGitHubBinding(baseProject(), {
      status: "repo_missing",
      updatedAt: "2026-04-10T13:00:00.000Z",
    })
  );
  assert.equal(repoMissing.state, "repo_missing");
  assert.equal(repoMissing.snapshot.reconciliation.needsAttention, true);

  const branchMissing = scenario(
    "github_branch_missing",
    addGitHubBinding(baseProject(), {
      status: "branch_missing",
      updatedAt: "2026-04-10T13:05:00.000Z",
    })
  );
  assert.equal(branchMissing.state, "branch_missing");

  const manuallyResolvedProject = baseProject();
  manuallyResolvedProject.delivery = {
    ...manuallyResolvedProject.delivery,
    stage: "published",
    exportTarget: "connected_storage",
    connectedStorage: "manual",
    lastPublishedAt: "2026-04-10T13:10:00.000Z",
  };
  const manuallyResolved = scenario("manual_resolution", manuallyResolvedProject);
  assert.equal(manuallyResolved.state, "manually_resolved");
  assert.equal(manuallyResolved.snapshot.reconciliation.confirmedExternally, false);

  const repoMissingAfterPublished = scenario(
    "repo_missing_after_published",
    addGitHubBinding(
      addVercelBinding(baseProject(), {
        machineState: "published",
        target: "production",
        observedAt: "2026-04-10T12:30:00.000Z",
        readyAt: "2026-04-10T12:30:00.000Z",
      }),
      {
        status: "repo_missing",
        updatedAt: "2026-04-10T13:20:00.000Z",
      }
    )
  );
  assert.equal(repoMissingAfterPublished.state, "repo_missing");
  assert.equal(repoMissingAfterPublished.lastConfirmedState, "published");
  assert.equal(repoMissingAfterPublished.lastConfirmedAt, "2026-04-10T12:30:00.000Z");

  const mergedThenRequested = scenario(
    "merged_then_requested",
    addVercelBinding(
      addGitHubBinding(baseProject(), {
        status: "pr_merged",
        pullRequestState: "merged",
        pullRequestUpdatedAt: "2026-04-10T11:45:00.000Z",
        updatedAt: "2026-04-10T11:45:00.000Z",
      }),
      {
        machineState: "deployment_requested",
        observedAt: "2026-04-10T12:05:00.000Z",
      }
    )
  );
  assert.equal(mergedThenRequested.state, "requested");
  assert.equal(mergedThenRequested.provider, "vercel");
  assert.equal(mergedThenRequested.lastConfirmedState, "merged");

  const directSnapshot = buildPublishSourceOfTruth(
    addVercelBinding(
      addGitHubBinding(baseProject(), {
        status: "pr_open",
        pullRequestState: "open",
        pullRequestUpdatedAt: "2026-04-10T11:30:00.000Z",
        updatedAt: "2026-04-10T11:30:00.000Z",
      }),
      {
        machineState: "deployment_ready",
        observedAt: "2026-04-10T12:20:00.000Z",
        readyAt: "2026-04-10T12:20:00.000Z",
      }
    )
  );
  assert.equal(directSnapshot.reconciliation.state, "ready");
  assert.equal(directSnapshot.reconciliation.provider, "vercel");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceChecks: {
      apiPublishSourceBuildsReconciliation: apiPublishSource.includes("const reconciliation = buildPublishReconciliation({"),
      apiPublishSourcePersistsReconciliation: apiPublishSource.includes("reconciliation,"),
      apiPublishSourceVersionBumped: apiPublishSource.includes('editor-ai-creator.publish-source.v2'),
      apiPublishReconciliationHasCanonicalStates:
        apiPublishReconciliation.includes('"requested"') &&
        apiPublishReconciliation.includes('"running"') &&
        apiPublishReconciliation.includes('"ready"') &&
        apiPublishReconciliation.includes('"failed"') &&
        apiPublishReconciliation.includes('"merged"') &&
        apiPublishReconciliation.includes('"published"') &&
        apiPublishReconciliation.includes('"diverged"') &&
        apiPublishReconciliation.includes('"repo_missing"') &&
        apiPublishReconciliation.includes('"branch_missing"') &&
        apiPublishReconciliation.includes('"manually_resolved"'),
      webProjectModelHasReconciliationField: projectModel.includes("reconciliation: ProjectPublishReconciliation;"),
      webProjectModelNormalizesReconciliation: projectModel.includes("reconciliationValue") && projectModel.includes("fallback.reconciliation.timestamps"),
      webProjectModelBuildsReconciliation: projectModel.includes("const reconciliation = buildPublishReconciliation({"),
      webPublishReconciliationHasCanonicalStates:
        webPublishReconciliation.includes('"requested"') &&
        webPublishReconciliation.includes('"running"') &&
        webPublishReconciliation.includes('"ready"') &&
        webPublishReconciliation.includes('"failed"') &&
        webPublishReconciliation.includes('"merged"') &&
        webPublishReconciliation.includes('"published"') &&
        webPublishReconciliation.includes('"diverged"') &&
        webPublishReconciliation.includes('"repo_missing"') &&
        webPublishReconciliation.includes('"branch_missing"') &&
        webPublishReconciliation.includes('"manually_resolved"'),
    },
    scenarios: [
      githubRequested,
      githubReady,
      githubMerged,
      vercelRunning,
      vercelReady,
      vercelPublished,
      vercelFailed,
      diverged,
      repoMissing,
      branchMissing,
      manuallyResolved,
      repoMissingAfterPublished,
      mergedThenRequested,
    ].map((item) => ({
      name: item.name,
      state: item.state,
      provider: item.provider,
      stateSinceAt: item.stateSinceAt,
      lastConfirmedState: item.lastConfirmedState,
      lastConfirmedAt: item.lastConfirmedAt,
      needsAttention: item.needsAttention,
      confirmedExternally: item.confirmedExternally,
    })),
    directSnapshot: directSnapshot.reconciliation,
    passed: true,
  };

  const outputDir = path.join(rootDir, "output", "validation", "publish-reconciliation");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "publish-reconciliation-report.json");
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
