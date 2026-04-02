"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ensureCanonicalProjectData } from "../../lib/projectModel";
import {
  deriveVercelDeployStatus,
  vercelDeploymentStateLabel,
  vercelDeployStatusLabel,
  vercelEnvironmentLabel,
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
    const hasVercel =
      Boolean(vercel.binding?.projectName) ||
      Boolean(vercel.binding?.lastDeploymentId) ||
      Boolean(vercel.binding?.lastDeploymentState);
    const hasGitHub = Boolean(github.binding || github.exports.length || github.versions.length);
    const rank =
      delivery.stage === "published"
        ? 400
        : hasVercel && vercel.binding?.lastDeploymentId
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
            <Link href="/editor/new" className="btn-link-ea btn-primary btn-sm">
              Criar projeto
            </Link>
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
    const vercelBinding = vercel.binding;
    const latestEvent = delivery.history[0] || null;
    const publishChannel = channelLabel(delivery.connectedStorage || latestEvent?.channel || null);
    const environment = vercelEnvironmentValue(vercelBinding);
    const exportedAt = vercelBinding?.lastDeployRequestedAt || delivery.lastExportedAt;
    const publishedAt = vercelBinding?.lastDeployReadyAt || delivery.lastPublishedAt;
    const projectHref = project.id ? `/editor/${project.id}` : "/editor/new";
    const handoffHref = vercelBinding?.projectName ? "#vercel-publish" : "#github-workspace";
    const vercelState = vercelDeploymentStateLabel(vercelBinding?.lastDeploymentState);
    const syncLabel =
      delivery.stage === "published"
        ? "Confirmado pelo provider"
        : vercelBinding?.lastDeploymentId
          ? `Deployment ${vercelState}`
          : github.binding
            ? "Base salva"
            : "Sem sincronização";
    const syncTone =
      delivery.stage === "published"
        ? ("success" as const)
        : vercelBinding?.lastDeploymentState === "ERROR" || vercelBinding?.lastDeploymentState === "CANCELED"
          ? ("danger" as const)
          : vercelBinding?.lastDeploymentId
            ? ("warning" as const)
            : ("default" as const);

    const hasPublishError =
      vercelBinding?.lastDeploymentState === "ERROR" ||
      vercelBinding?.lastDeploymentState === "CANCELED" ||
      (delivery.stage === "published" && delivery.connectedStorage === "vercel" && !vercelBinding?.productionUrl);

    let kind: OperationalStateKind = "saved";
    let title = "Base de publish pronta";
    let description =
      "O projeto já tem base de saída registrada. Falta exportar, disparar deployment ou confirmar publicação para fechar a trilha visível.";
    const meta: OperationalStateMetaItem[] = [
      { label: "Projeto", value: project.title },
      { label: "Canal", value: publishChannel },
      { label: "Ambiente", value: environment },
      {
        label: delivery.stage === "published" ? "Publicado em" : "Último deploy",
        value: formatDateLabel(delivery.stage === "published" ? publishedAt : exportedAt),
      },
      {
        label: "Sincronia",
        value: syncLabel,
        tone: syncTone,
      },
    ];
    const details: ReactNode[] = [];
    let footer = canonical.deliverable.nextAction;

    if (vercelBinding?.projectName) {
      meta.push({
        label: "Deploy",
        value: vercelDeployStatusLabel(deriveVercelDeployStatus(vercelBinding)),
        tone:
          vercelBinding.lastDeploymentState === "READY"
            ? "success"
            : vercelBinding.lastDeploymentState === "ERROR" || vercelBinding.lastDeploymentState === "CANCELED"
              ? "danger"
              : vercelBinding.lastDeploymentId
                ? "warning"
                : "default",
      });
    } else if (github.binding) {
      meta.push({
        label: "Workspace",
        value: repoLabel(github.binding),
      });
    }

    if (hasPublishError) {
      kind = "failed-publish";
      title = "Publicação precisa de revisão";
      description =
        "A trilha de publish existe, mas a Vercel devolveu falha ou faltam dados críticos para tratar a saída como concluída.";
      details.push(vercelBinding?.lastDeployError || "A publicação foi marcada, mas a production URL ainda não está registrada.");
      footer = "Abra o handoff correspondente, corrija o erro e só depois gere um novo deployment.";
    } else if (delivery.stage === "published") {
      kind = "published";
      title = "Publicação visível e confirmada";
      description =
        "A plataforma mostra o projeto publicado com horário, canal, ambiente e URL real sem depender de confirmação manual solta.";
      if (vercelBinding?.productionUrl) {
        details.push(`URL publicada: ${vercelBinding.productionUrl}.`);
      }
      if (latestEvent?.note) {
        details.push(latestEvent.note);
      }
      footer =
        "Se houver nova iteração, volte ao editor, atualize a fonte e gere um novo deployment só quando a saída realmente precisar mudar.";
    } else if (vercelBinding?.lastDeploymentId) {
      kind =
        vercelBinding.lastDeploymentState === "READY"
          ? "success"
          : "syncing";
      title =
        vercelBinding.lastDeploymentState === "READY"
          ? "Deploy pronto aguardando próximo passo"
          : "Deployment em andamento";
      description =
        vercelBinding.lastDeploymentState === "READY"
          ? "A Vercel já devolveu READY. Agora o produto mostra preview, ambiente e próximo passo sem ambiguidade."
          : "O deployment já saiu do produto e a camada de publish mostra o estado real devolvido pela Vercel.";
      if (vercelBinding.lastDeploymentUrl) {
        details.push(`Deployment: ${vercelBinding.lastDeploymentUrl}.`);
      }
      if (latestEvent?.note) {
        details.push(latestEvent.note);
      }
      footer =
        vercelBinding.lastDeploymentState === "READY"
          ? "Promova ou trate como publicado só quando a saída final estiver correta."
          : "Reconcile o deployment até a Vercel devolver READY ou ERROR.";
    } else if (github.binding || vercelBinding) {
      kind = "saved";
      title = "Base de publish salva";
      description =
        "O projeto já tem base de saída persistida. Agora a camada confiável de publish depende do primeiro deployment ou sync real.";
      if (vercelBinding?.projectName) {
        details.push(`Projeto Vercel salvo: ${vercelBinding.projectName}.`);
      }
      if (github.binding) {
        details.push(`Base GitHub salva em ${repoLabel(github.binding)}.`);
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
          <Link href={projectHref} className="btn-link-ea btn-secondary btn-sm">
            Abrir projeto
          </Link>
          <Link href={handoffHref} className="btn-link-ea btn-ghost btn-sm">
            Ver handoff
          </Link>
          {vercelBinding?.productionUrl ? (
            <a href={vercelBinding.productionUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
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
