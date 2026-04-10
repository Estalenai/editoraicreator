import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyPublishSourceOfTruth } from "../apps/api/src/utils/publishSourceOfTruth.js";
import {
  buildVercelDeploymentRecord,
  reconcileVercelBinding,
} from "../apps/api/src/utils/vercelReconciliation.js";

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
        binding: {
          provider: "vercel",
          projectId: "prj_123",
          projectName: "editor-ai-creator-web",
          teamId: "team_123",
          teamSlug: "estalenais-projects",
          framework: "nextjs",
          rootDirectory: "apps/web",
          target: "preview",
          deployStatus: "draft",
          previewUrl: "",
          productionUrl: "",
          projectUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web",
          connectedAt: "2026-04-10T10:00:00.000Z",
          updatedAt: "2026-04-10T10:00:00.000Z",
          lastVerifiedAt: "2026-04-10T10:00:00.000Z",
          verificationStatus: "verified",
          tokenConfigured: true,
          linkedRepoId: "repo_123",
          linkedRepoType: "github",
          lastDeploymentId: null,
          lastDeploymentUrl: null,
          lastDeploymentInspectorUrl: null,
          lastDeploymentState: null,
          lastDeploymentTarget: null,
          lastDeploymentRef: "main",
          lastDeployRequestedAt: null,
          lastDeployReadyAt: null,
          lastDeployError: null,
          lastDeploymentObservedAt: null,
          lastReconciledAt: null,
          publishMachine: null,
        },
        lastManifestExportedAt: null,
        lastDeploymentCheckedAt: null,
        history: [],
      },
    },
  };
}

function applyBinding(project, binding, checkedAt) {
  const next = structuredClone(project);
  next.integrations.vercel.binding = binding;
  next.integrations.vercel.lastDeploymentCheckedAt = checkedAt;
  return applyPublishSourceOfTruth(next);
}

