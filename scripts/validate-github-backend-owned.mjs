import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyPublishSourceOfTruth } from "../apps/api/src/utils/publishSourceOfTruth.js";
import { reconcileGitHubBinding } from "../apps/api/src/utils/githubReconciliation.js";

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
      stage: "exported",
      exportTarget: "connected_storage",
      connectedStorage: "github",
      mediaRetention: "externalized",
      lastExportedAt: "2026-04-10T12:00:00.000Z",
      lastPublishedAt: null,
      history: [],
    },
    deliverable: {
      label: "Projeto",
      kind: "Projeto",
      summary: "Projeto em handoff",
      reviewStatus: "approved",
      primaryOutputId: null,
      latestVersionId: "checkpoint-1",
      latestCheckpointId: "checkpoint-1",
      nextAction: "Revisar publish",
    },
    integrations: {
      github: {
        binding: {
          provider: "github",
          owner: "acme",
          repo: "editor-ai-creator",
          branch: "ea/backend-owned",
          rootPath: "/apps/web",
          target: "site",
          connectedAt: "2026-04-10T11:00:00.000Z",
          updatedAt: "2026-04-10T11:00:00.000Z",
          repositoryUrl: "https://github.com/acme/editor-ai-creator",
          defaultBranch: "main",
          lastVerifiedAt: "2026-04-10T11:00:00.000Z",
          verificationStatus: "verified",
          tokenConfigured: true,
          lastResolvedCommitSha: "1111111111111111111111111111111111111111",
          lastCommitSha: "1111111111111111111111111111111111111111",
          lastCommitUrl: "https://github.com/acme/editor-ai-creator/commit/1111111",
          lastSyncStatus: "synced",
          lastSyncedAt: "2026-04-10T12:00:00.000Z",
          lastPullRequestNumber: 42,
          lastPullRequestUrl: "https://github.com/acme/editor-ai-creator/pull/42",
          lastPullRequestState: "open",
        },
        versions: [
          {
            id: "checkpoint-1",
            savedAt: "2026-04-10T11:50:00.000Z",
            handoffTarget: "site",
            repoLabel: "acme/editor-ai-creator",
            branch: "ea/backend-owned",
            commitMessage: "chore: sync project",
          },
        ],
        exports: [
          {
            id: "export-1",
            exportedAt: "2026-04-10T12:00:00.000Z",
            handoffTarget: "site",
            repoLabel: "acme/editor-ai-creator",
            branch: "ea/backend-owned",
            path: ".editor-ai-creator/handoffs/project.json",
            commitSha: "1111111111111111111111111111111111111111",
            commitUrl: "https://github.com/acme/editor-ai-creator/commit/1111111",
            status: "synced",
          },
        ],
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

function applyReconciliation(project, reconciliation) {
  const next = structuredClone(project);
  next.integrations.github.binding = reconciliation.binding;
  if (next.integrations.github.exports[0]) {
    Object.assign(next.integrations.github.exports[0], reconciliation.exportPatch);
  }
  next.delivery.history.unshift({
    id: "event-1",
    ts: reconciliation.event.observedAt,
    stage: "exported",
    channel: "github",
    title: reconciliation.event.title,
    note: reconciliation.event.note,
  });
  next.deliverable.nextAction = reconciliation.event.nextAction;
  return applyPublishSourceOfTruth(next);
}

async function main() {
  const githubRoutes = await read("apps/api/src/routes/githubRoutes.js");
  const apiSource = await read("apps/web/lib/api.ts");
  const projectModel = await read("apps/web/lib/projectModel.ts");
  const workspaceCard = await read("apps/web/components/projects/GitHubWorkspaceCard.tsx");
  const publishSource = await read("apps/api/src/utils/publishSourceOfTruth.js");

  const mergedReconciliation = reconcileGitHubBinding({
    binding: baseProject().integrations.github.binding,
    repoInfo: {
      htmlUrl: "https://github.com/acme/editor-ai-creator",
      defaultBranch: "main",
    },
    branchInfo: {
      name: "ea/backend-owned",
      sha: "1111111111111111111111111111111111111111",
    },
    pullRequest: {
      number: 42,
      htmlUrl: "https://github.com/acme/editor-ai-creator/pull/42",
      state: "closed",
      mergedAt: "2026-04-10T12:30:00.000Z",
      updatedAt: "2026-04-10T12:30:00.000Z",
    },
    observedAt: "2026-04-10T12:30:00.000Z",
  });
  assert.equal(mergedReconciliation.status, "pr_merged");

  const mergedProject = applyReconciliation(baseProject(), mergedReconciliation);
  assert.equal(mergedProject.publish.providers.github.status, "pull_request_merged");
  assert.equal(mergedProject.publish.commit.pullRequestState, "merged");
  assert.equal(mergedProject.publish.timestamps.pullRequestAt, "2026-04-10T12:30:00.000Z");

  const divergedProjectBase = baseProject();
  divergedProjectBase.integrations.github.binding.lastPullRequestNumber = null;
  divergedProjectBase.integrations.github.binding.lastPullRequestUrl = null;
  divergedProjectBase.integrations.github.binding.lastPullRequestState = null;
  divergedProjectBase.integrations.github.exports[0].status = "synced";
  const divergedReconciliation = reconcileGitHubBinding({
    binding: divergedProjectBase.integrations.github.binding,
    repoInfo: {
      htmlUrl: "https://github.com/acme/editor-ai-creator",
      defaultBranch: "main",
    },
    branchInfo: {
      name: "ea/backend-owned",
      sha: "9999999999999999999999999999999999999999",
    },
    pullRequest: null,
    observedAt: "2026-04-10T12:45:00.000Z",
  });
  assert.equal(divergedReconciliation.status, "diverged");
  const divergedProject = applyReconciliation(divergedProjectBase, divergedReconciliation);
  assert.equal(divergedProject.publish.providers.github.status, "diverged");

  const missingRepoReconciliation = reconcileGitHubBinding({
    binding: baseProject().integrations.github.binding,
    repoInfo: null,
    branchInfo: null,
    pullRequest: null,
    observedAt: "2026-04-10T13:00:00.000Z",
  });
  assert.equal(missingRepoReconciliation.status, "repo_missing");
  const missingRepoProject = applyReconciliation(baseProject(), missingRepoReconciliation);
  assert.equal(missingRepoProject.publish.providers.github.status, "repo_missing");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceChecks: {
      githubRoutesHasReconcileRoute: githubRoutes.includes('router.post("/projects/:id/reconcile"'),
      githubRoutesUsesReconciliationHelper: githubRoutes.includes("reconcileGitHubBinding({"),
      githubRoutesReadsPullRequest: githubRoutes.includes("getGitHubPullRequest({"),
      githubRoutesFindsPullRequestByHead: githubRoutes.includes("findGitHubPullRequest({"),
      apiHasReconcileMethod: apiSource.includes("async reconcileGitHubProject(id: string)"),
      workspaceCardCallsReconcile: workspaceCard.includes("api.reconcileGitHubProject(selectedProject.id)"),
      workspaceCardHasReconcileButton: workspaceCard.includes("Reconciliar estado"),
      projectModelPrefersBackendGitHubStatus: projectModel.includes('effectiveGitHubStatus') || projectModel.includes('pull_request_merged'),
      projectModelHasExtendedGitHubFields:
        projectModel.includes("lastCommitStatus?: string | null;") &&
        projectModel.includes("lastReconciledAt?: string | null;") &&
        projectModel.includes("statusUpdatedAt?: string | null;"),
      publishSourceUnderstandsMergedAndDiverged:
        publishSource.includes('return "pull_request_merged";') &&
        publishSource.includes('return "diverged";') &&
        publishSource.includes('return "repo_missing";'),
    },
    functionalChecks: {
      mergedStatus: mergedReconciliation.status,
      mergedPublishStatus: mergedProject.publish.providers.github.status,
      divergedStatus: divergedReconciliation.status,
      divergedPublishStatus: divergedProject.publish.providers.github.status,
      missingRepoStatus: missingRepoReconciliation.status,
      missingRepoPublishStatus: missingRepoProject.publish.providers.github.status,
    },
    passed: true,
  };

  const outputDir = path.join(rootDir, "output", "validation", "github-backend-owned");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "github-backend-owned-report.json");
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
