import type { ProjectPublishSourceOfTruth, ProjectPublishReconciliationState } from "../../lib/projectModel";
import type { OperationalStateKind, OperationalStateMetaItem } from "../ui/OperationalState";

export type PublishTrustScope = "overview" | "github" | "vercel";

export type PublishTrustPresentation = {
  kind: OperationalStateKind;
  title: string;
  description: string;
  meta: OperationalStateMetaItem[];
  details: string[];
  footer: string;
  stateLabel: string;
  providerLabel: string;
  confirmationLabel: string;
};

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "Ainda não registrado";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
}

function reconciliationStateLabel(state: ProjectPublishReconciliationState): string {
  if (state === "requested") return "Solicitado";
  if (state === "running") return "Em execução";
  if (state === "ready") return "Pronto";
  if (state === "failed") return "Falhou";
  if (state === "merged") return "Mergeado";
  if (state === "published") return "Publicado";
  if (state === "diverged") return "Divergente";
  if (state === "repo_missing") return "Repositório ausente";
  if (state === "branch_missing") return "Branch ausente";
  if (state === "manually_resolved") return "Resolvido manualmente";
  return "Sem confirmação externa";
}

function providerLabel(provider: "github" | "vercel" | "manual" | null): string {
  if (provider === "github") return "GitHub";
  if (provider === "vercel") return "Vercel";
  if (provider === "manual") return "Manual";
  return "Nenhum";
}

function githubStatusLabel(status: string | null | undefined): string {
  if (status === "commit_synced") return "Commit sincronizado";
  if (status === "pull_request_open") return "PR aberto";
  if (status === "pull_request_merged") return "PR mergeado";
  if (status === "pull_request_closed") return "PR fechado";
  if (status === "repo_missing") return "Repositório ausente";
  if (status === "branch_missing") return "Branch ausente";
  if (status === "diverged") return "Branch divergente";
  return "Sem retorno externo";
}

function vercelStatusLabel(status: string | null | undefined): string {
  if (status === "deployment_requested") return "Deploy solicitado";
  if (status === "deployment_running") return "Deploy em andamento";
  if (status === "deployment_ready") return "Preview pronto";
  if (status === "published") return "Publicado";
  if (status === "deployment_failed") return "Deploy falhou";
  if (status === "READY") return "Pronto";
  if (status === "ERROR") return "Falhou";
  if (status === "CANCELED") return "Cancelado";
  if (status === "BUILDING") return "Buildando";
  if (status === "INITIALIZING") return "Inicializando";
  if (status === "QUEUED") return "Na fila";
  return "Sem retorno externo";
}

function metaToneForState(state: ProjectPublishReconciliationState): OperationalStateMetaItem["tone"] {
  if (state === "published" || state === "ready" || state === "merged") return "success";
  if (state === "failed" || state === "diverged" || state === "repo_missing" || state === "branch_missing") {
    return "danger";
  }
  if (state === "requested" || state === "running" || state === "manually_resolved") return "warning";
  return "default";
}

function operationalKindForState(state: ProjectPublishReconciliationState): OperationalStateKind {
  if (state === "published") return "published";
  if (state === "ready" || state === "merged") return "success";
  if (state === "requested" || state === "running") return "syncing";
  if (state === "failed") return "failed-publish";
  if (state === "diverged" || state === "repo_missing" || state === "branch_missing" || state === "manually_resolved") {
    return "retry";
  }
  return "empty";
}

function trustTitle(state: ProjectPublishReconciliationState, provider: "github" | "vercel" | "manual" | null): string {
  if (state === "published") return "Publicação confirmada externamente";
  if (state === "ready") {
    return provider === "github"
      ? "PR confirmado e aguardando fechamento final"
      : "Deploy pronto e confirmado pelo provider";
  }
  if (state === "merged") return "Merge confirmado e aguardando publish final";
  if (state === "requested" || state === "running") return "Publish em andamento com trilha real";
  if (state === "failed") return "Publish falhou com confirmação externa";
  if (state === "diverged" || state === "repo_missing" || state === "branch_missing") {
    return "Publish precisa de atenção operacional";
  }
  if (state === "manually_resolved") return "Publish encerrado manualmente";
  return "Publish ainda sem confirmação externa";
}

function environmentLabel(environment: "preview" | "production" | null | undefined): string {
  if (environment === "production") return "Produção";
  if (environment === "preview") return "Preview";
  return "Não definido";
}

function pushDetail(details: string[], value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized || details.includes(normalized)) return;
  details.push(normalized);
}

