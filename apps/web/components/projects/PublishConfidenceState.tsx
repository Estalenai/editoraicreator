"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ensureCanonicalProjectData } from "../../lib/projectModel";
import { EditorRouteLink } from "../ui/EditorRouteLink";
import {
  deriveVercelDeployStatus,
  resolveVercelPublishMachine,
  vercelDeployStatusLabel,
  vercelEnvironmentLabel,
  vercelPublishMachineLabel,
  vercelPublishMachineMetaTone,
} from "../../lib/vercelWorkspace";
import { OperationalState, type OperationalStateKind, type OperationalStateMetaItem } from "../ui/OperationalState";

type ProjectLike = {
  id: string;
  title: string;
  kind: string;
  updatedAt?: string | null;
  data?: any;
};

type Props = {
  projects: ProjectLike[];
};

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "Ainda não registrado";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return String(value);
  }
}

function channelLabel(channel: string | null | undefined): string {
  if (channel === "vercel") return "Vercel";
  if (channel === "github") return "GitHub";
  if (channel === "manual") return "Manual";
  return "Projeto";
}

function repoLabel(binding: any): string {
  const owner = String(binding?.owner || "").trim();
  const repo = String(binding?.repo || "").trim();
  if (!owner || !repo) return "Base GitHub pendente";
  return `${owner}/${repo}`;
}

function vercelEnvironmentValue(binding: any): string {
  if (!binding) return "Não se aplica";
  return vercelEnvironmentLabel(binding.lastDeploymentTarget || binding.target || "preview");
}

function deriveFocusProject(projects: ProjectLike[]) {
  const candidates = projects.map((project) => {
    const canonical = ensureCanonicalProjectData(project.data, {
      projectKind: project.kind,
      projectTitle: project.title,
    });
    const delivery = canonical.delivery;
    const github = canonical.integrations.github;
    const vercel = canonical.integrations.vercel;
    const publishMachine = resolveVercelPublishMachine(vercel.binding);
    const hasVercel =
      Boolean(vercel.binding?.projectName) ||
      Boolean(vercel.binding?.lastDeploymentId) ||
      publishMachine.state !== "idle";
    const hasGitHub = Boolean(github.binding || github.exports.length || github.versions.length);
    const rank =
      publishMachine.state === "published"
        ? 420
        : delivery.stage === "published"
          ? 400
          : publishMachine.state === "deployment_requested" ||
              publishMachine.state === "deployment_running" ||
              publishMachine.state === "deployment_ready" ||
              publishMachine.state === "deployment_failed"
            ? 320
            : hasGitHub && (github.exports.length || delivery.connectedStorage === "github")
              ? 220
              : delivery.stage === "exported"
                ? 180
                : hasVercel || hasGitHub
                  ? 120
                  : 0;
    const ts =
      Date.parse(
        publishMachine.lastTransitionAt ||
          publishMachine.lastCheckedAt ||
          delivery.lastPublishedAt ||
          vercel.binding?.lastDeployReadyAt ||
          vercel.binding?.lastDeployRequestedAt ||
          delivery.lastExportedAt ||
          project.updatedAt ||
          ""
      ) || 0;
    return { project, canonical, rank, ts };
  });

  return candidates.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return b.ts - a.ts;
  })[0] || null;
}