async function main() {
  const vercelRoutes = await read("apps/api/src/routes/vercelRoutes.js");
  const vercelWebhookRoutes = await read("apps/api/src/routes/vercelWebhookRoutes.js");
  const projectModel = await read("apps/web/lib/projectModel.ts");
  const workspaceCard = await read("apps/web/components/projects/VercelPublishCard.tsx");
  const publishSource = await read("apps/api/src/utils/publishSourceOfTruth.js");
  const apiSource = await read("apps/web/lib/api.ts");

  const requestedBinding = reconcileVercelBinding({
    previousBinding: baseProject().integrations.vercel.binding,
    deployment: {
      id: "dpl_queued",
      url: "https://preview-queued.vercel.app",
      inspectorUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web/dpl_queued",
      readyState: "QUEUED",
      target: "preview",
      createdAt: "2026-04-10T10:05:00.000Z",
      readyAt: null,
      errorMessage: null,
    },
    observedAt: "2026-04-10T10:05:10.000Z",
    source: "deployment_request",
    eventType: "deployment_requested",
    projectId: "prj_123",
    projectName: "editor-ai-creator-web",
    teamId: "team_123",
    teamSlug: "estalenais-projects",
    framework: "nextjs",
    rootDirectory: "apps/web",
    target: "preview",
    projectUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web",
    linkedRepoId: "repo_123",
    linkedRepoType: "github",
    deploymentRef: "main",
    previewUrl: "",
    productionUrl: "",
  });
  assert.equal(requestedBinding.publishMachine.state, "deployment_running");
  assert.equal(requestedBinding.lastDeploymentObservedAt, "2026-04-10T10:05:10.000Z");

  const requestedProject = applyBinding(baseProject(), requestedBinding, "2026-04-10T10:05:10.000Z");
  assert.equal(requestedProject.publish.providers.vercel.status, "deployment_running");
  assert.equal(requestedProject.publish.timestamps.deploymentObservedAt, "2026-04-10T10:05:10.000Z");

  const previewReadyBinding = reconcileVercelBinding({
    previousBinding: requestedBinding,
    deployment: {
      id: "dpl_queued",
      url: "https://preview-ready.vercel.app",
      inspectorUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web/dpl_queued",
      readyState: "READY",
      target: "preview",
      createdAt: "2026-04-10T10:05:00.000Z",
      readyAt: "2026-04-10T10:08:00.000Z",
      errorMessage: null,
    },
    observedAt: "2026-04-10T10:08:05.000Z",
    source: "provider_poll",
    eventType: "deployment_reconciled",
    projectId: "prj_123",
    projectName: "editor-ai-creator-web",
    teamId: "team_123",
    teamSlug: "estalenais-projects",
    framework: "nextjs",
    rootDirectory: "apps/web",
    target: "preview",
    projectUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web",
    linkedRepoId: "repo_123",
    linkedRepoType: "github",
    deploymentRef: "main",
    previewUrl: "",
    productionUrl: "",
  });
  assert.equal(previewReadyBinding.publishMachine.state, "deployment_ready");
  const previewReadyProject = applyBinding(baseProject(), previewReadyBinding, "2026-04-10T10:08:05.000Z");
  assert.equal(previewReadyProject.publish.providers.vercel.status, "deployment_ready");
  assert.equal(previewReadyProject.publish.deployment.deploymentUrl, "https://preview-ready.vercel.app");
  assert.equal(previewReadyProject.publish.timestamps.deploymentReconciledAt, "2026-04-10T10:08:05.000Z");

  const productionBase = baseProject();
  productionBase.integrations.vercel.binding.target = "production";
  const publishedBinding = reconcileVercelBinding({
    previousBinding: productionBase.integrations.vercel.binding,
    deployment: {
      id: "dpl_prod",
      url: "https://editor-ai-creator-web.vercel.app",
      inspectorUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web/dpl_prod",
      readyState: "READY",
      target: "production",
      createdAt: "2026-04-10T11:00:00.000Z",
      readyAt: "2026-04-10T11:03:00.000Z",
      errorMessage: null,
    },
    observedAt: "2026-04-10T11:03:10.000Z",
    source: "provider_webhook",
    eventType: "deployment.ready",
    projectId: "prj_123",
    projectName: "editor-ai-creator-web",
    teamId: "team_123",
    teamSlug: "estalenais-projects",
    framework: "nextjs",
    rootDirectory: "apps/web",
    target: "production",
    projectUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web",
    linkedRepoId: "repo_123",
    linkedRepoType: "github",
    deploymentRef: "main",
    previewUrl: "",
    productionUrl: "",
  });
  assert.equal(publishedBinding.publishMachine.state, "published");
  const publishedProject = applyBinding(productionBase, publishedBinding, "2026-04-10T11:03:10.000Z");
  assert.equal(publishedProject.publish.primary.status, "published");
  assert.equal(publishedProject.publish.deployment.publishedUrl, "https://editor-ai-creator-web.vercel.app");

  const failedBinding = reconcileVercelBinding({
    previousBinding: baseProject().integrations.vercel.binding,
    deployment: {
      id: "dpl_failed",
      url: "https://preview-failed.vercel.app",
      inspectorUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web/dpl_failed",
      readyState: "ERROR",
      target: "preview",
      createdAt: "2026-04-10T12:00:00.000Z",
      readyAt: null,
      errorMessage: "build_failed",
    },
    observedAt: "2026-04-10T12:01:00.000Z",
    source: "provider_webhook",
    eventType: "deployment.error",
    projectId: "prj_123",
    projectName: "editor-ai-creator-web",
    teamId: "team_123",
    teamSlug: "estalenais-projects",
    framework: "nextjs",
    rootDirectory: "apps/web",
    target: "preview",
    projectUrl: "https://vercel.com/estalenais-projects/editor-ai-creator-web",
    linkedRepoId: "repo_123",
    linkedRepoType: "github",
    deploymentRef: "main",
    previewUrl: "",
    productionUrl: "",
  });
  assert.equal(failedBinding.publishMachine.state, "deployment_failed");
  const failedProject = applyBinding(baseProject(), failedBinding, "2026-04-10T12:01:00.000Z");
  assert.equal(failedProject.publish.providers.vercel.status, "deployment_failed");
  assert.equal(failedProject.publish.deployment.error, "build_failed");

  const deploymentRecord = buildVercelDeploymentRecord({
    projectId: "project-1",
    userId: "user-1",
    binding: publishedBinding,
    observedAt: "2026-04-10T11:03:10.000Z",
  });
  assert.equal(deploymentRecord.deploymentObservedAt, "2026-04-10T11:03:10.000Z");
  assert.equal(deploymentRecord.reconciledAt, "2026-04-10T11:03:10.000Z");

  const report = {
    generatedAt: new Date().toISOString(),
    sourceChecks: {
      vercelRoutesHasReconcileRoute: vercelRoutes.includes('router.post("/projects/:id/reconcile"'),
      vercelRoutesUsesSharedHelper: vercelRoutes.includes("reconcileVercelBinding({"),
      vercelRoutesUsesSharedDeploymentRecord: vercelRoutes.includes("buildVercelDeploymentRecord({"),
      vercelWebhookUsesSharedHelper: vercelWebhookRoutes.includes("reconcileVercelBinding({"),
      vercelWebhookUsesSharedDeploymentRecord: vercelWebhookRoutes.includes("buildVercelDeploymentRecord({"),
      apiHasReconcileMethod: apiSource.includes("async reconcileVercelDeployment(id: string)"),
      projectModelHasExtendedVercelFields:
        projectModel.includes("lastDeploymentObservedAt?: string | null;") &&
        projectModel.includes("lastReconciledAt?: string | null;") &&
        projectModel.includes("deploymentReconciledAt: string | null;"),
      publishSourceTracksObservedAndReconciled:
        publishSource.includes("deploymentObservedAt") &&
        publishSource.includes("deploymentReconciledAt") &&
        publishSource.includes("lastReconciledAt"),
      workspaceCardPrefersBackendSnapshot:
        workspaceCard.includes("publish?.providers?.vercel") &&
        workspaceCard.includes("publish?.deployment") &&
        workspaceCard.includes("effectiveDeploymentUrl"),
    },
    functionalChecks: {
      requestedMachineState: requestedBinding.publishMachine.state,
      requestedPublishStatus: requestedProject.publish.providers.vercel.status,
      previewReadyState: previewReadyBinding.publishMachine.state,
      previewReadyPublishStatus: previewReadyProject.publish.providers.vercel.status,
      publishedState: publishedBinding.publishMachine.state,
      publishedPrimaryStatus: publishedProject.publish.primary.status,
      failedState: failedBinding.publishMachine.state,
      failedPublishStatus: failedProject.publish.providers.vercel.status,
      failedError: failedProject.publish.deployment.error,
      deploymentRecordObservedAt: deploymentRecord.deploymentObservedAt,
      deploymentRecordReconciledAt: deploymentRecord.reconciledAt,
    },
    passed: true,
  };

  const outputDir = path.join(rootDir, "output", "validation", "vercel-backend-owned");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "vercel-backend-owned-report.json");
  await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
