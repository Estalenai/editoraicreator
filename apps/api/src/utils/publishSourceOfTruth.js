const PUBLISH_SOURCE_VERSION = "editor-ai-creator.publish-source.v1";
const PROJECT_SCHEMA_VERSION = "editor-ai-creator.project.v2";

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeIso(value) {
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function pickFirstIso(...values) {
  for (const value of values) {
    const iso = safeIso(value);
    if (iso) return iso;
  }
  return null;
}

function latestGitHubPullRequestTimestamp(github, history) {
  const latestExport = Array.isArray(github?.exports) ? github.exports[0] || null : null;
  if (!Array.isArray(history)) {
    return pickFirstIso(
      github?.binding?.lastPullRequestUpdatedAt,
      latestExport?.statusUpdatedAt,
      latestExport?.exportedAt
    );
  }
  const match = history.find(
    (event) => event && event.channel === "github" && /pull request/i.test(asText(event.title))
  );
  return pickFirstIso(
    github?.binding?.lastPullRequestUpdatedAt,
    latestExport?.statusUpdatedAt,
    latestExport?.exportedAt,
    match?.ts
  );
}

function deriveGitHubStatus(github, delivery) {
  const binding = github?.binding || null;
  const latestExport = Array.isArray(github?.exports) ? github.exports[0] || null : null;
  const latestVersion = Array.isArray(github?.versions) ? github.versions[0] || null : null;

  if (asText(binding?.lastPullRequestState) === "merged" || latestExport?.status === "pr_merged") {
    return "pull_request_merged";
  }
  if (asText(binding?.lastPullRequestState) === "closed" || latestExport?.status === "pr_closed") {
    return "pull_request_closed";
  }
  if (asText(binding?.lastPullRequestState) === "open" || latestExport?.status === "pr_open") {
    return "pull_request_open";
  }
  if (asText(binding?.lastSyncStatus) === "repo_missing" || latestExport?.status === "repo_missing") {
    return "repo_missing";
  }
  if (asText(binding?.lastSyncStatus) === "branch_missing" || latestExport?.status === "branch_missing") {
    return "branch_missing";
  }
  if (asText(binding?.lastSyncStatus) === "diverged" || latestExport?.status === "diverged") {
    return "diverged";
  }
  if (asText(binding?.lastSyncStatus) === "synced" || latestExport?.status === "synced") {
    return "commit_synced";
  }
  if (asText(binding?.lastSyncStatus) === "verified") {
    return "workspace_verified";
  }
  if (latestVersion) return "checkpoint_saved";
  if (binding?.owner && binding?.repo) return "workspace_saved";
  if (delivery?.connectedStorage === "github") return "output_registered";
  return "idle";
}

function buildGitHubSource(github, delivery) {
  const binding = github?.binding || null;
  const latestExport = Array.isArray(github?.exports) ? github.exports[0] || null : null;
  const latestVersion = Array.isArray(github?.versions) ? github.versions[0] || null : null;
  const status = deriveGitHubStatus(github, delivery);
  const owner = asText(binding?.owner);
  const repo = asText(binding?.repo);
  const active = Boolean(owner && repo);

  return {
    active,
    provider: active ? "github" : null,
    status,
    externalStatus:
      asText(binding?.lastPullRequestState) ||
      asText(binding?.lastSyncStatus) ||
      asText(latestExport?.status) ||
      null,
    repo: active ? `${owner}/${repo}` : null,
    repositoryUrl: asText(binding?.repositoryUrl) || null,
    owner: owner || null,
    repoName: repo || null,
    branch: asText(binding?.branch) || null,
    defaultBranch: asText(binding?.defaultBranch) || null,
    commitSha:
      asText(binding?.lastCommitSha) ||
      asText(latestExport?.commitSha) ||
      asText(binding?.lastResolvedCommitSha) ||
      null,
    commitUrl: asText(binding?.lastCommitUrl) || asText(latestExport?.commitUrl) || null,
    pullRequestNumber:
      asNumber(binding?.lastPullRequestNumber) ??
      asNumber(latestExport?.pullRequestNumber) ??
      null,
    pullRequestUrl: asText(binding?.lastPullRequestUrl) || asText(latestExport?.pullRequestUrl) || null,
    pullRequestState: asText(binding?.lastPullRequestState) || null,
    rootPath: asText(binding?.rootPath) || null,
    target: asText(binding?.target) || null,
    timestamps: {
      connectedAt: pickFirstIso(binding?.connectedAt),
      workspaceVerifiedAt: pickFirstIso(binding?.lastVerifiedAt, binding?.lastReconciledAt, binding?.updatedAt, binding?.connectedAt),
      checkpointAt: pickFirstIso(latestVersion?.savedAt),
      commitSyncedAt: pickFirstIso(binding?.lastSyncedAt, latestExport?.statusUpdatedAt, latestExport?.exportedAt),
      pullRequestAt: pickFirstIso(latestGitHubPullRequestTimestamp(github, delivery?.history)),
      updatedAt: pickFirstIso(
        binding?.lastReconciledAt,
        binding?.lastSyncedAt,
        latestExport?.statusUpdatedAt,
        latestExport?.exportedAt,
        latestVersion?.savedAt,
        binding?.updatedAt,
        binding?.connectedAt
      ),
    },
  };
}

function deriveVercelStatus(vercel, delivery) {
  const binding = vercel?.binding || null;
  const machineState = asText(binding?.publishMachine?.state);
  if (machineState === "published") return "published";
  if (machineState === "deployment_failed") return "deployment_failed";
  if (machineState === "deployment_ready") return "deployment_ready";
  if (machineState === "deployment_running") return "deployment_running";
  if (machineState === "deployment_requested") return "deployment_requested";
  if (machineState === "workspace_verified") return "workspace_verified";
  if (binding?.lastDeploymentId) return "deployment_requested";
  if (binding?.projectName) return "workspace_saved";
  if (delivery?.connectedStorage === "vercel") return "output_registered";
  return "idle";
}

function buildVercelSource(vercel, delivery) {
  const binding = vercel?.binding || null;
  const status = deriveVercelStatus(vercel, delivery);
  const active = Boolean(asText(binding?.projectName));
  const environment = asText(binding?.lastDeploymentTarget || binding?.target) || null;
  const deploymentUrl =
    asText(binding?.lastDeploymentUrl) ||
    (environment === "production" ? asText(binding?.productionUrl) : asText(binding?.previewUrl)) ||
    null;
  const publishedUrl = asText(binding?.productionUrl) || deploymentUrl || null;

  return {
    active,
    provider: active ? "vercel" : null,
    status,
    externalStatus:
      asText(binding?.publishMachine?.externalState) ||
      asText(binding?.lastDeploymentState) ||
      null,
    projectId: asText(binding?.projectId) || null,
    projectName: asText(binding?.projectName) || null,
    projectUrl: asText(binding?.projectUrl) || null,
    teamId: asText(binding?.teamId) || null,
    teamSlug: asText(binding?.teamSlug) || null,
    environment,
    deploymentId: asText(binding?.lastDeploymentId) || null,
    deploymentUrl,
    deploymentInspectorUrl: asText(binding?.lastDeploymentInspectorUrl) || null,
    publishedUrl,
    previewUrl: asText(binding?.previewUrl) || null,
    productionUrl: asText(binding?.productionUrl) || null,
    deployStatus: asText(binding?.deployStatus) || null,
    error: asText(binding?.lastDeployError) || null,
    timestamps: {
      connectedAt: pickFirstIso(binding?.connectedAt),
      workspaceVerifiedAt: pickFirstIso(binding?.lastVerifiedAt, binding?.updatedAt, binding?.connectedAt),
      deploymentRequestedAt: pickFirstIso(binding?.lastDeployRequestedAt),
      deploymentReadyAt: pickFirstIso(binding?.lastDeployReadyAt),
      deploymentCheckedAt: pickFirstIso(vercel?.lastDeploymentCheckedAt, binding?.publishMachine?.lastCheckedAt),
      publishedAt:
        environment === "production"
          ? pickFirstIso(
              binding?.publishMachine?.lastSuccessAt,
              binding?.lastDeployReadyAt,
              delivery?.lastPublishedAt
            )
          : null,
      updatedAt: pickFirstIso(
        binding?.publishMachine?.lastTransitionAt,
        vercel?.lastDeploymentCheckedAt,
        binding?.updatedAt
      ),
    },
  };
}

function buildPrimarySnapshot(githubSource, vercelSource, delivery) {
  if (vercelSource.active) {
    return {
      provider: "vercel",
      status: vercelSource.status,
      externalStatus: vercelSource.externalStatus,
      environment: vercelSource.environment,
      repo: githubSource.repo,
      branch: githubSource.branch,
      commitSha: githubSource.commitSha,
      commitUrl: githubSource.commitUrl,
      deploymentId: vercelSource.deploymentId,
      deploymentUrl: vercelSource.deploymentUrl,
      deploymentInspectorUrl: vercelSource.deploymentInspectorUrl,
      publishedUrl: vercelSource.publishedUrl,
      timestamps: {
        updatedAt:
          pickFirstIso(
            vercelSource.timestamps.updatedAt,
            githubSource.timestamps.updatedAt,
            delivery?.lastPublishedAt,
            delivery?.lastExportedAt
          ) || null,
        publishedAt: vercelSource.timestamps.publishedAt,
      },
    };
  }

  if (githubSource.active) {
    return {
      provider: "github",
      status: githubSource.status,
      externalStatus: githubSource.externalStatus,
      environment: null,
      repo: githubSource.repo,
      branch: githubSource.branch,
      commitSha: githubSource.commitSha,
      commitUrl: githubSource.commitUrl,
      deploymentId: null,
      deploymentUrl: null,
      deploymentInspectorUrl: null,
      publishedUrl: null,
      timestamps: {
        updatedAt:
          pickFirstIso(
            githubSource.timestamps.updatedAt,
            delivery?.lastExportedAt,
            delivery?.lastPublishedAt
          ) || null,
        publishedAt: null,
      },
    };
  }

  return {
    provider: null,
    status: "idle",
    externalStatus: null,
    environment: null,
    repo: null,
    branch: null,
    commitSha: null,
    commitUrl: null,
    deploymentId: null,
    deploymentUrl: null,
    deploymentInspectorUrl: null,
    publishedUrl: null,
    timestamps: {
      updatedAt: pickFirstIso(delivery?.lastPublishedAt, delivery?.lastExportedAt),
      publishedAt: pickFirstIso(delivery?.lastPublishedAt),
    },
  };
}

export function buildPublishSourceOfTruth(projectData) {
  const next = projectData && typeof projectData === "object" ? projectData : {};
  const delivery = next.delivery && typeof next.delivery === "object" ? next.delivery : {};
  const integrations = next.integrations && typeof next.integrations === "object" ? next.integrations : {};
  const githubSource = buildGitHubSource(integrations.github, delivery);
  const vercelSource = buildVercelSource(integrations.vercel, delivery);
  const primary = buildPrimarySnapshot(githubSource, vercelSource, delivery);

  return {
    version: PUBLISH_SOURCE_VERSION,
    sourceOfTruth: "backend",
    primary,
    repo: {
      provider: githubSource.active ? "github" : null,
      id: githubSource.repo,
      owner: githubSource.owner,
      name: githubSource.repoName,
      repositoryUrl: githubSource.repositoryUrl,
      branch: githubSource.branch,
      defaultBranch: githubSource.defaultBranch,
      rootPath: githubSource.rootPath,
      target: githubSource.target,
    },
    commit: {
      provider: githubSource.active ? "github" : null,
      sha: githubSource.commitSha,
      url: githubSource.commitUrl,
      pullRequestNumber: githubSource.pullRequestNumber,
      pullRequestUrl: githubSource.pullRequestUrl,
      pullRequestState: githubSource.pullRequestState,
      externalStatus: githubSource.externalStatus,
    },
    deployment: {
      provider: vercelSource.active ? "vercel" : null,
      projectId: vercelSource.projectId,
      projectName: vercelSource.projectName,
      projectUrl: vercelSource.projectUrl,
      teamId: vercelSource.teamId,
      teamSlug: vercelSource.teamSlug,
      environment: vercelSource.environment,
      deploymentId: vercelSource.deploymentId,
      deploymentUrl: vercelSource.deploymentUrl,
      deploymentInspectorUrl: vercelSource.deploymentInspectorUrl,
      previewUrl: vercelSource.previewUrl,
      productionUrl: vercelSource.productionUrl,
      publishedUrl: vercelSource.publishedUrl,
      externalStatus: vercelSource.externalStatus,
      deployStatus: vercelSource.deployStatus,
      error: vercelSource.error,
    },
    providers: {
      github: githubSource,
      vercel: vercelSource,
    },
    timestamps: {
      workspaceVerifiedAt:
        pickFirstIso(
          vercelSource.timestamps.workspaceVerifiedAt,
          githubSource.timestamps.workspaceVerifiedAt
        ) || null,
      checkpointAt: githubSource.timestamps.checkpointAt,
      commitSyncedAt: githubSource.timestamps.commitSyncedAt,
      pullRequestAt: githubSource.timestamps.pullRequestAt,
      deploymentRequestedAt: vercelSource.timestamps.deploymentRequestedAt,
      deploymentReadyAt: vercelSource.timestamps.deploymentReadyAt,
      deploymentCheckedAt: vercelSource.timestamps.deploymentCheckedAt,
      publishedAt:
        pickFirstIso(
          vercelSource.timestamps.publishedAt,
          delivery?.lastPublishedAt
        ) || null,
      updatedAt:
        pickFirstIso(
          primary.timestamps.updatedAt,
          vercelSource.timestamps.updatedAt,
          githubSource.timestamps.updatedAt
        ) || null,
    },
  };
}

export function applyPublishSourceOfTruth(projectData) {
  const next = projectData && typeof projectData === "object" ? projectData : {};
  return {
    ...next,
    schema: PROJECT_SCHEMA_VERSION,
    publish: buildPublishSourceOfTruth(next),
  };
}