export function PublishConfidenceState({ projects }: Props) {
  const publishState = useMemo(() => {
    const focus = deriveFocusProject(projects);
    if (!focus) {
      return {
        kind: "empty" as const,
        title: "Sem camada de publish ativa ainda",
        description:
          "Assim que um projeto ganhar base de saída ou publicação, esta área passa a mostrar canal, ambiente, horário e próximo passo com mais clareza.",
        emphasis: "Aguardando primeiro projeto",
        meta: [
          { label: "Publish", value: "Ainda não iniciado" },
          { label: "Confiança", value: "Sem trilha ativa" },
        ] satisfies OperationalStateMetaItem[],
        details: [
          "Crie ou salve um projeto no editor.",
          "Depois disso, conecte GitHub ou Vercel para ativar a trilha operacional.",
        ],
        footer: "A camada de publish aparece aqui para reduzir ambiguidade antes, durante e depois da saída.",
        actions: (
          <>
            <EditorRouteLink href="/editor/new" className="btn-link-ea btn-primary btn-sm">
              Criar projeto
            </EditorRouteLink>
            <Link href="/creators" className="btn-link-ea btn-ghost btn-sm">
              Ir para Creators
            </Link>
          </>
        ),
      };
    }

    const { project, canonical } = focus;
    const delivery = canonical.delivery;
    const github = canonical.integrations.github;
    const vercel = canonical.integrations.vercel;
    const publish = canonical.publish;
    const vercelBinding = vercel.binding;
    const publishMachine = resolveVercelPublishMachine(vercelBinding);
    const latestEvent = delivery.history[0] || null;
    const publishChannel = channelLabel(publish.primary.provider || delivery.connectedStorage || latestEvent?.channel || null);
    const environment = publish.deployment.environment
      ? vercelEnvironmentLabel(publish.deployment.environment)
      : vercelEnvironmentValue(vercelBinding);
    const exportedAt =
      publish.timestamps.deploymentRequestedAt ||
      publish.timestamps.commitSyncedAt ||
      publishMachine.lastTransitionAt ||
      publishMachine.lastCheckedAt ||
      vercelBinding?.lastDeployRequestedAt ||
      delivery.lastExportedAt;
    const publishedAt =
      publish.timestamps.publishedAt ||
      publishMachine.lastSuccessAt ||
      vercelBinding?.lastDeployReadyAt ||
      delivery.lastPublishedAt;
    const projectHref = project.id ? `/editor/${project.id}` : "/editor/new";
    const handoffHref = vercelBinding?.projectName ? "#vercel-publish" : "#github-workspace";
    const syncLabel =
      publishMachine.state !== "idle"
        ? vercelPublishMachineLabel(publishMachine)
        : github.binding
          ? "Base salva"
          : "Sem sincronização";
    const syncTone =
      publishMachine.state !== "idle"
        ? vercelPublishMachineMetaTone(publishMachine)
        : ("default" as const);
    const hasPublishError = publishMachine.state === "deployment_failed";
    const providerPublished = publishMachine.state === "published";
    const providerReady = publishMachine.state === "deployment_ready";
    const providerRunning =
      publishMachine.state === "deployment_requested" || publishMachine.state === "deployment_running";

    let kind: OperationalStateKind = "saved";
    let title = "Base de publish pronta";
    let description =
      "O projeto já tem base de saída registrada. Falta exportar, disparar deployment ou sincronizar com o provider para fechar a trilha visível.";
    const meta: OperationalStateMetaItem[] = [
      { label: "Projeto", value: project.title },
      { label: "Canal", value: publishChannel },
      { label: "Ambiente", value: environment },
      {
        label: providerPublished ? "Publicado em" : "Último retorno",
        value: formatDateLabel(providerPublished ? publishedAt : exportedAt),
      },
      {
        label: "Sincronia",
        value: syncLabel,
        tone: syncTone,
      },
    ];
    const details: ReactNode[] = [];
    let footer = canonical.deliverable.nextAction;

    if (publish.deployment.projectName || vercelBinding?.projectName) {
      meta.push({
        label: "Deploy",
        value: vercelDeployStatusLabel(deriveVercelDeployStatus(vercelBinding)),
        tone: vercelPublishMachineMetaTone(publishMachine),
      });
    } else if (publish.repo.id || github.binding) {
      meta.push({
        label: "Workspace",
        value: publish.repo.id || repoLabel(github.binding),
      });
    }

    if (publishMachine.note) {
      details.push(publishMachine.note);
    }

    if (hasPublishError) {
      kind = "failed-publish";
      title = "Publicação falhou no provider";
      description =
        "A trilha de publish existe, mas o retorno reconciliado do provider fechou em falha. O estado agora é verificável e persistido.";
      details.push(vercelBinding?.lastDeployError || "A Vercel devolveu falha ou cancelamento para o último deployment.");
      footer = "Abra o handoff correspondente, corrija a origem do problema e só depois gere um novo deployment.";
    } else if (providerPublished) {
      kind = "published";
      title = "Publicação confirmada externamente";
      description =
        "A publicação agora depende da confirmação reconciliada do provider. O produto mostra canal, ambiente, horário e URL real sem semântica frouxa.";
      if (publish.deployment.publishedUrl || vercelBinding?.productionUrl) {
        details.push(`URL publicada: ${publish.deployment.publishedUrl || vercelBinding?.productionUrl}.`);
      }
      if (latestEvent?.note) {
        details.push(latestEvent.note);
      }
      footer =
        "Se houver nova iteração, volte ao editor, atualize a fonte e gere um novo deployment só quando a saída realmente precisar mudar.";
    } else if (providerReady || providerRunning) {
      kind = providerReady ? "success" : "syncing";
      title = providerReady ? "Deploy pronto aguardando próximo passo" : "Deployment em andamento";
      description =
        providerReady
          ? "O provider já devolveu READY. O produto mostra preview, ambiente e próximo passo sem ambiguidade."
          : "O deployment já saiu do produto e a camada de publish mostra o estado reconciliado devolvido pelo provider.";
      if (publish.deployment.deploymentUrl || vercelBinding?.lastDeploymentUrl) {
        details.push(`Deployment: ${publish.deployment.deploymentUrl || vercelBinding?.lastDeploymentUrl}.`);
      }
      if (latestEvent?.note) {
        details.push(latestEvent.note);
      }
      footer = providerReady
        ? "Promova ou trate como publicado só quando a saída final estiver correta."
        : "Reconcile o deployment até o provider devolver READY ou ERROR.";
    } else if (github.binding || vercelBinding) {
      kind = "saved";
      title = "Base de publish salva";
      description =
        "O projeto já tem base de saída persistida. Agora a camada confiável de publish depende do primeiro deployment ou sync real.";
      if (publish.deployment.projectName || vercelBinding?.projectName) {
        details.push(`Projeto Vercel salvo: ${publish.deployment.projectName || vercelBinding?.projectName}.`);
      }
      if (publish.repo.id || github.binding) {
        details.push(`Base GitHub salva em ${publish.repo.id || repoLabel(github.binding)}.`);
      }
      footer = "Dispare o deployment antes de considerar qualquer saída como sincronizada ou publicada.";
    } else {
      kind = "empty";
      title = "Publish ainda não preparado";
      description =
        "O projeto existe, mas ainda não tem base clara de saída. Salve GitHub ou Vercel para a plataforma começar a registrar a trilha de publicação.";
      details.push("Sem base GitHub ou Vercel persistida neste projeto.");
      footer = "Abra a camada de handoff abaixo e defina a base do canal antes de publicar.";
    }

    return {
      kind,
      title,
      description,
      emphasis: project.title,
      meta,
      details,
      footer,
      actions: (
        <>
          <EditorRouteLink href={projectHref} className="btn-link-ea btn-secondary btn-sm">
            Abrir projeto
          </EditorRouteLink>
          <Link href={handoffHref} className="btn-link-ea btn-ghost btn-sm">
            Ver handoff
          </Link>
            {publish.deployment.publishedUrl || vercelBinding?.productionUrl ? (
            <a href={publish.deployment.publishedUrl || vercelBinding?.productionUrl || "#"} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
              Abrir publicação
            </a>
          ) : null}
        </>
      ),
    };
  }, [projects]);

  return (
    <div className="projects-publish-status-layer">
      <OperationalState
        kind={publishState.kind}
        title={publishState.title}
        description={publishState.description}
        badge="Publish status"
        emphasis={publishState.emphasis}
        meta={publishState.meta}
        details={publishState.details}
        footer={publishState.footer}
        actions={publishState.actions}
      />
    </div>
  );
}
