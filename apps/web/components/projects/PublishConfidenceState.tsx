"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { ensureCanonicalProjectData } from "../../lib/projectModel";
import {
  assessVercelBindingDraft,
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
  if (!value) return "Ainda nao registrado";
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

function environmentValue(canonical: any): string {
  const binding = canonical?.integrations?.vercel?.binding;
  if (!binding) return "Nao se aplica";
  const assessment = assessVercelBindingDraft({
    projectName: binding.projectName || "",
    teamSlug: binding.teamSlug || "",
    framework: binding.framework || "nextjs",
    rootDirectory: binding.rootDirectory || "",
    deployStatus: binding.deployStatus || "draft",
    previewUrl: binding.previewUrl || "",
    productionUrl: binding.productionUrl || "",
  });
  return vercelEnvironmentLabel(assessment.preferredEnvironment);
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
    const lastPublishedAt = delivery.lastPublishedAt;
    const lastExportedAt = delivery.lastExportedAt;
    const hasVercel = Boolean(vercel.binding || vercel.lastManifestExportedAt);
    const hasGitHub = Boolean(github.binding || github.exports.length || github.versions.length);
    const rank =
      delivery.stage === "published"
        ? 400
        : hasVercel && (vercel.lastManifestExportedAt || delivery.connectedStorage === "vercel")
          ? 300
          : hasGitHub && (github.exports.length || delivery.connectedStorage === "github")
            ? 220
            : delivery.stage === "exported"
              ? 180
              : hasVercel || hasGitHub
                ? 120
                : 0;
    const ts = Date.parse(lastPublishedAt || lastExportedAt || project.updatedAt || "") || 0;
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
        title: "Sem camada de publicacao ativa ainda",
        description:
          "Assim que um projeto ganhar base de handoff ou publicacao, esta area passa a mostrar canal, ambiente, horario e proximo passo com mais clareza.",
        emphasis: "Aguardando primeiro projeto",
        meta: [
          { label: "Publish", value: "Ainda nao iniciado" },
          { label: "Confianca", value: "Sem trilha ativa" },
        ] satisfies OperationalStateMetaItem[],
        details: [
          "Crie ou salve um projeto no editor.",
          "Depois disso, exporte um handoff GitHub ou Vercel para ativar a trilha operacional.",
        ],
        footer: "A camada de publish aparece aqui para reduzir ambiguidade antes, durante e depois da saida.",
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
    const latestEvent = delivery.history[0] || null;
    const publishChannel = channelLabel(delivery.connectedStorage || latestEvent?.channel || null);
    const environment = environmentValue(canonical);
    const exportedAt = delivery.lastExportedAt;
    const publishedAt = delivery.lastPublishedAt;
    const projectHref = project.id ? `/editor/${project.id}` : "/editor/new";
    const handoffHref =
      delivery.connectedStorage === "vercel" || vercel.binding || vercel.lastManifestExportedAt
        ? "#vercel-publish"
        : "#github-workspace";
    const syncLabel =
      delivery.stage === "published"
        ? "Confirmado manualmente"
        : delivery.stage === "exported"
          ? "Aguardando confirmacao"
          : github.binding || vercel.binding
            ? "Base salva"
            : "Sem sincronizacao";
    const syncTone =
      delivery.stage === "published"
        ? ("success" as const)
        : delivery.stage === "exported"
          ? ("warning" as const)
          : ("default" as const);

    const vercelIssues = vercel.binding
      ? assessVercelBindingDraft({
          projectName: vercel.binding.projectName || "",
          teamSlug: vercel.binding.teamSlug || "",
          framework: vercel.binding.framework || "nextjs",
          rootDirectory: vercel.binding.rootDirectory || "",
          deployStatus: vercel.binding.deployStatus || "draft",
          previewUrl: vercel.binding.previewUrl || "",
          productionUrl: vercel.binding.productionUrl || "",
        }).issues
      : [];

    const hasPublishError =
      vercelIssues.some((item) => item.level === "error") ||
      (delivery.stage === "published" && delivery.connectedStorage === "vercel" && !vercel.binding?.productionUrl);

    let kind: OperationalStateKind = "saved";
    let title = "Base de publicacao pronta";
    let description =
      "O projeto ja tem base de handoff registrada. Falta exportar ou confirmar a publicacao para fechar a trilha visivel.";
    const meta: OperationalStateMetaItem[] = [
      { label: "Projeto", value: project.title },
      { label: "Canal", value: publishChannel },
      { label: "Ambiente", value: environment },
      {
        label: delivery.stage === "published" ? "Publicado em" : "Ultimo handoff",
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

    if (delivery.connectedStorage === "vercel" && vercel.binding) {
      meta.push({
        label: "Deploy",
        value: vercelDeployStatusLabel(vercel.binding.deployStatus),
        tone:
          vercel.binding.deployStatus === "published"
            ? "success"
            : vercel.binding.deployStatus === "ready"
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
      title = "Publicacao precisa de revisao";
      description =
        "A trilha de publish existe, mas ha inconsistencias que reduzem a confianca. Revise base, ambiente e confirmacao antes de tratar a saida como concluida.";
      details.push(
        ...vercelIssues.filter((item) => item.level === "error").map((item) => item.message)
      );
      if (!details.length) {
        details.push("A publicacao foi marcada, mas a production URL ainda nao esta registrada.");
      }
      footer = "Abra o handoff correspondente, corrija os dados e salve novamente antes de seguir.";
    } else if (delivery.stage === "published") {
      kind = "published";
      title = "Publicacao visivel e confirmada";
      description =
        "A plataforma agora consegue mostrar o projeto publicado com horario, canal, ambiente e proximo passo sem depender de memoria do usuario.";
      if (vercel.binding?.productionUrl) {
        details.push(`URL publicada: ${vercel.binding.productionUrl}.`);
      }
      if (latestEvent?.note) {
        details.push(latestEvent.note);
      }
      footer =
        "Se houver nova iteracao, volte ao editor, gere novo handoff e registre a proxima publicacao somente quando ela realmente acontecer.";
    } else if (delivery.stage === "exported") {
      kind = "syncing";
      title = "Handoff exportado aguardando confirmacao";
      description =
        "A saida ja deixou o produto, mas ainda depende de retorno manual confiavel para virar publicacao confirmada.";
      if (vercel.binding?.previewUrl) {
        details.push(`Preview registrada: ${vercel.binding.previewUrl}.`);
      }
      if (github.exports[0]?.repoLabel) {
        details.push(`Snapshot GitHub exportado para ${github.exports[0].repoLabel}.`);
      }
      if (latestEvent?.note) {
        details.push(latestEvent.note);
      }
      footer =
        "Confirme preview ou producao fora da plataforma e volte para registrar o estado final sem pular etapas.";
    } else if (github.binding || vercel.binding) {
      kind = "saved";
      title = "Base de publish salva";
      description =
        "O projeto ja tem base de handoff persistida. Agora a camada confiavel do publish depende do primeiro export e da confirmacao posterior.";
      if (vercel.binding?.projectName) {
        details.push(`Projeto Vercel salvo: ${vercel.binding.projectName}.`);
      }
      if (github.binding) {
        details.push(`Base GitHub salva em ${repoLabel(github.binding)}.`);
      }
      footer = "Exporte o handoff antes de considerar qualquer saida como sincronizada ou publicada.";
    } else {
      kind = "empty";
      title = "Publish ainda nao preparado";
      description =
        "O projeto existe, mas ainda nao tem base clara de handoff. Salve GitHub ou Vercel para a plataforma comecar a registrar a trilha de publicacao.";
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
          {vercel.binding?.productionUrl ? (
            <a href={vercel.binding.productionUrl} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
              Abrir publicacao
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
