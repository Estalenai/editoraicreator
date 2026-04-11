export type PublishReconciliationState =
  | "idle"
  | "requested"
  | "running"
  | "ready"
  | "failed"
  | "merged"
  | "published"
  | "diverged"
  | "repo_missing"
  | "branch_missing"
  | "manually_resolved";

export type PublishReconciliationSnapshot = {
  version: string;
  sourceOfTruth: "backend";
  state: PublishReconciliationState;
  provider: "github" | "vercel" | "manual" | null;
  externalStatus: string | null;
  stateSinceAt: string | null;
  lastConfirmedState: Exclude<PublishReconciliationState, "idle" | "running" | "failed" | "diverged" | "repo_missing" | "branch_missing" | "manually_resolved"> | null;
  lastConfirmedAt: string | null;
  confirmedExternally: boolean;
  terminal: boolean;
  retryable: boolean;
  needsAttention: boolean;
  note: string;
  summary: string;
  nextAction: string;
  github: {
    status: string;
    externalStatus: string | null;
    repo: string | null;
    branch: string | null;
    commitSha: string | null;
    pullRequestState: string | null;
    updatedAt: string | null;
  };
  vercel: {
    status: string;
    externalStatus: string | null;
    environment: "preview" | "production" | null;
    deploymentId: string | null;
    deploymentUrl: string | null;
    updatedAt: string | null;
  };
  evidence: {
    repoConnected: boolean;
    commitConfirmed: boolean;
    pullRequestOpen: boolean;
    pullRequestMerged: boolean;
    deploymentRequested: boolean;
    previewReady: boolean;
    productionConfirmed: boolean;
    manualResolution: boolean;
  };
  timestamps: {
    requestedAt: string | null;
    runningAt: string | null;
    readyAt: string | null;
    failedAt: string | null;
    mergedAt: string | null;
    publishedAt: string | null;
    divergedAt: string | null;
    repoMissingAt: string | null;
    branchMissingAt: string | null;
    manuallyResolvedAt: string | null;
    reconciledAt: string | null;
    updatedAt: string | null;
  };
};

type PublishSource = {
  active?: boolean;
  status?: string | null;
  externalStatus?: string | null;
  repo?: string | null;
  branch?: string | null;
  commitSha?: string | null;
  pullRequestState?: string | null;
  deploymentId?: string | null;
  deploymentUrl?: string | null;
  environment?: "preview" | "production" | null;
  error?: string | null;
  pullRequestUrl?: string | null;
  publishedUrl?: string | null;
  timestamps?: {
    commitSyncedAt?: string | null;
    pullRequestAt?: string | null;
    updatedAt?: string | null;
    deploymentRequestedAt?: string | null;
    deploymentObservedAt?: string | null;
    deploymentReadyAt?: string | null;
    publishedAt?: string | null;
    reconciledAt?: string | null;
  };
};

