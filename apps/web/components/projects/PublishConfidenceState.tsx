"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ensureCanonicalProjectData } from "../../lib/projectModel";
import { EditorRouteLink } from "../ui/EditorRouteLink";
import { OperationalState } from "../ui/OperationalState";
import { buildPublishTrustState } from "./publishTrust";

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

function deriveFocusProject(projects: ProjectLike[]) {
  const candidates = projects.map((project) => {
    const canonical = ensureCanonicalProjectData(project.data, {
      projectKind: project.kind,
      projectTitle: project.title,
    });
    const reconciliation = canonical.publish.reconciliation;
    const rank =
      reconciliation.state === "published"
        ? 520
        : reconciliation.state === "failed" ||
            reconciliation.state === "diverged" ||
            reconciliation.state === "repo_missing" ||
            reconciliation.state === "branch_missing"
          ? 480
          : reconciliation.state === "ready" || reconciliation.state === "merged"
            ? 420
            : reconciliation.state === "running" || reconciliation.state === "requested"
              ? 360
              : reconciliation.state === "manually_resolved"
                ? 320
                : canonical.publish.repo.id || canonical.publish.deployment.projectName
                  ? 180
                  : 0;
    const ts =
      Date.parse(
        reconciliation.stateSinceAt ||
          reconciliation.lastConfirmedAt ||
          reconciliation.timestamps.reconciledAt ||
          reconciliation.timestamps.updatedAt ||
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
          "Assim que um projeto ganhar base de saída ou publicação, esta área passa a mostrar o estado reconciliado, a confirmação externa e a ação necessária com mais honestidade.",
        emphasis: "Aguardando primeiro projeto",
        meta: [
          { label: "Publish", value: "Ainda não iniciado" },
          { label: "Confiança", value: "Sem trilha reconciliada" },
        ],
        details: [
          "Crie ou salve um projeto no editor.",
          "Depois disso, conecte GitHub ou Vercel para ativar a trilha operacional reconciliada.",
        ],
        footer: "A camada de confiança de publish aparece aqui para separar estado interno, confirmação externa e ação necessária.",
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
    const trust = buildPublishTrustState({ publish: canonical.publish, scope: "overview" });
    const projectHref = project.id ? `/editor/${project.id}` : "/editor/new";
    const handoffHref = trust.providerLabel === "Vercel" ? "#vercel-publish" : "#github-workspace";

    return {
      kind: trust.kind,
      title: trust.title,
      description: trust.description,
      emphasis: project.title,
      meta: trust.meta,
      details: trust.details,
      footer: trust.footer,
      actions: (
        <>
          <EditorRouteLink href={projectHref} className="btn-link-ea btn-secondary btn-sm">
            Abrir projeto
          </EditorRouteLink>
          <Link href={handoffHref} className="btn-link-ea btn-ghost btn-sm">
            Ver handoff
          </Link>
          {canonical.publish.deployment.publishedUrl ? (
            <a
              href={canonical.publish.deployment.publishedUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-link-ea btn-ghost btn-sm"
            >
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