export function buildPublishTrustState({
  publish,
  scope = "overview",
}: {
  publish: ProjectPublishSourceOfTruth;
  scope?: PublishTrustScope;
}): PublishTrustPresentation {
  const reconciliation = publish.reconciliation;
  const stateLabel = reconciliationStateLabel(reconciliation.state);
  const currentProviderLabel = providerLabel(reconciliation.provider);
  const confirmationLabel = reconciliation.confirmedExternally
    ? "Confirmado externamente"
    : reconciliation.provider === "manual"
      ? "Manual, sem confirmação externa"
      : "Ainda não confirmado";
  const externalStatusLabel =
    reconciliation.provider === "github"
      ? githubStatusLabel(reconciliation.externalStatus || reconciliation.github.externalStatus)
      : reconciliation.provider === "vercel"
        ? vercelStatusLabel(reconciliation.externalStatus || reconciliation.vercel.externalStatus)
        : "Sem provider externo";

  const meta: OperationalStateMetaItem[] = [
    {
      label: "Estado atual",
      value: stateLabel,
      tone: metaToneForState(reconciliation.state),
    },
    {
      label: "Provider dono",
      value: currentProviderLabel,
    },
    {
      label: "Confirmação externa",
      value: confirmationLabel,
      tone: reconciliation.confirmedExternally ? "success" : reconciliation.provider === "manual" ? "warning" : "default",
    },
    {
      label: "Último marco confiável",
      value: reconciliation.lastConfirmedState
        ? `${reconciliationStateLabel(reconciliation.lastConfirmedState)} • ${formatDateLabel(reconciliation.lastConfirmedAt)}`
        : "Nenhum confirmado",
      tone: reconciliation.lastConfirmedState ? "success" : "default",
    },
    {
      label: "Ação imediata",
      value: reconciliation.needsAttention
        ? "Precisa de atenção"
        : reconciliation.terminal && reconciliation.confirmedExternally
          ? "Nenhuma"
          : "Acompanhar",
      tone: reconciliation.needsAttention ? "danger" : reconciliation.terminal && reconciliation.confirmedExternally ? "success" : "warning",
    },
  ];

  if (scope === "github") {
    meta.push(
      {
        label: "Repositório",
        value: publish.repo.id || reconciliation.github.repo || "Ainda não vinculado",
      },
      {
        label: "Branch",
        value: reconciliation.github.branch || publish.repo.branch || "Ainda não confirmada",
      },
      {
        label: "Status GitHub",
        value: githubStatusLabel(reconciliation.github.externalStatus || reconciliation.github.status),
      }
    );
  } else if (scope === "vercel") {
    meta.push(
      {
        label: "Ambiente",
        value: environmentLabel(publish.deployment.environment || reconciliation.vercel.environment),
      },
      {
        label: "Deployment",
        value: reconciliation.vercel.deploymentId || publish.deployment.deploymentId || "Ainda não solicitado",
      },
      {
        label: "Status Vercel",
        value: vercelStatusLabel(reconciliation.vercel.externalStatus || reconciliation.vercel.status),
      }
    );
  } else {
    meta.push(
      {
        label: "GitHub",
        value:
          publish.repo.id ||
          (reconciliation.github.repo && reconciliation.github.branch
            ? `${reconciliation.github.repo} • ${reconciliation.github.branch}`
            : reconciliation.github.repo || "Ainda sem base confirmada"),
      },
      {
        label: "Vercel",
        value:
          reconciliation.vercel.deploymentId ||
          publish.deployment.projectName ||
          (publish.deployment.environment ? environmentLabel(publish.deployment.environment) : "Ainda sem deploy"),
      }
    );
  }

  const details: string[] = [];
  pushDetail(details, reconciliation.summary);
  pushDetail(details, reconciliation.note);
  pushDetail(
    details,
    reconciliation.provider
      ? `Status externo ${currentProviderLabel}: ${externalStatusLabel}.`
      : null
  );

  if (reconciliation.lastConfirmedState && reconciliation.lastConfirmedState !== reconciliation.state) {
    pushDetail(
      details,
      `Último marco externo confiável: ${reconciliationStateLabel(reconciliation.lastConfirmedState)} em ${formatDateLabel(reconciliation.lastConfirmedAt)}.`
    );
  }

  if (scope !== "vercel" && reconciliation.github.commitSha) {
    pushDetail(details, `Commit confirmado: ${reconciliation.github.commitSha.slice(0, 7)}.`);
  }
  if (scope !== "vercel" && publish.commit.pullRequestNumber) {
    pushDetail(
      details,
      `PR rastreado: #${publish.commit.pullRequestNumber}${publish.commit.pullRequestState ? ` • ${publish.commit.pullRequestState}` : ""}.`
    );
  }
  if (scope !== "github" && reconciliation.vercel.deploymentId) {
    pushDetail(details, `Deployment rastreado: ${reconciliation.vercel.deploymentId}.`);
  }
  if (scope !== "github" && publish.deployment.publishedUrl) {
    pushDetail(details, `URL publicada: ${publish.deployment.publishedUrl}.`);
  } else if (scope !== "github" && reconciliation.vercel.deploymentUrl) {
    pushDetail(details, `URL observada: ${reconciliation.vercel.deploymentUrl}.`);
  }
  if (!reconciliation.confirmedExternally && reconciliation.provider === "manual") {
    pushDetail(details, "Este fechamento é manual e não substitui confirmação externa do provider.");
  }

  return {
    kind: operationalKindForState(reconciliation.state),
    title: trustTitle(reconciliation.state, reconciliation.provider),
    description: reconciliation.summary,
    meta,
    details,
    footer: reconciliation.nextAction,
    stateLabel,
    providerLabel: currentProviderLabel,
    confirmationLabel,
  };
}