type DeliveryLike = {
  stage?: string | null;
  connectedStorage?: string | null;
  lastExportedAt?: string | null;
  lastPublishedAt?: string | null;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeIso(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function pickFirstIso(...values: unknown[]): string | null {
  for (const value of values) {
    const iso = safeIso(value);
    if (iso) return iso;
  }
  return null;
}

function latestIso(...values: unknown[]): string | null {
  const normalized = values
    .map((value) => safeIso(value))
    .filter(Boolean)
    .sort((left, right) => (Date.parse(right || "") || 0) - (Date.parse(left || "") || 0));
  return normalized[0] || null;
}

function isManualResolutionCandidate({
  delivery,
  githubSource,
  vercelSource,
}: {
  delivery: DeliveryLike | null | undefined;
  githubSource: PublishSource | null | undefined;
  vercelSource: PublishSource | null | undefined;
}) {
  const deliveryStage = asText(delivery?.stage);
  const connectedStorage = asText(delivery?.connectedStorage);
  const hasManualMarker = connectedStorage === "manual";
  const hasPublishedMarker = Boolean(pickFirstIso(delivery?.lastPublishedAt));
  const hasExportMarker = Boolean(pickFirstIso(delivery?.lastExportedAt));
  const hasExternalActiveState =
    Boolean(githubSource?.active) ||
    Boolean(vercelSource?.active) ||
    asText(githubSource?.status) !== "idle" ||
    asText(vercelSource?.status) !== "idle";

  if (!(hasManualMarker || hasPublishedMarker || hasExportMarker)) return false;
  if (deliveryStage !== "published" && deliveryStage !== "exported") return false;
  return !hasExternalActiveState;
}

function buildStatePayload({
  state,
  provider,
  externalStatus,
  stateSinceAt,
  lastConfirmedState,
  lastConfirmedAt,
  timestamps,
  githubSource,
  vercelSource,
  needsAttention = false,
  retryable = false,
  note,
  summary,
  nextAction,
}: {
  state: PublishReconciliationState;
  provider: "github" | "vercel" | "manual" | null;
  externalStatus: string | null;
  stateSinceAt: string | null;
  lastConfirmedState: PublishReconciliationSnapshot["lastConfirmedState"];
  lastConfirmedAt: string | null;
  timestamps: PublishReconciliationSnapshot["timestamps"];
  githubSource: PublishSource | null | undefined;
  vercelSource: PublishSource | null | undefined;
  needsAttention?: boolean;
  retryable?: boolean;
  note: string;
  summary: string;
  nextAction: string;
}): PublishReconciliationSnapshot {
  return {
    version: "editor-ai-creator.publish-reconciliation.v1",
    sourceOfTruth: "backend",
    state,
    provider,
    externalStatus,
    stateSinceAt,
    lastConfirmedState,
    lastConfirmedAt,
    confirmedExternally: state !== "idle" && state !== "manually_resolved",
    terminal:
      state === "failed" ||
      state === "published" ||
      state === "repo_missing" ||
      state === "branch_missing" ||
      state === "diverged" ||
      state === "manually_resolved",
    retryable,
    needsAttention,
    note,
    summary,
    nextAction,
    github: {
      status: asText(githubSource?.status) || "idle",
      externalStatus: githubSource?.externalStatus || null,
      repo: githubSource?.repo || null,
      branch: githubSource?.branch || null,
      commitSha: githubSource?.commitSha || null,
      pullRequestState: githubSource?.pullRequestState || null,
      updatedAt: githubSource?.timestamps?.updatedAt || null,
    },
    vercel: {
      status: asText(vercelSource?.status) || "idle",
      externalStatus: vercelSource?.externalStatus || null,
      environment: vercelSource?.environment || null,
      deploymentId: vercelSource?.deploymentId || null,
      deploymentUrl: vercelSource?.deploymentUrl || null,
      updatedAt: vercelSource?.timestamps?.updatedAt || null,
    },
    evidence: {
      repoConnected: Boolean(githubSource?.repo),
      commitConfirmed: Boolean(githubSource?.commitSha),
      pullRequestOpen: asText(githubSource?.pullRequestState) === "open",
      pullRequestMerged: asText(githubSource?.pullRequestState) === "merged",
      deploymentRequested: Boolean(vercelSource?.deploymentId),
      previewReady: asText(vercelSource?.status) === "deployment_ready",
      productionConfirmed: asText(vercelSource?.status) === "published",
      manualResolution: state === "manually_resolved",
    },
    timestamps,
  };
}

export function buildPublishReconciliation({
  githubSource = null,
  vercelSource = null,
  delivery = null,
  timestamps = null,
}: {
  githubSource?: PublishSource | null;
  vercelSource?: PublishSource | null;
  delivery?: DeliveryLike | null;
  timestamps?: { updatedAt?: string | null } | null;
} = {}): PublishReconciliationSnapshot {
  const githubStatus = asText(githubSource?.status);
  const vercelStatus = asText(vercelSource?.status);

  const milestoneTimestamps: PublishReconciliationSnapshot["timestamps"] = {
    requestedAt:
      pickFirstIso(
        vercelSource?.timestamps?.deploymentRequestedAt,
        githubSource?.timestamps?.commitSyncedAt,
        delivery?.lastExportedAt
      ) || null,
    runningAt:
      vercelStatus === "deployment_running"
        ? pickFirstIso(
            vercelSource?.timestamps?.deploymentObservedAt,
            vercelSource?.timestamps?.deploymentRequestedAt,
            vercelSource?.timestamps?.updatedAt
          )
        : null,
    readyAt:
      pickFirstIso(
        vercelStatus === "deployment_ready"
          ? pickFirstIso(
              vercelSource?.timestamps?.deploymentReadyAt,
              vercelSource?.timestamps?.deploymentObservedAt,
              vercelSource?.timestamps?.updatedAt
            )
          : null,
        githubStatus === "pull_request_open"
          ? pickFirstIso(
              githubSource?.timestamps?.pullRequestAt,
              githubSource?.timestamps?.updatedAt
            )
          : null
      ) || null,
    failedAt:
      pickFirstIso(
        vercelStatus === "deployment_failed"
          ? pickFirstIso(
              vercelSource?.timestamps?.reconciledAt,
              vercelSource?.timestamps?.deploymentObservedAt,
              vercelSource?.timestamps?.updatedAt
            )
          : null,
        githubStatus === "pull_request_closed"
          ? pickFirstIso(
              githubSource?.timestamps?.pullRequestAt,
              githubSource?.timestamps?.updatedAt
            )
          : null
      ) || null,
    mergedAt:
      githubStatus === "pull_request_merged"
        ? pickFirstIso(
            githubSource?.timestamps?.pullRequestAt,
            githubSource?.timestamps?.updatedAt
          )
        : null,
    publishedAt:
      pickFirstIso(
        vercelStatus === "published"
          ? pickFirstIso(
              vercelSource?.timestamps?.publishedAt,
              vercelSource?.timestamps?.deploymentReadyAt,
              vercelSource?.timestamps?.updatedAt
            )
          : null,
        delivery?.lastPublishedAt
      ) || null,
    divergedAt:
      githubStatus === "diverged"
        ? pickFirstIso(githubSource?.timestamps?.updatedAt)
        : null,
    repoMissingAt:
      githubStatus === "repo_missing"
        ? pickFirstIso(githubSource?.timestamps?.updatedAt)
        : null,
    branchMissingAt:
      githubStatus === "branch_missing"
        ? pickFirstIso(githubSource?.timestamps?.updatedAt)
        : null,
    manuallyResolvedAt:
      isManualResolutionCandidate({ delivery, githubSource, vercelSource })
        ? pickFirstIso(delivery?.lastPublishedAt, delivery?.lastExportedAt)
        : null,
    reconciledAt:
      latestIso(
        vercelSource?.timestamps?.reconciledAt,
        vercelSource?.timestamps?.deploymentObservedAt,
        githubSource?.timestamps?.updatedAt,
        timestamps?.updatedAt
      ) || null,
    updatedAt:
      latestIso(
        timestamps?.updatedAt,
        vercelSource?.timestamps?.updatedAt,
        githubSource?.timestamps?.updatedAt,
        delivery?.lastPublishedAt,
        delivery?.lastExportedAt
      ) || null,
  };

  const externalConfirmedTimestamps = {
    requestedAt:
      vercelStatus === "deployment_requested"
        ? pickFirstIso(
            vercelSource?.timestamps?.deploymentRequestedAt,
            vercelSource?.timestamps?.updatedAt
          )
        : githubStatus === "commit_synced"
          ? pickFirstIso(
              githubSource?.timestamps?.commitSyncedAt,
              githubSource?.timestamps?.updatedAt
            )
          : null,
    readyAt:
      vercelStatus === "deployment_ready"
        ? pickFirstIso(
            vercelSource?.timestamps?.deploymentReadyAt,
            vercelSource?.timestamps?.deploymentObservedAt,
            vercelSource?.timestamps?.updatedAt
          )
        : githubStatus === "pull_request_open"
          ? pickFirstIso(
              githubSource?.timestamps?.pullRequestAt,
              githubSource?.timestamps?.updatedAt
            )
          : null,
    mergedAt:
      githubStatus === "pull_request_merged"
        ? pickFirstIso(
            githubSource?.timestamps?.pullRequestAt,
            githubSource?.timestamps?.updatedAt
          )
        : null,
    publishedAt:
      vercelStatus === "published"
        ? pickFirstIso(
            vercelSource?.timestamps?.publishedAt,
            vercelSource?.timestamps?.deploymentReadyAt,
            vercelSource?.timestamps?.updatedAt
          )
        : null,
  };

  const lastConfirmedState: PublishReconciliationSnapshot["lastConfirmedState"] = externalConfirmedTimestamps.publishedAt
    ? "published"
    : externalConfirmedTimestamps.readyAt
      ? "ready"
      : externalConfirmedTimestamps.mergedAt
        ? "merged"
        : externalConfirmedTimestamps.requestedAt
          ? "requested"
          : null;

  const lastConfirmedAt = lastConfirmedState === "published"
    ? externalConfirmedTimestamps.publishedAt
    : lastConfirmedState === "ready"
      ? externalConfirmedTimestamps.readyAt
      : lastConfirmedState === "merged"
        ? externalConfirmedTimestamps.mergedAt
        : lastConfirmedState === "requested"
          ? externalConfirmedTimestamps.requestedAt
          : null;

  if (githubStatus === "repo_missing") {
    return buildStatePayload({
      state: "repo_missing",
      provider: "github",
      externalStatus: githubSource?.externalStatus || null,
      stateSinceAt: milestoneTimestamps.repoMissingAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      needsAttention: true,
      summary: "O repositório salvo no publish não foi encontrado no GitHub.",
      note: "A source of truth local continua persistida, mas o backend não consegue mais confirmar o repositório externo.",
      nextAction: "Revise owner, repo, token e vínculo salvo antes de tratar o publish como confiável.",
    });
  }

  if (githubStatus === "branch_missing") {
    return buildStatePayload({
      state: "branch_missing",
      provider: "github",
      externalStatus: githubSource?.externalStatus || null,
      stateSinceAt: milestoneTimestamps.branchMissingAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      needsAttention: true,
      retryable: true,
      summary: "A branch salva no publish não existe mais no GitHub.",
      note: "O backend confirmou o repositório, mas a branch rastreada pelo projeto desapareceu.",
      nextAction: "Recrie a branch ou ajuste o workspace GitHub antes de seguir para PR ou deploy.",
    });
  }

  if (githubStatus === "diverged") {
    return buildStatePayload({
      state: "diverged",
      provider: "github",
      externalStatus: githubSource?.externalStatus || null,
      stateSinceAt: milestoneTimestamps.divergedAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      needsAttention: true,
      retryable: true,
      summary: "O HEAD do GitHub divergiu do último commit salvo pelo produto.",
      note: "Existe drift real entre a source of truth do projeto e o estado atual da branch.",
      nextAction: "Reconcilie a branch antes de abrir PR, solicitar deploy ou tratar o publish como confirmado.",
    });
  }

  if (vercelStatus === "published") {
    return buildStatePayload({
      state: "published",
      provider: "vercel",
      externalStatus: vercelSource?.externalStatus || null,
      stateSinceAt: milestoneTimestamps.publishedAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      summary: "A Vercel confirmou a publicação externa do projeto.",
      note:
        vercelSource?.publishedUrl
          ? `Produção confirmada em ${vercelSource.publishedUrl}.`
          : "Produção confirmada externamente pela Vercel.",
      nextAction: "Use a URL publicada como confirmação externa final e só abra nova rodada quando houver nova iteração.",
    });
  }

  if (vercelStatus === "deployment_failed" || githubStatus === "pull_request_closed") {
    const provider = vercelStatus === "deployment_failed" ? "vercel" : "github";
    const externalStatus = provider === "vercel" ? vercelSource?.externalStatus : githubSource?.externalStatus;

    return buildStatePayload({
      state: "failed",
      provider,
      externalStatus: externalStatus || null,
      stateSinceAt: milestoneTimestamps.failedAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      needsAttention: true,
      retryable: true,
      summary:
        provider === "vercel"
          ? "A Vercel devolveu falha para o deployment rastreado."
          : "O pull request do publish foi fechado sem merge.",
      note:
        provider === "vercel"
          ? vercelSource?.error || "O deployment falhou externamente."
          : "O GitHub confirmou que o PR não avançou para merge.",
      nextAction:
        provider === "vercel"
          ? "Revise a causa do erro, corrija a base do projeto e solicite novo deploy só depois da reconciliação."
          : "Reabra o PR ou sincronize uma nova branch antes de seguir para deploy.",
    });
  }

  if (vercelStatus === "deployment_ready" || githubStatus === "pull_request_open") {
    const provider = vercelStatus === "deployment_ready" ? "vercel" : "github";
    const externalStatus = provider === "vercel" ? vercelSource?.externalStatus : githubSource?.externalStatus;

    return buildStatePayload({
      state: "ready",
      provider,
      externalStatus: externalStatus || null,
      stateSinceAt: milestoneTimestamps.readyAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      summary:
        provider === "vercel"
          ? "O deployment já está pronto, mas ainda não foi confirmado como publicação final."
          : "O PR está aberto e rastreado; a trilha externa já está pronta para decisão.",
      note:
        provider === "vercel"
          ? vercelSource?.deploymentUrl
            ? `Preview confirmada em ${vercelSource.deploymentUrl}.`
            : "Preview confirmada externamente pela Vercel."
          : githubSource?.pullRequestUrl
            ? `PR ativo em ${githubSource.pullRequestUrl}.`
            : "PR ativo confirmado pelo GitHub.",
      nextAction:
        provider === "vercel"
          ? "Revise a saída, valide o preview e só então promova para produção."
          : "Revise e faça merge do PR antes de seguir para deploy.",
    });
  }

  if (vercelStatus === "deployment_running") {
    return buildStatePayload({
      state: "running",
      provider: "vercel",
      externalStatus: vercelSource?.externalStatus || null,
      stateSinceAt: milestoneTimestamps.runningAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      summary: "O deployment está em processamento na Vercel.",
      note: "O backend já tem deployment id e estado externo ativo, mas o publish ainda não chegou a um estado terminal.",
      nextAction: "Continue reconciliando por webhook ou polling até READY, FAILED ou PUBLISHED.",
    });
  }

  if (vercelStatus === "deployment_requested" || githubStatus === "commit_synced") {
    const provider = vercelStatus === "deployment_requested" ? "vercel" : "github";
    const externalStatus = provider === "vercel" ? vercelSource?.externalStatus : githubSource?.externalStatus;

    return buildStatePayload({
      state: "requested",
      provider,
      externalStatus: externalStatus || null,
      stateSinceAt: milestoneTimestamps.requestedAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      summary:
        provider === "vercel"
          ? "O deployment foi solicitado e já existe na Vercel, mas ainda não entrou em execução observável."
          : "O commit já foi sincronizado no GitHub e a trilha de publish saiu do estado local.",
      note:
        provider === "vercel"
          ? `Deployment ${vercelSource?.deploymentId || "pendente"} aguardando nova observação externa.`
          : githubSource?.commitSha
            ? `Commit ${githubSource.commitSha.slice(0, 7)} confirmado no GitHub.`
            : "Snapshot confirmado externamente no GitHub.",
      nextAction:
        provider === "vercel"
          ? "Aguarde o processamento ou force nova reconciliação até o estado running, ready ou failed."
          : "Abra o PR ou dispare o deploy quando a branch estiver pronta para avançar.",
    });
  }

  if (githubStatus === "pull_request_merged") {
    return buildStatePayload({
      state: "merged",
      provider: "github",
      externalStatus: githubSource?.externalStatus || null,
      stateSinceAt: milestoneTimestamps.mergedAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      summary: "O GitHub confirmou o merge da branch do publish.",
      note: "A etapa de revisão foi concluída externamente, mas o publish final ainda depende do deployment.",
      nextAction: "Solicite ou acompanhe o deploy na Vercel até a confirmação final da publicação.",
    });
  }

  if (milestoneTimestamps.manuallyResolvedAt) {
    return buildStatePayload({
      state: "manually_resolved",
      provider: "manual",
      externalStatus: null,
      stateSinceAt: milestoneTimestamps.manuallyResolvedAt,
      lastConfirmedState,
      lastConfirmedAt,
      timestamps: milestoneTimestamps,
      githubSource,
      vercelSource,
      needsAttention: true,
      summary: "O publish foi encerrado manualmente, sem confirmação externa completa.",
      note: "Existe marca operacional de exportação/publicação, mas não há reconciliação confiável com GitHub ou Vercel.",
      nextAction: "Trate esse estado como exceção operacional e reconcilie externamente antes de chamar o publish de confiável.",
    });
  }

  return buildStatePayload({
    state: "idle",
    provider: null,
    externalStatus: null,
    stateSinceAt: null,
    lastConfirmedState,
    lastConfirmedAt,
    timestamps: milestoneTimestamps,
    githubSource,
    vercelSource,
    summary: "Ainda não existe publish externo reconciliado para este projeto.",
    note: "A base local pode existir, mas a trilha GitHub/Vercel ainda não fechou uma confirmação externa útil.",
    nextAction: "Comece pelo checkpoint e sync GitHub ou pela solicitação de deploy quando o projeto estiver pronto.",
  });
}
