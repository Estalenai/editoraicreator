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

export function resolveGitHubPullRequestState(pullRequest) {
  if (!pullRequest || typeof pullRequest !== "object") return null;
  if (safeIso(pullRequest.mergedAt)) return "merged";
  const state = asText(pullRequest.state).toLowerCase();
  if (state === "open") return "open";
  if (state === "closed") return "closed";
  return null;
}

export function deriveGitHubCommitStatus({ lastCommitSha, observedHeadSha }) {
  const lastCommit = asText(lastCommitSha);
  const observedHead = asText(observedHeadSha);
  if (!lastCommit || !observedHead) return null;
  return lastCommit === observedHead ? "confirmed" : "diverged";
}

export function deriveGitHubBackendStatus({
  hasWorkspace,
  repoMissing = false,
  branchMissing = false,
  pullRequestState = null,
  commitStatus = null,
}) {
  if (!hasWorkspace) return "idle";
  if (repoMissing) return "repo_missing";
  if (pullRequestState === "merged") return "pr_merged";
  if (pullRequestState === "open") return "pr_open";
  if (pullRequestState === "closed") return "pr_closed";
  if (branchMissing) return "branch_missing";
  if (commitStatus === "diverged") return "diverged";
  if (commitStatus === "confirmed") return "synced";
  return "verified";
}

export function reconcileGitHubBinding({
  binding,
  repoInfo = null,
  branchInfo = null,
  pullRequest = null,
  observedAt,
}) {
  const safeObservedAt = pickFirstIso(observedAt, new Date().toISOString()) || new Date().toISOString();
  const hasWorkspace = Boolean(binding?.owner && binding?.repo);
  const repoMissing = !repoInfo;
  const branchMissing = Boolean(repoInfo) && !branchInfo;
  const pullRequestState = resolveGitHubPullRequestState(pullRequest);
  const commitStatus = deriveGitHubCommitStatus({
    lastCommitSha: binding?.lastCommitSha,
    observedHeadSha: branchInfo?.sha || null,
  });
  const status = deriveGitHubBackendStatus({
    hasWorkspace,
    repoMissing,
    branchMissing,
    pullRequestState,
    commitStatus,
  });

  const pullRequestNumber = asNumber(pullRequest?.number);
  const pullRequestUrl = asText(pullRequest?.htmlUrl) || null;
  const pullRequestUpdatedAt = pickFirstIso(pullRequest?.updatedAt, pullRequest?.mergedAt, safeObservedAt);
  const defaultBranch = asText(repoInfo?.defaultBranch || binding?.defaultBranch || "main") || "main";

  let title = "GitHub reconciliado";
  let note = "O backend confirmou que o workspace GitHub continua íntegro.";
  let nextAction = "Siga com checkpoint, sync ou PR conforme a etapa atual do projeto.";

  if (status === "repo_missing") {
    title = "Repositório GitHub não encontrado";
    note = "O backend não encontrou mais o repositório salvo neste projeto.";
    nextAction = "Revise owner, repositório e token antes de tentar novo sync.";
  } else if (status === "branch_missing") {
    title = "Branch GitHub ausente";
    note = `A branch ${binding?.branch || "configurada"} não foi encontrada no repositório.`;
    nextAction = "Recrie a branch pelo fluxo de sync ou ajuste a branch salva no workspace.";
  } else if (status === "diverged") {
    title = "Branch divergente do último commit";
    note = `O backend confirmou que a branch aponta para ${String(branchInfo?.sha || "").slice(0, 7)}, diferente do último commit sincronizado pelo produto.`;
    nextAction = "Reconcile o contexto do projeto antes de abrir PR ou tratar o publish como confiável.";
  } else if (status === "pr_open") {
    title = "Pull request confirmado";
    note = pullRequestNumber
      ? `PR #${pullRequestNumber} continua aberto e rastreado no backend.`
      : "Existe um pull request aberto para a branch de trabalho.";
    nextAction = "Revise o PR antes de seguir para publish.";
  } else if (status === "pr_merged") {
    title = "Pull request mergeado";
    note = pullRequestNumber
      ? `PR #${pullRequestNumber} já foi mergeado no GitHub.`
      : "O backend detectou que o pull request desta branch já foi mergeado.";
    nextAction = "Se houver nova iteração, gere um novo checkpoint e sincronize novamente antes do próximo publish.";
  } else if (status === "pr_closed") {
    title = "Pull request fechado";
    note = pullRequestNumber
      ? `PR #${pullRequestNumber} foi fechado sem merge.`
      : "O backend detectou que o pull request desta branch foi fechado sem merge.";
    nextAction = "Ajuste a branch, sincronize novamente e reabra o PR só quando a trilha estiver consistente.";
  } else if (status === "synced") {
    title = "Commit confirmado no GitHub";
    note = `A branch salva no produto continua no commit ${String(branchInfo?.sha || "").slice(0, 7)}.`;
    nextAction = "Abra o pull request quando a revisão estiver pronta.";
  }

  return {
    status,
    verificationStatus: repoMissing ? "repo_missing" : branchMissing ? "branch_missing" : "verified",
    commitStatus,
    pullRequestState,
    pullRequestNumber,
    pullRequestUrl,
    pullRequestUpdatedAt,
    binding: {
      ...binding,
      repositoryUrl: asText(repoInfo?.htmlUrl) || asText(binding?.repositoryUrl) || null,
      defaultBranch,
      updatedAt: safeObservedAt,
      lastVerifiedAt: safeObservedAt,
      lastReconciledAt: safeObservedAt,
      verificationStatus: repoMissing ? "repo_missing" : branchMissing ? "branch_missing" : "verified",
      tokenConfigured: true,
      lastResolvedCommitSha: branchInfo?.sha || null,
      lastCommitStatus: commitStatus,
      lastSyncStatus: status,
      lastPullRequestNumber: pullRequestNumber,
      lastPullRequestUrl: pullRequestUrl,
      lastPullRequestState: pullRequestState,
      lastPullRequestUpdatedAt: pullRequestUpdatedAt,
    },
    exportPatch: {
      status,
      statusUpdatedAt: safeObservedAt,
      observedHeadSha: branchInfo?.sha || null,
      pullRequestNumber,
      pullRequestUrl,
      pullRequestState,
    },
    event: {
      title,
      note,
      observedAt: safeObservedAt,
      nextAction,
    },
  };
}
