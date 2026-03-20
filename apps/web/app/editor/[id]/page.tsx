"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";
import { EditorShell, EditorTab } from "../../../components/editor/EditorShell";
import { GitHubWorkspaceCard } from "../../../components/projects/GitHubWorkspaceCard";
import { VercelPublishCard } from "../../../components/projects/VercelPublishCard";
import { toUserFacingError, toUserFacingGenerationSuccess } from "../../../lib/uiFeedback";
import { ensureCanonicalProjectData, parseLegacyProjectPayload, syncProjectDataFromEditor } from "../../../lib/projectModel";

type Project = { id: string; title: string; kind: string; data?: any };

type AiStep = { id: string; ts: string; title: string; details?: string };

type CreatorSnapshotField = {
  label: string;
  value: string;
};

type CreatorSnapshot = {
  source: string;
  summary: string;
  details: string;
  prefillText?: string;
  briefingFields?: CreatorSnapshotField[];
  outputFields?: CreatorSnapshotField[];
  nextAction?: string;
};

type ReviewStatus = "draft" | "review_ready" | "approved" | "rework";

type EditorVersion = {
  id: string;
  ts: string;
  title: string;
  summary: string;
  tab: EditorTab;
  charCount: number;
  deliverable: string;
  snapshotText?: string;
  reviewStatus?: ReviewStatus;
  assetCount?: number;
};

type EditorCheckpoint = {
  id: string;
  ts: string;
  title: string;
  note: string;
  type: "save" | "draft" | "review_ready" | "approved" | "rework";
  versionId?: string | null;
};

type OutputStage = "draft" | "exported" | "published";

type EditorDeliveryEvent = {
  id: string;
  ts: string;
  stage: OutputStage;
  channel: "device" | "github" | "vercel" | "manual";
  title: string;
  note: string;
};

type EditorAsset = {
  id: string;
  label: string;
  type: string;
  value: string;
  note?: string;
  url?: string | null;
  state: "ready" | "working" | "context";
};

type DeliverableStage = {
  id: string;
  label: string;
  detail: string;
  status: "done" | "active" | "pending";
};

type EditorDoc = {
  mode: { professor: boolean; transparent: boolean };
  doc: { text: string };
  timeline: { clips: Array<{ id: string; name: string; start: number; end: number }> };
  workflow: { nodes: any[]; edges: any[] };
  course: { sections: any[] };
  website: { blocks: any[] };
  aiSteps: AiStep[];
  review: { factCheck: any | null; status: ReviewStatus };
  versions: EditorVersion[];
  checkpoints: EditorCheckpoint[];
  delivery: {
    exportTarget: "device" | "connected_storage";
    connectedStorage: string | null;
    mediaRetention: "externalized";
    outputStage: OutputStage;
    lastExportedAt: string | null;
    lastPublishedAt: string | null;
    history: EditorDeliveryEvent[];
  };
};

const PROJECT_KIND_LABEL: Record<string, string> = {
  video: "Projeto de Vídeo",
  text: "Projeto de Texto",
  script: "Projeto de Roteiro",
  automation: "Projeto de Automação",
  course: "Projeto de Curso",
  website: "Projeto de Site"
};

const EDITOR_TAB_LABEL: Record<EditorTab, string> = {
  video: "Vídeo",
  text: "Texto",
  automation: "Workflows",
  course: "Cursos",
  website: "Sites",
  library: "Biblioteca IA",
};

const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; detail: string; badge: "phase" | "warning" | "soon" }> = {
  draft: {
    label: "Draft ativo",
    detail: "O entregável ainda está em construção e deve continuar no editor até consolidar uma base séria.",
    badge: "soon",
  },
  review_ready: {
    label: "Pronto para revisão",
    detail: "O material já pode passar por leitura crítica, checagem e checkpoint final antes da saída.",
    badge: "warning",
  },
  approved: {
    label: "Aprovado para saída",
    detail: "O entregável principal já foi aprovado no projeto e pode seguir para exportação ou handoff.",
    badge: "phase",
  },
  rework: {
    label: "Ajustes pendentes",
    detail: "A peça precisa de nova iteração antes de voltar ao estado de revisão ou aprovação.",
    badge: "warning",
  },
};

const OUTPUT_STAGE_META: Record<OutputStage, { label: string; detail: string; badge: "phase" | "warning" | "soon" }> = {
  draft: {
    label: "Draft",
    detail: "O trabalho ainda está concentrado no editor e não saiu da plataforma como entregável final.",
    badge: "soon",
  },
  exported: {
    label: "Exported",
    detail: "A saída já foi registrada como exportada ou enviada para handoff fora da plataforma.",
    badge: "warning",
  },
  published: {
    label: "Published",
    detail: "A publicação já foi registrada manualmente como concluída no fluxo atual do beta.",
    badge: "phase",
  },
};

function extractProjectPayload(payload: any): Project {
  const resolved = (payload?.item || payload?.data?.item || payload?.data || payload || null) as Project | null;
  if (!resolved?.id) {
    throw new Error("Projeto não encontrado para o editor.");
  }
  return resolved;
}

function ensureEditor(project: Project): EditorDoc {
  const d = ensureCanonicalProjectData(project.data, { projectKind: project.kind, projectTitle: project.title }) as any;
  const e = (d.editor || {}) as any;

  return {
    mode: {
      professor: !!e.mode?.professor,
      transparent: !!e.mode?.transparent
    },
    doc: {
      text: typeof e.doc?.text === "string" ? e.doc.text : ""
    },
    timeline: {
      clips: Array.isArray(e.timeline?.clips) ? e.timeline.clips : []
    },
    workflow: {
      nodes: Array.isArray(e.workflow?.nodes) ? e.workflow.nodes : [],
      edges: Array.isArray(e.workflow?.edges) ? e.workflow.edges : []
    },
    course: {
      sections: Array.isArray(e.course?.sections) ? e.course.sections : []
    },
    website: {
      blocks: Array.isArray(e.website?.blocks) ? e.website.blocks : []
    },
    aiSteps: Array.isArray(e.aiSteps) ? e.aiSteps : [],
    review: {
      factCheck: e.review?.factCheck || null,
      status:
        e.review?.status === "review_ready" ||
        e.review?.status === "approved" ||
        e.review?.status === "rework"
          ? e.review.status
          : "draft",
    },
    versions: Array.isArray(e.versions) ? e.versions : [],
    checkpoints: Array.isArray(e.checkpoints) ? e.checkpoints : [],
    delivery: {
      exportTarget: e.delivery?.exportTarget === "connected_storage" ? "connected_storage" : "device",
      connectedStorage: typeof e.delivery?.connectedStorage === "string" ? e.delivery.connectedStorage : null,
      mediaRetention: "externalized",
      outputStage:
        e.delivery?.outputStage === "exported" || e.delivery?.outputStage === "published"
          ? e.delivery.outputStage
          : "draft",
      lastExportedAt: typeof e.delivery?.lastExportedAt === "string" ? e.delivery.lastExportedAt : null,
      lastPublishedAt: typeof e.delivery?.lastPublishedAt === "string" ? e.delivery.lastPublishedAt : null,
      history: Array.isArray(e.delivery?.history)
        ? e.delivery.history
            .filter((item: any) => item && typeof item === "object")
            .map((item: any) => ({
              id: String(item.id || cryptoId()),
              ts: String(item.ts || new Date().toISOString()),
              stage: item.stage === "published" ? "published" : item.stage === "exported" ? "exported" : "draft",
              channel:
                item.channel === "github" || item.channel === "vercel" || item.channel === "manual"
                  ? item.channel
                  : "device",
              title: String(item.title || "Evento de saída"),
              note: String(item.note || ""),
            }))
        : [],
    }
  };
}

function parseCreatorProjectData(project: Project): any | null {
  return parseLegacyProjectPayload(project.data);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function buildCreatorSnapshot(project: Project): CreatorSnapshot | null {
  const canonical = ensureCanonicalProjectData(project.data, {
    projectKind: project.kind,
    projectTitle: project.title,
  });

  if (canonical.source.origin === "editor_new" && !parseCreatorProjectData(project)) {
    return null;
  }

  if (!canonical.source.label || !canonical.source.summary) {
    return null;
  }

  return {
    source: canonical.source.label,
    summary: canonical.source.summary,
    details: canonical.source.details,
    prefillText: canonical.source.prefillText,
    briefingFields: canonical.source.briefingFields,
    outputFields: canonical.source.outputFields,
    nextAction: canonical.source.nextAction,
  };
}

function pushStep(list: AiStep[], title: string, details?: string): AiStep[] {
  return [
    { id: cryptoId(), ts: new Date().toISOString(), title, details },
    ...list
  ].slice(0, 200);
}

function cryptoId() {
  try {
    // @ts-ignore
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function summarizeText(value: string, max = 140) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Sem conteúdo textual consolidado ainda.";
  return normalized.length <= max ? normalized : `${normalized.slice(0, max).trim()}…`;
}

function buildEditorVersionEntry({
  tab,
  text,
  creatorSnapshot,
  projectKindLabel,
  reviewStatus,
  assetCount,
}: {
  tab: EditorTab;
  text: string;
  creatorSnapshot: CreatorSnapshot | null;
  projectKindLabel: string;
  reviewStatus: ReviewStatus;
  assetCount: number;
}): EditorVersion {
  const trimmed = String(text || "").trim();
  const charCount = trimmed.length;
  const isCreatorPost = creatorSnapshot?.source === "Creator Post";
  const isCreatorScript = creatorSnapshot?.source === "Creator Scripts";
  const isCreatorClips = creatorSnapshot?.source === "Creator Clips";
  const titleByTab: Record<EditorTab, string> = {
    video: isCreatorClips ? "Versão do clipe" : "Versão de vídeo",
    text: isCreatorPost ? "Versão editorial do post" : isCreatorScript ? "Versão editorial do roteiro" : "Versão editorial",
    automation: "Versão de workflow",
    course: "Versão de curso",
    website: "Versão de site",
    library: "Versão de apoio IA",
  };

  return {
    id: cryptoId(),
    ts: new Date().toISOString(),
    title: titleByTab[tab],
    summary: trimmed
      ? summarizeText(trimmed)
        : creatorSnapshot
        ? `Base herdada de ${creatorSnapshot.source.toLowerCase()} para ${projectKindLabel.toLowerCase()}.`
        : `Projeto salvo sem texto consolidado nesta etapa de ${projectKindLabel.toLowerCase()}.`,
    tab,
    charCount,
    deliverable: trimmed
      ? isCreatorPost
        ? "Post pronto para revisar"
        : isCreatorScript
          ? "Roteiro pronto para revisar"
          : isCreatorClips
            ? "Clipe pronto para revisar"
            : "Pronto para revisar"
      : isCreatorPost
        ? "Base do post salva"
        : isCreatorScript
          ? "Base do roteiro salva"
          : isCreatorClips
            ? "Base do clipe salva"
            : "Base salva",
    snapshotText: trimmed || creatorSnapshot?.prefillText || "",
    reviewStatus,
    assetCount,
  };
}

function buildCheckpointEntry({
  type,
  title,
  note,
  versionId,
}: {
  type: EditorCheckpoint["type"];
  title: string;
  note: string;
  versionId?: string | null;
}): EditorCheckpoint {
  return {
    id: cryptoId(),
    ts: new Date().toISOString(),
    title,
    note,
    type,
    versionId: versionId || null,
  };
}

function buildDeliveryEvent({
  stage,
  channel,
  title,
  note,
}: {
  stage: OutputStage;
  channel: EditorDeliveryEvent["channel"];
  title: string;
  note: string;
}): EditorDeliveryEvent {
  return {
    id: cryptoId(),
    ts: new Date().toISOString(),
    stage,
    channel,
    title,
    note,
  };
}

function buildProjectAssets({
  project,
  creatorSnapshot,
  text,
  factResult,
  reviewStatus,
}: {
  project: Project | null;
  creatorSnapshot: CreatorSnapshot | null;
  text: string;
  factResult: any;
  reviewStatus: ReviewStatus;
}): EditorAsset[] {
  const assets: EditorAsset[] = [];
  const payload = project ? parseCreatorProjectData(project) : null;

  if (creatorSnapshot && payload?.type !== "creator_post" && payload?.type !== "creator_scripts" && payload?.type !== "creator_clips") {
    assets.push({
      id: "source-context",
      label: creatorSnapshot.source,
      type: "Contexto de origem",
      value: creatorSnapshot.summary,
      note: "Base importada para continuidade no editor.",
      state: "context",
    });
  }

  const trimmedText = String(text || "").trim();
  if (trimmedText) {
    assets.push({
      id: "main-doc",
      label: "Documento principal",
      type: "Saída central",
      value: `${trimmedText.length} caracteres prontos para refino editorial`,
      note: summarizeText(trimmedText, 120),
      state: "ready",
    });
  }

  if (payload?.type === "creator_post") {
    const result = payload.result || {};
    const caption = String(result.caption || "").trim();
    const hashtags = normalizeStringList(result.hashtags);
    const cta = String(result.cta || "").trim();
    const mediaSuggestion = String(result.mediaSuggestion || "").trim();

    if (caption) {
      assets.push({
        id: "post-caption",
        label: "Legenda principal",
        type: "Post",
        value: `${caption.length} caracteres prontos para edição`,
        note: summarizeText(caption, 120),
        state: "ready",
      });
    }

    if (hashtags.length) {
      assets.push({
        id: "post-hashtags",
        label: "Hashtags do post",
        type: "Distribuição",
        value: `${hashtags.length} conectadas à peça`,
        note: hashtags.join(" "),
        state: "ready",
      });
    }

    if (cta) {
      assets.push({
        id: "post-cta",
        label: "CTA principal",
        type: "Conversão",
        value: cta,
        note: "Chamada pronta para publicação ou refinamento editorial.",
        state: "ready",
      });
    }

    if (mediaSuggestion) {
      assets.push({
        id: "post-media",
        label: "Direção de mídia",
        type: "Referência visual",
        value: summarizeText(mediaSuggestion, 96),
        note: "Referência salva junto da copy para briefing visual ou publicação.",
        state: "context",
      });
    }
  }

  if (payload?.type === "creator_scripts") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const developmentPoints = normalizeStringList(structured.development_points);
    const finalScript = String(structured.final_script || generated.raw_text || "").trim();

    if (structured.title) {
      assets.push({
        id: "script-title",
        label: "Título do roteiro",
        type: "Estrutura",
        value: String(structured.title).trim(),
        note: "Título salvo junto do roteiro para revisão editorial e continuidade.",
        state: "ready",
      });
    }

    if (structured.opening) {
      assets.push({
        id: "script-hook",
        label: "Hook de abertura",
        type: "Estrutura",
        value: summarizeText(String(structured.opening).trim(), 96),
        note: "Abertura pronta para revisão de gancho e ritmo.",
        state: "ready",
      });
    }

    if (developmentPoints.length) {
      assets.push({
        id: "script-development",
        label: "Blocos de desenvolvimento",
        type: "Estrutura",
        value: `${developmentPoints.length} bloco(s) estruturados`,
        note: developmentPoints.join(" • "),
        state: "ready",
      });
    }

    if (structured.cta) {
      assets.push({
        id: "script-cta",
        label: "CTA do roteiro",
        type: "Saída editorial",
        value: String(structured.cta).trim(),
        note: "Chamada final pronta para aprovação editorial.",
        state: "ready",
      });
    }

    if (!trimmedText && finalScript) {
      assets.push({
        id: "script-body",
        label: "Roteiro consolidado",
        type: "Saída central",
        value: `${finalScript.length} caracteres prontos para revisão`,
        note: summarizeText(finalScript, 120),
        state: "ready",
      });
    }
  }

  if (payload?.type === "creator_music") {
    const result = payload.result || {};
    const audioUrl = String(result.audio_url || result.preview_url || "").trim();
    assets.push({
      id: "music-output",
      label: "Faixa gerada",
      type: "Áudio",
      value: result.title ? String(result.title) : "Resultado de áudio",
      note: audioUrl ? "Link de áudio ou prévia disponível para revisão." : "Metadados da faixa salvos no projeto.",
      url: audioUrl || null,
      state: audioUrl ? "ready" : "working",
    });
  }

  if (payload?.type === "creator_clips") {
    const result = payload.generated?.result || {};
    const clipUrl = String(payload.generated?.clip_url || result?.output?.video_url || result?.assets?.preview_url || "").trim();
    const thumbnailUrl = String(result?.output?.thumbnail_url || "").trim();
    const clipStatus = String(result.status || "").trim();
    const provider = String(result.provider || "").trim();
    const model = String(result.model || "").trim();
    const visualStyle = String(payload.visualStyle || "").trim();
    const platform = String(payload.platform || "").trim();
    if (clipStatus || provider) {
      assets.push({
        id: "clip-job",
        label: "Estado do job",
        type: "Pipeline visual",
        value: clipStatus ? `Status ${clipStatus}` : "Job registrado",
        note: provider ? `Execução via ${provider}${model ? ` · ${model}` : ""}.` : "Acompanhe o retorno do provedor antes da saída final.",
        state: clipUrl ? "ready" : "working",
      });
    }
    assets.push({
      id: "clip-output",
      label: "Clipe gerado",
      type: "Vídeo",
      value: result.status ? `Status ${String(result.status)}` : "Job salvo no projeto",
      note: clipUrl ? "Link do clipe disponível para revisão." : "Acompanhe o job e consolide o link final antes de exportar.",
      url: clipUrl || null,
      state: clipUrl ? "ready" : "working",
    });
    if (thumbnailUrl) {
      assets.push({
        id: "clip-thumbnail",
        label: "Thumbnail do clipe",
        type: "Preview",
        value: "Thumbnail pronta para revisão visual",
        note: "Use a thumbnail para validar enquadramento e continuidade antes da publicação.",
        url: thumbnailUrl,
        state: "ready",
      });
    }
    if (visualStyle || platform) {
      assets.push({
        id: "clip-direction",
        label: "Direção visual",
        type: "Briefing",
        value: [visualStyle, platform].filter(Boolean).join(" · ") || "Briefing visual salvo",
        note: "A ideia, o estilo e o canal do clipe continuam ligados ao ativo final no editor.",
        state: "context",
      });
    }
  }

  if (factResult) {
    const verdict = String(factResult?.verdict || factResult?.result?.verdict || "Sem veredito");
    assets.push({
      id: "fact-check",
      label: "Verificação editorial",
      type: "Aprovação",
      value: verdict,
      note: "Resultado persistido no projeto para continuidade e revisão.",
      state: "ready",
    });
  }

  if (reviewStatus !== "draft") {
    const meta = REVIEW_STATUS_META[reviewStatus];
    assets.push({
      id: "review-status",
      label: "Estado de revisão",
      type: "Checkpoint",
      value: meta.label,
      note: meta.detail,
      state: reviewStatus === "approved" ? "ready" : "working",
    });
  }

  return assets.slice(0, 6);
}

function buildDeliverableStages({
  creatorSnapshot,
  text,
  versions,
  factResult,
  reviewStatus,
  checkpoints,
  outputStage,
  exportTarget,
  primaryOutputReady,
}: {
  creatorSnapshot: CreatorSnapshot | null;
  text: string;
  versions: EditorVersion[];
  factResult: any;
  reviewStatus: ReviewStatus;
  checkpoints: EditorCheckpoint[];
  outputStage: OutputStage;
  exportTarget: "device" | "connected_storage";
  primaryOutputReady: boolean;
}): DeliverableStage[] {
  const hasBase = Boolean(creatorSnapshot || String(text || "").trim());
  const hasRefinement = String(text || "").trim().length > 120;
  const hasReviewEvidence = Boolean(factResult);
  const isReviewReady = reviewStatus === "review_ready" || reviewStatus === "approved";
  const isApproved = reviewStatus === "approved";
  const hasSavedVersion = versions.length > 0;
  const hasCheckpoint = checkpoints.length > 0;
  const isScriptFlow = creatorSnapshot?.source === "Creator Scripts";
  const isClipFlow = creatorSnapshot?.source === "Creator Clips";

  return [
    {
      id: "generate",
      label: "Gerar",
      detail: hasBase
        ? isClipFlow
          ? "O job visual já entrou no editor com briefing, status e referência do ativo final."
          : "Base do projeto já entrou no editor com contexto real."
        : "Traga uma base de Creators ou escreva a primeira versão no editor.",
      status: hasBase ? "done" : "active",
    },
    {
      id: "refine",
      label: "Refinar",
      detail: isClipFlow
        ? primaryOutputReady
          ? "O ativo visual já está disponível para revisão séria, handoff e checkpoint."
          : "Acompanhe o job até existir um preview ou link final antes de tratar o clipe como saída consolidada."
        : hasRefinement
          ? "O material principal já tem corpo para revisão séria."
          : "Consolide o texto, vídeo ou fluxo principal antes de aprovar.",
      status: isClipFlow ? (primaryOutputReady ? "done" : hasBase ? "active" : "pending") : hasRefinement ? "done" : hasBase ? "active" : "pending",
    },
      {
        id: "review",
        label: "Revisar",
        detail: hasReviewEvidence
          ? isReviewReady
            ? "Checagem editorial registrada e material marcado para revisão."
            : "Há base de verificação editorial, mas o projeto ainda não foi levado para revisão."
          : isClipFlow
            ? "Marque o clipe como pronto para revisão quando o ativo visual estiver confirmado. Use checkpoint e aprovação para separar preview de saída final."
          : isScriptFlow
            ? "Marque o roteiro como pronto para revisão e use a Biblioteca IA para registrar uma leitura editorial antes da aprovação."
            : "Use a Biblioteca IA para validar afirmações e registrar uma leitura crítica do entregável.",
        status: isReviewReady ? "done" : isClipFlow ? (primaryOutputReady ? "active" : "pending") : hasRefinement ? "active" : "pending",
      },
      {
        id: "approve",
        label: "Aprovar",
        detail: isApproved
          ? "Entregável aprovado e pronto para seguir para saída com menos ambiguidade."
          : isReviewReady
            ? isClipFlow
              ? "O clipe já entrou em revisão. Aprove quando o ativo visual final estiver validado e o checkpoint estiver salvo."
              : isScriptFlow
                ? "O roteiro já entrou em revisão. Aprove quando o checkpoint editorial final estiver claro."
                : "O projeto já entrou em revisão. Aprove quando o checkpoint final estiver claro."
            : isClipFlow
              ? "Leve o clipe para revisão antes de registrar published ou tratar o ativo como final."
              : isScriptFlow
                ? "Leve o roteiro para revisão antes de aprovar a saída final."
                : "Marque o projeto como pronto para revisão antes de aprovar a saída.",
        status: isApproved ? "done" : isReviewReady ? "active" : isClipFlow && primaryOutputReady ? "active" : "pending",
      },
    {
      id: "save",
      label: "Salvar",
      detail: hasSavedVersion
        ? `${versions.length} versão(ões) e ${checkpoints.length} checkpoint(s) já registrados neste projeto.`
        : "Salve uma versão para travar um ponto de continuidade real.",
      status: hasSavedVersion && hasCheckpoint ? "done" : isClipFlow ? (primaryOutputReady ? "active" : "pending") : hasRefinement ? "active" : "pending",
    },
    {
      id: "export",
      label: "Exportar",
      detail:
        outputStage === "published"
          ? "A saída já foi registrada como publicada. O histórico abaixo mantém quando isso aconteceu e por qual canal."
          : outputStage === "exported"
            ? "A saída já foi registrada como exported. Agora você pode concluir a publicação manual ou manter o projeto em handoff."
            : isClipFlow
              ? primaryOutputReady
                ? "O clipe já tem link final. Salve um checkpoint, registre exported quando a saída realmente sair e published quando a publicação manual estiver confirmada."
                : "Aguarde o link final do clipe antes de registrar exported. Enquanto isso, mantenha o job e o projeto sincronizados."
            : exportTarget === "device"
              ? "Saída padrão atual: exported no dispositivo ao concluir o entregável. Published segue como etapa manual fora da plataforma."
              : "Fluxo preparado para storage conectado quando essa etapa estiver disponível.",
      status: outputStage === "published" ? "done" : outputStage === "exported" ? "done" : isClipFlow ? (primaryOutputReady && hasSavedVersion ? "active" : "pending") : isApproved && hasSavedVersion ? "active" : "pending",
    },
  ];
}

export default function EditorProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = String((params as any).id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [creatorSnapshot, setCreatorSnapshot] = useState<CreatorSnapshot | null>(null);
  const [tab, setTab] = useState<EditorTab>("text");

  const [professorMode, setProfessorMode] = useState(false);
  const [transparentMode, setTransparentMode] = useState(false);

  const [text, setText] = useState("");
  const [claim, setClaim] = useState("");
  const [factResult, setFactResult] = useState<any>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("draft");

  const [aiSteps, setAiSteps] = useState<AiStep[]>([]);
  const [aiBusy, setAiBusy] = useState<"text" | "fact" | null>(null);
  const [aiFeedback, setAiFeedback] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const p = await api.getProject(id);
        const proj = extractProjectPayload(p);
        setProject(proj);
        const snapshot = buildCreatorSnapshot(proj);
        setCreatorSnapshot(snapshot);

        const ed = ensureEditor(proj);
        setProfessorMode(ed.mode.professor);
        setTransparentMode(ed.mode.transparent);
        setText(ed.doc.text || snapshot?.prefillText || "");
        setAiSteps(ed.aiSteps);
        setFactResult(ed.review.factCheck || null);
        setReviewStatus(ed.review.status || "draft");

        // Escolhe aba inicial baseada no kind
        if (proj.kind === "video") setTab("video");
        else if (proj.kind === "automation") setTab("automation");
        else if (proj.kind === "course") setTab("course");
        else if (proj.kind === "website") setTab("website");
        else setTab("text");
      } catch (e: any) {
        setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao carregar projeto"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const title = useMemo(() => project?.title || `Projeto ${id}`, [project, id]);
  const projectKindLabel = useMemo(
    () => PROJECT_KIND_LABEL[project?.kind || ""] || project?.kind || "Projeto",
    [project?.kind]
  );
  const factVerdict = useMemo(
    () => String(factResult?.verdict || factResult?.result?.verdict || "Sem veredito"),
    [factResult]
  );
  const factConfidence = useMemo(() => {
    const confidence = factResult?.confidence ?? factResult?.result?.confidence;
    if (confidence === null || confidence === undefined || confidence === "") return null;
    return String(confidence);
  }, [factResult]);
  const editorState = useMemo(() => (project ? ensureEditor(project) : null), [project]);
  const versions = useMemo(() => editorState?.versions || [], [editorState]);
  const checkpoints = useMemo(() => editorState?.checkpoints || [], [editorState]);
  const deliveryHistory = useMemo(() => editorState?.delivery.history || [], [editorState]);
  const latestVersion = versions[0] || null;
  const latestCheckpoint = checkpoints[0] || null;
  const reviewStatusMeta = REVIEW_STATUS_META[reviewStatus];
  const outputStage = editorState?.delivery.outputStage || "draft";
  const outputStageMeta = OUTPUT_STAGE_META[outputStage];
  const latestDeliveryEvent = deliveryHistory[0] || null;
  const isCreatorPostFlow = creatorSnapshot?.source === "Creator Post";
  const isCreatorScriptsFlow = creatorSnapshot?.source === "Creator Scripts";
  const isCreatorClipsFlow = creatorSnapshot?.source === "Creator Clips";
  const handoffSourceParam = searchParams.get("source");
  const handoffStageParam = searchParams.get("handoff");
  const outputAssets = useMemo(
    () => buildProjectAssets({ project, creatorSnapshot, text, factResult, reviewStatus }),
    [creatorSnapshot, factResult, project, reviewStatus, text]
  );
  const clipOutputAsset = useMemo(
    () => outputAssets.find((asset) => asset.id === "clip-output") || null,
    [outputAssets]
  );
  const clipPreviewAsset = useMemo(
    () => outputAssets.find((asset) => asset.id === "clip-thumbnail") || null,
    [outputAssets]
  );
  const hasClipOutputReady = Boolean(clipOutputAsset?.url);
  const deliverableStages = useMemo(
    () =>
      buildDeliverableStages({
        creatorSnapshot,
        text,
        versions,
        factResult,
        reviewStatus,
        checkpoints,
        outputStage,
        exportTarget: editorState?.delivery.exportTarget || "device",
        primaryOutputReady: isCreatorClipsFlow ? hasClipOutputReady : Boolean(String(text || "").trim().length > 120 || outputAssets.some((asset) => asset.state === "ready")),
      }),
    [checkpoints, creatorSnapshot, editorState?.delivery.exportTarget, factResult, hasClipOutputReady, isCreatorClipsFlow, outputAssets, outputStage, reviewStatus, text, versions]
  );
  const documentMetrics = useMemo(() => {
    const trimmed = String(text || "").trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((item) => item.trim().length > 0).length : 0;
    return { chars: trimmed.length, words, paragraphs };
  }, [text]);
  const outputMetrics = useMemo(() => {
    const ready = outputAssets.filter((asset) => asset.state === "ready").length;
    const working = outputAssets.filter((asset) => asset.state === "working").length;
    return { ready, working };
  }, [outputAssets]);
  const primaryAsset = useMemo(
    () => outputAssets.find((asset) => asset.state === "ready") || outputAssets[0] || null,
    [outputAssets]
  );
  const activeDeliverableLabel = useMemo(() => {
    const current = deliverableStages.find((item) => item.status === "active") || deliverableStages[deliverableStages.length - 1];
    return current?.label || "Refinar";
  }, [deliverableStages]);
  const handoffNotice = useMemo(() => {
    if (handoffSourceParam === "creator_post") {
      return handoffStageParam === "saved"
        ? "A base do Creator Post chegou ao editor com legenda, CTA e hashtags preservados. Agora refine a peça, salve a primeira versão e registre exported quando a saída realmente sair."
        : "Este projeto entrou no editor a partir do Creator Post. Use a área central para consolidar a peça antes da saída final.";
    }
    if (handoffSourceParam === "creator_scripts") {
      return handoffStageParam === "saved"
        ? "A base do Creator Scripts chegou ao editor com estrutura, CTA e roteiro preservados. Agora revise, marque o estado editorial e salve o primeiro checkpoint antes de exportar."
        : "Este projeto entrou no editor a partir do Creator Scripts. Use a revisão editorial como etapa central antes da saída final.";
    }
    if (handoffSourceParam === "creator_clips") {
      return handoffStageParam === "saved"
        ? "A base do Creator Clips chegou ao editor com briefing, status do job e ativo visual preservados. Agora valide o clipe, salve um checkpoint e registre exported quando a saída realmente sair."
        : "Este projeto entrou no editor a partir do Creator Clips. Use a revisão visual e o estado do ativo como centro do fluxo final.";
    }
    return null;
  }, [handoffSourceParam, handoffStageParam]);
  const handoffNoticeTitle = handoffSourceParam === "creator_scripts"
    ? "Base do Creator Scripts carregada"
    : handoffSourceParam === "creator_clips"
      ? "Base do Creator Clips carregada"
    : handoffSourceParam === "creator_post"
      ? "Base do Creator Post carregada"
      : "Base do creator carregada";
  const checkpointLabel = useMemo(
    () =>
      latestCheckpoint
        ? `${latestCheckpoint.title} · ${new Date(latestCheckpoint.ts).toLocaleDateString("pt-BR")}`
        : "Sem checkpoint ativo",
    [latestCheckpoint]
  );
  const hasPrimaryOutputBody = Boolean(String(text || creatorSnapshot?.prefillText || "").trim());
  const isScriptReviewReady = reviewStatus === "review_ready" || reviewStatus === "approved";
  const canRegisterExport = isCreatorClipsFlow
    ? hasClipOutputReady && versions.length > 0
    : hasPrimaryOutputBody && versions.length > 0 && (!isCreatorScriptsFlow || isScriptReviewReady);
  const canRegisterPublish =
    canRegisterExport &&
    (outputStage === "exported" || outputStage === "published") &&
    ((!isCreatorScriptsFlow && !isCreatorClipsFlow) || reviewStatus === "approved");
  const primarySaveLabel = isCreatorPostFlow && !versions.length
    ? "Salvar primeira versão do post"
    : isCreatorScriptsFlow && !versions.length
      ? "Salvar primeira versão do roteiro"
      : isCreatorClipsFlow && !versions.length
        ? "Salvar primeira versão do clipe"
      : "Salvar nova versão";
  const contextSaveLabel = isCreatorPostFlow && !versions.length
    ? "Salvar primeira versão do post"
    : isCreatorScriptsFlow && !versions.length
      ? "Salvar primeira versão do roteiro"
      : isCreatorClipsFlow && !versions.length
        ? "Salvar primeira versão do clipe"
      : "Salvar versão e checkpoint";
  const projectStateLabel = useMemo(
    () => `${outputStageMeta.label} · ${reviewStatusMeta.label} · ${outputMetrics.ready} saída(s) pronta(s)`,
    [outputMetrics.ready, outputStageMeta.label, reviewStatusMeta.label]
  );
  const exportBlockReason = useMemo(() => {
    if (isCreatorClipsFlow && !hasClipOutputReady) {
      return "Aguarde o link final do clipe antes de registrar exported. Enquanto isso, mantenha o job sincronizado no projeto.";
    }
    if (!hasPrimaryOutputBody) {
      return isCreatorScriptsFlow
        ? "Consolide o roteiro principal no editor antes de registrar a saída."
        : "Consolide o entregável principal no editor antes de registrar a saída.";
    }
    if (!versions.length) {
      return "Salve ao menos uma versão ou checkpoint do projeto. Isso evita marcar exported sem uma base real de continuidade.";
    }
    if (isCreatorScriptsFlow && !isScriptReviewReady) {
      return "Leve o roteiro para revisão e marque ao menos 'pronto para revisão' antes de registrar exported.";
    }
    return null;
  }, [hasClipOutputReady, hasPrimaryOutputBody, isCreatorClipsFlow, isCreatorScriptsFlow, isScriptReviewReady, versions.length]);
  const publishBlockReason = outputStage === "exported" && reviewStatus !== "approved" && (isCreatorScriptsFlow || isCreatorClipsFlow)
    ? isCreatorClipsFlow
      ? "A publicação manual do clipe só deve ser registrada depois da validação e aprovação final do ativo visual."
      : "A publicação manual do roteiro só deve ser registrada depois da aprovação editorial final."
    : null;

  async function persistEditor(next: EditorDoc, feedbackText: string) {
    if (!project) return null;

    const nextOutputStageMeta = OUTPUT_STAGE_META[next.delivery.outputStage];
    const nextReviewStatus = (next.review.status || "draft") as ReviewStatus;
    const nextReviewStatusMeta = REVIEW_STATUS_META[nextReviewStatus];
    const nextPrimaryOutput = primaryAsset
      ? {
          id: primaryAsset.id,
          label: primaryAsset.label,
          kind: primaryAsset.type,
          value: primaryAsset.value,
          note: primaryAsset.note,
          body: primaryAsset.id === "main-doc" ? next.doc.text : undefined,
          url: primaryAsset.url || null,
          state: primaryAsset.state,
        }
      : null;
    const nextData = syncProjectDataFromEditor(project.data, {
      projectKind: project.kind,
      editor: {
        version: 1,
        mode: next.mode,
        doc: next.doc,
        timeline: next.timeline,
        workflow: next.workflow,
        course: next.course,
        website: next.website,
        aiSteps: next.aiSteps,
        review: next.review,
        versions: next.versions,
        checkpoints: next.checkpoints,
        delivery: next.delivery,
      },
      outputAssets,
      primaryOutput: nextPrimaryOutput,
      delivery: {
        stage: next.delivery.outputStage,
        exportTarget: next.delivery.exportTarget,
        connectedStorage: next.delivery.connectedStorage,
        mediaRetention: "externalized",
        lastExportedAt: next.delivery.lastExportedAt,
        lastPublishedAt: next.delivery.lastPublishedAt,
        history: next.delivery.history,
      },
      deliverable: {
        label: activeDeliverableLabel,
        summary: `${nextOutputStageMeta.label} · ${nextReviewStatusMeta.label} · ${outputMetrics.ready} saída(s) pronta(s)`,
        reviewStatus: nextReviewStatus,
        latestVersionId: next.versions[0]?.id || null,
        latestCheckpointId: next.checkpoints[0]?.id || null,
        nextAction: deliverableStages.find((item) => item.status === "active")?.detail || "Refinar a peça principal",
      },
    });

    const updated = await api.updateProject(project.id, {
      data: nextData,
    });

    const proj = extractProjectPayload(updated);
    setProject(proj);
    setProfessorMode(next.mode.professor);
    setTransparentMode(next.mode.transparent);
    setAiSteps(next.aiSteps);
    setFactResult(next.review.factCheck || null);
    setReviewStatus(nextReviewStatus);
    setSaveFeedback(feedbackText);
    return proj;
  }

  async function registerDeliveryStage({
    stage,
    channel,
    title,
    note,
  }: {
    stage: OutputStage;
    channel: EditorDeliveryEvent["channel"];
    title: string;
    note: string;
  }) {
    if (!project) return;
    if (isCreatorClipsFlow && !hasClipOutputReady) {
      setErr("Aguarde o link final do clipe antes de registrar a saída final deste projeto.");
      return;
    }
    if (!hasPrimaryOutputBody) {
      setErr("Consolide o entregável principal no editor antes de registrar a saída final deste projeto.");
      return;
    }
    if (!versions.length) {
      setErr("Salve ao menos uma versão ou checkpoint antes de registrar a saída final deste projeto.");
      return;
    }
    if (stage === "exported" && isCreatorScriptsFlow && !isScriptReviewReady) {
      setErr("Leve o roteiro para revisão e marque ao menos 'pronto para revisão' antes de registrar exported.");
      return;
    }
    if (stage === "published" && outputStage === "draft") {
      setErr("Registre exported antes de marcar a publicação manual deste projeto.");
      return;
    }
    if (stage === "published" && isCreatorClipsFlow && reviewStatus !== "approved") {
      setErr("Aprove o clipe antes de registrar a publicação manual desta saída.");
      return;
    }
    if (stage === "published" && isCreatorScriptsFlow && reviewStatus !== "approved") {
      setErr("Aprove o roteiro antes de registrar a publicação manual desta saída.");
      return;
    }
    setSaving(true);
    setErr(null);
    setSaveFeedback(null);

    try {
      const current = ensureEditor(project);
      const event = buildDeliveryEvent({ stage, channel, title, note });
      const next: EditorDoc = {
        ...current,
        mode: { professor: professorMode, transparent: transparentMode },
        doc: { text },
        aiSteps: pushStep(current.aiSteps, title, note),
        review: { factCheck: factResult || null, status: reviewStatus },
        versions: current.versions,
        checkpoints: current.checkpoints,
        delivery: {
          ...current.delivery,
          outputStage: stage,
          lastExportedAt: stage === "exported" || stage === "published" ? event.ts : current.delivery.lastExportedAt,
          lastPublishedAt: stage === "published" ? event.ts : current.delivery.lastPublishedAt,
          history: [event, ...current.delivery.history].slice(0, 16),
        },
      };
      await persistEditor(
        next,
        stage === "published"
          ? isCreatorPostFlow
            ? "Publicação manual do post registrada. O projeto agora mostra a saída como published com histórico claro."
            : isCreatorClipsFlow
              ? "Publicação manual do clipe registrada. O projeto agora mostra a saída como published com histórico claro."
            : isCreatorScriptsFlow
              ? "Publicação manual do roteiro registrada. O projeto agora mostra a saída como published com histórico claro."
            : "Publicação manual registrada. O projeto agora mostra a saída como published com histórico claro."
          : isCreatorPostFlow
            ? "Exportação do post registrada. O projeto agora mostra a saída como exported com histórico claro."
            : isCreatorClipsFlow
              ? "Exportação do clipe registrada. O projeto agora mostra a saída como exported com histórico claro."
            : isCreatorScriptsFlow
              ? "Exportação do roteiro registrada. O projeto agora mostra a saída como exported com histórico claro."
            : "Exportação registrada. O projeto agora mostra a saída como exported com histórico claro."
      );
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao registrar a saída do projeto"));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!project) return;
    setSaving(true);
    setErr(null);
    setSaveFeedback(null);

    try {
      const current = ensureEditor(project);
      const nextVersion = buildEditorVersionEntry({
        tab,
        text,
        creatorSnapshot,
        projectKindLabel,
        reviewStatus,
        assetCount: outputAssets.length,
      });
      const nextAiSteps = pushStep(current.aiSteps, "Projeto salvo", `Checkpoint criado em ${new Date().toLocaleString("pt-BR")}`);
      const nextCheckpoint = buildCheckpointEntry({
        type: "save",
        title: `Checkpoint salvo · ${nextVersion.title}`,
        note: `${nextVersion.deliverable} · ${nextVersion.charCount} caracteres · ${EDITOR_TAB_LABEL[tab]}`,
        versionId: nextVersion.id,
      });
      const next: EditorDoc = {
        ...current,
        mode: { professor: professorMode, transparent: transparentMode },
        doc: { text },
        aiSteps: nextAiSteps,
        review: { factCheck: factResult || null, status: reviewStatus },
        versions: [nextVersion, ...current.versions].slice(0, 12),
        checkpoints: [nextCheckpoint, ...current.checkpoints].slice(0, 12),
        delivery: current.delivery
      };
      await persistEditor(
        next,
        isCreatorPostFlow && current.versions.length === 0
          ? "Primeira versão do post salva com segurança. O editor agora registra um checkpoint real para continuidade e saída."
          : isCreatorClipsFlow && current.versions.length === 0
            ? "Primeira versão do clipe salva com segurança. O editor agora registra um checkpoint real para revisão visual, continuidade e saída."
          : isCreatorScriptsFlow && current.versions.length === 0
            ? "Primeira versão do roteiro salva com segurança. O editor agora registra um checkpoint real para revisão, continuidade e saída."
          : "Projeto salvo com segurança. A versão ativa e o checkpoint do trabalho agora ficaram registrados no editor."
      );
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao salvar"));
    } finally {
      setSaving(false);
    }
  }

  async function updateReviewState(nextStatus: ReviewStatus) {
    if (!project) return;
    setSaving(true);
    setErr(null);
    setSaveFeedback(null);

    try {
      const current = ensureEditor(project);
      const meta = REVIEW_STATUS_META[nextStatus];
      const nextAiSteps = pushStep(current.aiSteps, `Revisão do projeto: ${meta.label}`, meta.detail);
      const nextCheckpoint = buildCheckpointEntry({
        type:
          nextStatus === "approved"
            ? "approved"
            : nextStatus === "review_ready"
              ? "review_ready"
              : nextStatus === "draft"
                ? "draft"
                : "rework",
        title: meta.label,
        note: meta.detail,
        versionId: latestVersion?.id || null,
      });
      const next: EditorDoc = {
        ...current,
        mode: { professor: professorMode, transparent: transparentMode },
        doc: { text },
        aiSteps: nextAiSteps,
        review: { factCheck: factResult || null, status: nextStatus },
        versions: current.versions,
        checkpoints: [nextCheckpoint, ...current.checkpoints].slice(0, 12),
        delivery: current.delivery,
      };
      await persistEditor(next, `${meta.label}. O checkpoint do projeto foi atualizado e a continuidade já reflete essa decisão.`);
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao atualizar o estado de revisão"));
    } finally {
      setSaving(false);
    }
  }

  function restoreVersion(version: EditorVersion) {
    if (!version.snapshotText) {
      setErr("Esta versão foi salva antes do snapshot completo do editor e não pode ser retomada automaticamente.");
      return;
    }
    setText(version.snapshotText);
    setTab(version.tab);
    setReviewStatus(version.reviewStatus || "draft");
    setSaveFeedback(`Versão "${version.title}" carregada no editor. Revise o conteúdo e salve novamente para registrar um novo marco.`);
    setAiSteps((current) => pushStep(current, `Versão retomada: ${version.title}`, "Snapshot reaplicado localmente ao editor."));
  }

  async function runTextGenerate() {
    setAiBusy("text");
    setAiFeedback(null);
    setSaveFeedback(null);
    setErr(null);
    setFactResult(null);
    setAiSteps((current) => pushStep(current, "EditexAI: gerar texto", "Chamando /api/ai/text-generate"));

    try {
      const res = await api.aiTextGenerate({ prompt: text.trim() || "Gere um texto curto." });
      const content = res?.text || res?.output || res?.content || JSON.stringify(res);
      const provider = typeof res?.provider === "string" ? res.provider : null;
      const model = typeof res?.model === "string" ? res.model : null;
      setText(String(content));
      setAiFeedback({
        tone: provider === "mock" || Boolean(res?.replay) ? "warning" : "success",
        text: toUserFacingGenerationSuccess({
          provider,
          model,
          replay: Boolean(res?.replay),
          defaultMessage: "Texto gerado e aplicado ao editor.",
          mockMessage: "Texto entregue em modo beta simulado. Revise antes de publicar.",
          replayMessage: "Esta resposta reaproveitou uma execução recente com segurança. Revise o texto antes de publicar.",
        }),
      });
      setAiSteps((current) => pushStep(current, "EditexAI: texto gerado", "Texto atualizado no editor"));
    } catch (e: any) {
      const message = toUserFacingError(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao gerar texto"), "Falha ao gerar texto.");
      setErr(message);
      setAiSteps((current) => pushStep(current, "Erro ao gerar texto", String(e?.error?.message || e)));
    } finally {
      setAiBusy((current) => (current === "text" ? null : current));
    }
  }

  async function runFactCheck() {
    setAiBusy("fact");
    setAiFeedback(null);
    setSaveFeedback(null);
    setErr(null);
    setFactResult(null);
    setAiSteps((current) => pushStep(current, "EditexAI: verificação editorial", "Chamando /api/ai/fact-check"));

    try {
      const res = await api.aiFactCheck({ claim });
      const provider = typeof res?.provider === "string" ? res.provider : null;
      const model = typeof res?.model === "string" ? res.model : null;
      setFactResult(res);
      setAiFeedback({
        tone: provider === "mock" || Boolean(res?.replay) ? "warning" : "success",
        text: toUserFacingGenerationSuccess({
          provider,
          model,
          replay: Boolean(res?.replay),
          defaultMessage: "Verificação editorial concluída. Revise o veredito antes de seguir.",
          mockMessage: "Verificação editorial entregue em modo beta simulado. Revise antes de tratar o retorno como definitivo.",
          replayMessage: "Esta verificação reaproveitou uma execução recente com segurança. Revise o veredito antes de seguir.",
        }),
      });
      const verdict = res?.verdict || res?.result?.verdict || "(sem veredito)";
      setAiSteps((current) => pushStep(current, `Verificação editorial: ${verdict}`, "Resultado disponível no painel"));
    } catch (e: any) {
      const message = toUserFacingError(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha na verificação editorial"), "Falha na verificação editorial.");
      setErr(message);
      setAiSteps((current) => pushStep(current, "Erro na verificação editorial", String(e?.error?.message || e)));
    } finally {
      setAiBusy((current) => (current === "fact" ? null : current));
    }
  }

  if (loading) {
    return (
      <div className="page-shell editor-project-page">
        <div className="premium-card editor-loading-shell">
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "40%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "76%" }} />
          <div className="premium-skeleton premium-skeleton-card" style={{ height: 160 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell editor-project-page">
      {err && (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar o editor</p>
          <div className="state-ea-text">{err}</div>
        </div>
      )}

      {aiBusy ? (
        <div className="state-ea">
          <p className="state-ea-title">{aiBusy === "text" ? "Gerando texto com IA" : "Executando verificação editorial"}</p>
          <div className="state-ea-text">A IA está processando sua solicitação. Aguarde alguns instantes antes de tentar outra ação.</div>
        </div>
      ) : null}

      {aiFeedback ? (
        <div className={`state-ea ${aiFeedback.tone === "warning" ? "state-ea-warning" : "state-ea-success"}`}>
          <p className="state-ea-title">{aiFeedback.tone === "warning" ? "Resposta da IA em modo beta" : "Atualização da IA concluída"}</p>
          <div className="state-ea-text">{aiFeedback.text}</div>
        </div>
      ) : null}

      {saveFeedback ? (
        <div className="state-ea state-ea-success">
          <p className="state-ea-title">Projeto sincronizado</p>
          <div className="state-ea-text">{saveFeedback}</div>
        </div>
      ) : null}
      {handoffNotice ? (
        <div className="state-ea state-ea-success">
          <p className="state-ea-title">{handoffNoticeTitle}</p>
          <div className="state-ea-text">{handoffNotice}</div>
        </div>
      ) : null}

      <EditorShell
        title={title}
        tab={tab}
        onTab={setTab}
        versionLabel={latestVersion ? `${latestVersion.title} · ${new Date(latestVersion.ts).toLocaleDateString("pt-BR")}` : "Salve a primeira versão"}
        reviewLabel={reviewStatusMeta.label}
        checkpointLabel={checkpointLabel}
        deliverableLabel={activeDeliverableLabel}
        outputLabel={`${outputAssets.length} ativo(s) e saída(s) no projeto`}
        nextActionLabel={deliverableStages.find((item) => item.status === "active")?.detail || "Refinar a peça principal"}
        professorMode={professorMode}
        transparentMode={transparentMode}
        onToggleProfessor={() => setProfessorMode(v => !v)}
        onToggleTransparent={() => setTransparentMode(v => !v)}
        left={
          <div className="editor-panel-stack">
            <section className="editor-shell-inline-card editor-shell-context-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Projeto em foco</p>
                <h3>{title}</h3>
                <p className="editor-shell-note">
                  Base ativa do workspace editorial. Tudo o que for salvo aqui continua no mesmo projeto.
                </p>
              </div>

              <div className="editor-shell-badge-row">
                <span className="premium-badge premium-badge-phase">{projectKindLabel}</span>
                <span className="premium-badge premium-badge-soon">ID {id}</span>
              </div>

              <div className="editor-shell-facts">
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Status</span>
                  <strong>{saving ? "Sincronizando editor" : projectStateLabel}</strong>
                </div>
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Versões</span>
                  <strong>{versions.length ? `${versions.length} registradas` : "Nenhuma versão salva"}</strong>
                </div>
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Checkpoint</span>
                  <strong>{latestCheckpoint ? latestCheckpoint.title : "Sem checkpoint ativo"}</strong>
                </div>
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Revisão</span>
                  <strong>{reviewStatusMeta.label}</strong>
                </div>
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Visibilidade</span>
                  <strong>{transparentMode ? "Passos abertos" : "Passos sob demanda"}</strong>
                </div>
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Apoio IA</span>
                  <strong>{professorMode ? "Explicação ativa" : "Explicação opcional"}</strong>
                </div>
              </div>

              <div className="editor-shell-cta-group">
                <button onClick={save} disabled={saving} className="btn-ea btn-primary">
                  {saving ? "Salvando..." : contextSaveLabel}
                </button>
                <a href="/projects" className="btn-link-ea btn-ghost btn-sm">Projetos</a>
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Linha de trabalho</p>
                <h4>Do briefing ao entregável</h4>
                <p className="editor-shell-note">
                  Este projeto agora mantém a progressão completa de gerar, refinar, aprovar, salvar e exportar.
                </p>
              </div>
              <div className="editor-project-stage-grid">
                {deliverableStages.map((stage) => (
                  <div key={stage.id} className={`editor-project-stage editor-project-stage-${stage.status}`}>
                    <div className="editor-project-stage-head">
                      <strong>{stage.label}</strong>
                      <span>{stage.status === "done" ? "Concluído" : stage.status === "active" ? "Em foco" : "Pendente"}</span>
                    </div>
                    <p>{stage.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            {creatorSnapshot ? (
              <section className="editor-shell-inline-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Contexto importado</p>
                  <h4>{creatorSnapshot.source}</h4>
                  <p className="editor-shell-note">{creatorSnapshot.summary}</p>
                </div>
                {creatorSnapshot.briefingFields?.length ? (
                  <div className="editor-project-context-stack">
                    <div className="editor-shell-fact-label">Briefing herdado</div>
                    <div className="creator-planner-field-grid editor-project-context-grid">
                      {creatorSnapshot.briefingFields.map((item) => (
                        <div key={`${item.label}-${item.value}`} className="creator-planner-field">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {creatorSnapshot.outputFields?.length ? (
                  <div className="editor-project-context-stack">
                    <div className="editor-shell-fact-label">Saída herdada do creator</div>
                    <div className="creator-planner-field-grid editor-project-context-grid">
                      {creatorSnapshot.outputFields.map((item) => (
                        <div key={`${item.label}-${item.value}`} className="creator-planner-field">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {creatorSnapshot.nextAction ? (
                  <div className="editor-project-origin-note">
                    <strong>Próxima ação recomendada</strong>
                    <span>{creatorSnapshot.nextAction}</span>
                  </div>
                ) : null}
                <pre className="editor-shell-pre editor-shell-pre-compact">{creatorSnapshot.details}</pre>
              </section>
            ) : null}

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Assets e outputs</p>
                <h4>{isCreatorPostFlow ? "O que este post já entrega" : isCreatorScriptsFlow ? "O que este roteiro já entrega" : isCreatorClipsFlow ? "O que este clipe já entrega" : "O que este projeto já entrega"}</h4>
                <p className="editor-shell-note">
                  {isCreatorPostFlow
                    ? "Legenda, CTA, hashtags, direção de mídia e estados de revisão ficam reunidos para separar o que ainda está em draft do que já está pronto para exportação."
                    : isCreatorScriptsFlow
                      ? "Hook, estrutura, CTA, revisão e checkpoints ficam reunidos para separar o que ainda está em draft do que já está pronto para exportação."
                      : isCreatorClipsFlow
                        ? "Job, preview, thumbnail, checkpoints e estado de publicação ficam reunidos para separar o que ainda está em processamento do que já virou saída final."
                      : "Contexto importado, saídas geradas e validações ficam reunidos para separar o que ainda está em draft do que já está pronto para exportação."}
                </p>
              </div>
              <div className="editor-project-asset-grid">
                {outputAssets.length ? outputAssets.map((asset) => (
                  <div key={asset.id} className={`editor-project-asset-card editor-project-asset-${asset.state}`}>
                    <div className="editor-project-asset-head">
                      <span>{asset.type}</span>
                      <strong>{asset.label}</strong>
                    </div>
                    <div className="editor-project-asset-value">{asset.value}</div>
                    {asset.note ? <p className="editor-shell-note">{asset.note}</p> : null}
                    {asset.url ? (
                      <a href={asset.url} target="_blank" rel="noreferrer" className="editor-project-asset-link">
                        Abrir saída
                      </a>
                    ) : null}
                  </div>
                )) : (
                  <div className="editor-shell-empty-note">
                    <strong>Sem outputs consolidados</strong>
                    <span>Gere uma base, refine o material principal e salve a primeira versão para preencher esta área.</span>
                  </div>
                )}
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Guia rápido</p>
                <h4>Como usar este editor</h4>
                <p className="editor-shell-note">
                  Mantenha a mesma cadência em qualquer aba para evoluir o projeto sem perder contexto, versões e entregáveis.
                </p>
              </div>
              <ol className="editor-shell-checklist editor-shell-checklist-ordered">
                <li>Consolide o output principal na aba ativa.</li>
                <li>Use a EditexAI ou a Biblioteca IA para refinar e validar antes de aprovar.</li>
                <li>Salve uma versão quando alcançar um ponto de continuidade relevante.</li>
              </ol>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Atalhos do editor</p>
                <h4>Onde cada area ajuda</h4>
              </div>
              <ul className="editor-shell-checklist">
                <li>Texto: escreva, refine e consolide a base principal do projeto.</li>
                <li>Biblioteca IA: valide afirmacoes e registre o resultado no contexto do projeto.</li>
                <li>Modo Transparente: acompanhe o passo a passo quando houver execução de IA.</li>
              </ul>
            </section>
          </div>
        }
        center={
          <div className="editor-panel-stack">
            <section className="editor-shell-inline-card editor-project-summary-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Centro do projeto</p>
                <h4>Profundidade operacional do editor</h4>
                <p className="editor-shell-note">
                  O trabalho principal acontece aqui: conteúdo, aprovação, versões salvas e saída final no mesmo contexto.
                </p>
              </div>
              <div className="editor-project-kpi-grid">
                <div className="editor-project-kpi">
                  <span>Caracteres ativos</span>
                  <strong>{documentMetrics.chars}</strong>
                </div>
                <div className="editor-project-kpi">
                  <span>Palavras</span>
                  <strong>{documentMetrics.words}</strong>
                </div>
                <div className="editor-project-kpi">
                  <span>Parágrafos</span>
                  <strong>{documentMetrics.paragraphs}</strong>
                </div>
                <div className="editor-project-kpi">
                  <span>Outputs rastreados</span>
                  <strong>{outputAssets.length}</strong>
                </div>
              </div>
              <div className="editor-project-command-grid">
                <div className="editor-project-command-card">
                  <span>Estado do projeto</span>
                  <strong>{outputStageMeta.label}</strong>
                  <p>{outputStageMeta.detail}</p>
                </div>
                <div className="editor-project-command-card">
                  <span>Checkpoint ativo</span>
                  <strong>{latestCheckpoint ? latestCheckpoint.title : "Sem checkpoint"}</strong>
                  <p>{latestCheckpoint ? latestCheckpoint.note : "Salve uma versão ou marque revisão para criar um marco útil de continuidade."}</p>
                </div>
                <div className="editor-project-command-card">
                  <span>Output principal</span>
                  <strong>{primaryAsset ? primaryAsset.label : "Documento principal"}</strong>
                  <p>{primaryAsset ? primaryAsset.note || primaryAsset.value : "Consolide a primeira saída relevante para o projeto ganhar materialidade."}</p>
                </div>
                <div className="editor-project-command-card">
                  <span>Saída final</span>
                  <strong>{editorState?.delivery.exportTarget === "device" ? "Exportação no dispositivo" : "Storage conectado"}</strong>
                  <p>{deliverableStages.find((item) => item.id === "export")?.detail || "Prepare a saída final ao concluir o entregável."}</p>
                </div>
              </div>
              <div className="hero-meta-row">
                <span className={`premium-badge premium-badge-${outputStageMeta.badge}`}>Saída atual: {outputStageMeta.label}</span>
                <span className="premium-badge premium-badge-warning">Revisão: {reviewStatusMeta.label}</span>
                <span className="premium-badge premium-badge-soon">
                  {latestDeliveryEvent ? `Última saída: ${new Date(latestDeliveryEvent.ts).toLocaleDateString("pt-BR")}` : "Nenhuma saída registrada"}
                </span>
              </div>
              <div className="editor-project-version-banner">
                <div>
                  <span className="editor-shell-fact-label">Última versão</span>
                  <strong>{latestVersion ? latestVersion.title : "Ainda sem versão salva"}</strong>
                </div>
                <p className="editor-shell-note">
                  {latestVersion
                    ? `${latestVersion.summary} · ${new Date(latestVersion.ts).toLocaleString("pt-BR")}`
                    : "Salve a primeira versão quando concluir um bloco importante para travar continuidade real no projeto."}
                </p>
              </div>
              <div className="editor-shell-cta-group">
                <button className="btn-ea btn-secondary btn-sm" onClick={() => updateReviewState("review_ready")} disabled={saving}>
                  {isCreatorScriptsFlow ? "Marcar roteiro pronto para revisão" : isCreatorClipsFlow ? "Marcar clipe pronto para revisão" : "Marcar pronto para revisão"}
                </button>
                <button className="btn-ea btn-primary btn-sm" onClick={() => updateReviewState("approved")} disabled={saving}>
                  {isCreatorScriptsFlow ? "Aprovar roteiro" : isCreatorClipsFlow ? "Aprovar clipe" : "Aprovar entregável"}
                </button>
                <button className="btn-ea btn-ghost btn-sm" onClick={() => updateReviewState("rework")} disabled={saving}>
                  {isCreatorScriptsFlow ? "Pedir ajustes no roteiro" : isCreatorClipsFlow ? "Pedir ajustes no clipe" : "Pedir ajustes"}
                </button>
                <button className="btn-ea btn-ghost btn-sm" onClick={() => updateReviewState("draft")} disabled={saving}>
                  Voltar para draft
                </button>
              </div>
              {isCreatorScriptsFlow ? (
                <div className="editor-project-origin-note editor-project-origin-note-inline">
                  <strong>Revisão editorial do roteiro</strong>
                  <span>Use revisão, aprovação e checkpoint como marcos centrais do fluxo. O roteiro só deve seguir para exported depois de uma leitura editorial clara.</span>
                </div>
              ) : isCreatorClipsFlow ? (
                <div className="editor-project-origin-note editor-project-origin-note-inline">
                  <strong>Revisão visual do clipe</strong>
                  <span>Use revisão, aprovação e checkpoint como marcos centrais do fluxo. O clipe só deve seguir para published depois de o ativo final estar validado.</span>
                </div>
              ) : null}
            </section>

            {tab === "text" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Texto base do projeto</h3>
                  <p className="editor-shell-note">
                    Escreva, refine com IA e mantenha a peça central pronta para continuidade, aprovação e exportação.
                  </p>
                </div>
                <div className="editor-shell-badge-row">
                  <span className="premium-badge premium-badge-phase">Documento vivo</span>
                  <span className="premium-badge premium-badge-soon">Salve uma versão ao concluir um bloco</span>
                </div>
                <label className="field-label-ea">
                  <span>Conteúdo em edição</span>
                  <textarea
                    className="field-ea editor-shell-textarea"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={14}
                    placeholder="Escreva ou gere com a EditexAI..."
                  />
                </label>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Entregável textual em foco</strong>
                  <p className="editor-shell-note">
                    Use este bloco como peça-mãe do projeto. Depois aprove, salve uma versão e siga para exportação ou handoff de publicação.
                  </p>
                </div>
              </section>
            )}

            {tab === "video" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>{isCreatorClipsFlow ? "Mesa de revisão do clipe" : "Editor de Vídeo"}</h3>
                  <p className="editor-shell-note">
                    {isCreatorClipsFlow
                      ? "Aqui o clipe deixa de ser só um job assíncrono e vira ativo principal do projeto, com revisão visual, checkpoint e estado final de saída."
                      : "Base do fluxo pronta para continuidade. Aqui o vídeo deixa de ser só geração e passa a ter contexto, assets e entregável."}
                  </p>
                </div>
                {isCreatorClipsFlow ? (
                  <div className="editor-project-context-stack">
                    <div className="creator-planner-field-grid editor-project-context-grid">
                      <div className="creator-planner-field">
                        <span>Status visual</span>
                        <strong>{clipOutputAsset ? clipOutputAsset.value : "Job salvo no projeto"}</strong>
                      </div>
                      <div className="creator-planner-field">
                        <span>Saída atual</span>
                        <strong>{clipOutputAsset?.url ? "Link do clipe disponível" : "Aguardando link final"}</strong>
                      </div>
                      <div className="creator-planner-field">
                        <span>Published</span>
                        <strong>{outputStage === "published" ? "Já registrado" : "Registro manual depois da aprovação"}</strong>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>{isCreatorClipsFlow ? "Ativo visual em foco" : "Timeline preparada"}</strong>
                  <p className="editor-shell-note">
                    {isCreatorClipsFlow
                      ? "Status do job, preview, thumbnail, checkpoint e registro de saída ficam reunidos aqui para fechar o pipeline com menos ambiguidade."
                      : "Clipes, status do job e ativos visuais já ficam organizados para revisão, salvamento de versão e saída final."}
                  </p>
                </div>
                {isCreatorClipsFlow && (clipOutputAsset?.url || clipPreviewAsset?.url) ? (
                  <div className="editor-shell-cta-group">
                    {clipOutputAsset?.url ? (
                      <a href={clipOutputAsset.url} target="_blank" rel="noreferrer" className="btn-link-ea btn-primary btn-sm">
                        Abrir clipe gerado
                      </a>
                    ) : null}
                    {clipPreviewAsset?.url ? (
                      <a href={clipPreviewAsset.url} target="_blank" rel="noreferrer" className="btn-link-ea btn-ghost btn-sm">
                        Abrir thumbnail
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </section>
            )}

            {tab === "automation" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Workflows IA</h3>
                  <p className="editor-shell-note">
                    Organize automações, mantenha o projeto salvo e avance por etapas sem perder estrutura, entregáveis e histórico.
                  </p>
                </div>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Builder preparado</strong>
                  <p className="editor-shell-note">
                    Nós e conexões já ficam persistidos no projeto. A edição visual completa entra na próxima etapa.
                  </p>
                </div>
              </section>
            )}

            {tab === "course" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Creator Courses</h3>
                  <p className="editor-shell-note">
                    Estruture seções e aulas com uma base pronta para evolução editorial por módulos e marcos de versão.
                  </p>
                </div>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Seções e aulas</strong>
                  <p className="editor-shell-note">Estrutura salva no projeto para continuidade guiada no editor.</p>
                </div>
              </section>
            )}

            {tab === "website" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Creator Sites</h3>
                  <p className="editor-shell-note">
                    Mantenha blocos e estrutura do site prontos para crescer com o mesmo contexto do projeto até publicação.
                  </p>
                </div>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Blocos</strong>
                  <p className="editor-shell-note">Estrutura de blocos salva para evolução incremental.</p>
                </div>
              </section>
            )}

            {tab === "library" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Biblioteca IA</p>
                  <h3>Validação e apoio editorial</h3>
                  <p className="editor-shell-note">
                    Use a verificação editorial e registre o resultado no mesmo contexto do projeto e da próxima versão.
                  </p>
                </div>

                <div className="editor-shell-inline-card">
                  <div className="editor-shell-panel-head">
                    <h4>Verificação editorial (anti fake news)</h4>
                    <p className="editor-shell-note">
                      Cole uma afirmação, valide o resultado e mantenha o contexto no projeto.
                    </p>
                  </div>
                  <label className="field-label-ea">
                    <span>Afirmação para verificar</span>
                    <textarea
                      className="field-ea editor-shell-textarea editor-shell-textarea-sm"
                      value={claim}
                      onChange={e => setClaim(e.target.value)}
                      rows={4}
                      placeholder="Cole aqui uma afirmação para verificar..."
                    />
                  </label>
                  <div className="editor-shell-cta-group">
                    <button className="btn-ea btn-primary" onClick={runFactCheck} disabled={aiBusy !== null || !claim.trim()}>
                      {aiBusy === "fact" ? "Verificando..." : "Verificar"}
                    </button>
                    <button className="btn-ea btn-ghost" onClick={() => { setClaim(""); setFactResult(null); }} disabled={aiBusy !== null}>
                      Limpar
                    </button>
                  </div>

                  {factResult && (
                    <div className="editor-shell-result-card editor-shell-result-surface">
                      <div className="editor-shell-result-summary">
                        <div className="editor-shell-fact">
                          <span className="editor-shell-fact-label">Veredito</span>
                          <strong>{factVerdict}</strong>
                        </div>
                        <div className="editor-shell-fact">
                          <span className="editor-shell-fact-label">Confiança</span>
                          <strong>{factConfidence || "Não informada"}</strong>
                        </div>
                        <p className="editor-shell-note editor-shell-result-note">
                          O resumo acima ajuda na decisão rápida. O retorno completo permanece logo abaixo.
                        </p>
                      </div>
                      <pre className="editor-shell-pre editor-shell-pre-compact">{JSON.stringify(factResult, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        }
        right={
          <div className="editor-panel-stack editor-shell-support-stack">
            <section className="editor-shell-inline-card editor-shell-support-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Assistente lateral</p>
                <h3>EditexAI</h3>
                <p className="editor-shell-note">
                  Acione a IA sem sair do fluxo principal. O painel lateral acelera o trabalho sério sem competir com o entregável central.
                </p>
              </div>
              <div className="editor-shell-cta-group">
                <button className="btn-ea btn-primary" onClick={runTextGenerate} disabled={aiBusy !== null}>
                  {aiBusy === "text" ? "Gerando texto..." : "Gerar texto com IA"}
                </button>
                <button className="btn-ea btn-ghost" onClick={() => setTab("library")}>
                  Abrir biblioteca
                </button>
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Histórico de saída</p>
                <h4>O que já saiu da plataforma</h4>
                <p className="editor-shell-note">
                  Registre quando o trabalho for exportado no dispositivo, enviado por handoff ou publicado manualmente. O objetivo aqui é clareza operacional, não automação falsa.
                </p>
              </div>
              <div className="editor-project-checkpoint-list">
                {deliveryHistory.length ? deliveryHistory.map((event) => (
                  <div key={event.id} className="editor-project-checkpoint-item" data-type={event.stage === "published" ? "approved" : event.stage === "exported" ? "review_ready" : "draft"}>
                    <div className="editor-project-checkpoint-head">
                      <strong>{event.title}</strong>
                      <span>{new Date(event.ts).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="editor-project-checkpoint-note">
                      {OUTPUT_STAGE_META[event.stage].label} • canal {event.channel} • {event.note}
                    </div>
                  </div>
                )) : (
                  <div className="editor-shell-empty-note">
                    <strong>Nenhuma saída registrada</strong>
                    <span>Quando o entregável realmente sair da plataforma, registre o momento para não perder a trilha operacional.</span>
                  </div>
                )}
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Checkpoints do projeto</p>
                <h4>Marcos de decisão e continuidade</h4>
                <p className="editor-shell-note">
                  Revisão, aprovação e versões salvas agora ficam separados como marcos reais do trabalho, não só como log textual.
                </p>
              </div>
              <div className="editor-project-checkpoint-list">
                {checkpoints.length ? checkpoints.map((checkpoint) => (
                  <div key={checkpoint.id} className="editor-project-checkpoint-item" data-type={checkpoint.type}>
                    <div className="editor-project-checkpoint-head">
                      <strong>{checkpoint.title}</strong>
                      <span>{new Date(checkpoint.ts).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="editor-project-checkpoint-note">{checkpoint.note}</div>
                  </div>
                )) : (
                  <div className="editor-shell-empty-note">
                    <strong>Sem checkpoints ainda</strong>
                    <span>Salve uma versão ou marque o projeto para revisão para criar marcos reutilizáveis.</span>
                  </div>
                )}
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Versões salvas</p>
                <h4>Histórico de continuidade</h4>
                <p className="editor-shell-note">
                  Agora cada versão pode voltar para o editor como snapshot real de trabalho, em vez de ser só um registro passivo.
                </p>
              </div>
              <div className="editor-project-version-list">
                {versions.length ? versions.map((version) => (
                  <div key={version.id} className="editor-project-version-item">
                    <div className="editor-project-version-head">
                      <strong>{version.title}</strong>
                      <span>{new Date(version.ts).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="editor-project-version-meta">
                      <span>{version.deliverable}</span>
                      <span>{version.charCount} caracteres</span>
                      <span>{EDITOR_TAB_LABEL[version.tab]}</span>
                      {version.reviewStatus ? <span>{REVIEW_STATUS_META[version.reviewStatus].label}</span> : null}
                    </div>
                    <p>{version.summary}</p>
                    <div className="editor-project-version-actions">
                      <button
                        className="btn-ea btn-ghost btn-sm"
                        onClick={() => restoreVersion(version)}
                        disabled={!version.snapshotText || saving}
                      >
                        {version.snapshotText ? "Retomar esta versão" : "Versão antiga sem snapshot"}
                      </button>
                      {typeof version.assetCount === "number" ? (
                        <span className="editor-project-version-pill">{version.assetCount} ativo(s) ligados</span>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div className="editor-shell-empty-note">
                    <strong>Nenhuma versão registrada</strong>
                    <span>Salve o projeto para criar o primeiro marco real de continuidade.</span>
                  </div>
                )}
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Visibilidade do processo</p>
                <h4>Modos de trabalho</h4>
                <p className="editor-shell-note">
                  Controle como o processo da IA aparece durante o uso do editor.
                </p>
              </div>
              <div className="editor-shell-status-grid editor-shell-status-grid-compact">
                <div className="editor-shell-status-item">
                  <span>Professor</span>
                  <strong>{professorMode ? "Explicação ativa" : "Explicação opcional"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Transparência</span>
                  <strong>{transparentMode ? "Passos visíveis" : "Passos sob demanda"}</strong>
                </div>
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Log do projeto</p>
                <h4>Rastro de execução</h4>
                <p className="editor-shell-note">
                  Histórico rápido do que já foi salvo, gerado, validado ou aprovado no contexto deste editor.
                </p>
              </div>
              <div className="editor-shell-log-list">
                {aiSteps.length ? aiSteps.map(s => (
                  <div key={s.id} className="editor-shell-step">
                    <div className="editor-shell-step-head">
                      <div className="editor-shell-step-title">{s.title}</div>
                      <div className="editor-shell-step-ts">{s.ts}</div>
                    </div>
                    {s.details && <div className="editor-shell-step-copy">{s.details}</div>}
                  </div>
                )) : (
                  <div className="editor-shell-empty-note">
                    <strong>Sem passos registrados</strong>
                    <span>Salve um bloco ou execute uma ação IA para registrar novos passos aqui.</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        }
        footer={
          <div className="editor-shell-footer-stack">
            <div className="editor-shell-footer-wrap">
              <div className="editor-shell-footer-copy">
                <p className="section-kicker">Projeto atual</p>
                <strong className="editor-shell-footer-title">{title}</strong>
                <p className="editor-shell-note">
                  O fluxo agora fecha aqui com rastreio explícito: draft enquanto o trabalho ainda vive no editor, exported quando a saída realmente sai da plataforma e published quando a publicação manual for confirmada.
                </p>
              </div>
              <div className="editor-shell-cta-group">
                <button className="btn-ea btn-primary btn-sm" onClick={save} disabled={saving}>
                  {saving ? "Salvando..." : primarySaveLabel}
                </button>
                <button
                  className="btn-ea btn-secondary btn-sm"
                  onClick={() =>
                    registerDeliveryStage({
                      stage: "exported",
                      channel: editorState?.delivery.exportTarget === "connected_storage" ? "manual" : "device",
                      title: "Exportação registrada",
                      note:
                        editorState?.delivery.exportTarget === "connected_storage"
                          ? "Saída registrada para continuidade em storage conectado ou outro canal manual."
                          : "Entregável exportado no dispositivo e pronto para continuidade fora da plataforma.",
                    })
                  }
                  disabled={saving || !canRegisterExport}
                >
                  Registrar exported
                </button>
                <button
                  className="btn-ea btn-ghost btn-sm"
                  onClick={() =>
                    registerDeliveryStage({
                      stage: "published",
                      channel: "manual",
                      title: "Publicação manual registrada",
                      note: "Publicação confirmada manualmente fora da plataforma, sem depender de deploy automático inexistente nesta fase.",
                    })
                  }
                  disabled={saving || !canRegisterPublish || outputStage === "published"}
                >
                  Registrar published
                </button>
                <button className="btn-ea btn-ghost btn-sm" onClick={() => setAiSteps([])}>
                  Limpar log
                </button>
              </div>
            </div>
            {exportBlockReason ? (
              <div className="editor-project-origin-note editor-project-origin-note-inline">
                <strong>Antes de registrar a saída</strong>
                <span>{exportBlockReason}</span>
              </div>
            ) : null}
            {publishBlockReason ? (
              <div className="editor-project-origin-note editor-project-origin-note-inline">
                <strong>Antes de registrar published</strong>
                <span>{publishBlockReason}</span>
              </div>
            ) : null}
            <GitHubWorkspaceCard
              variant="compact"
              project={project ? { id: project.id, title, kind: project.kind, data: project.data } : null}
            />
            <VercelPublishCard
              variant="compact"
              project={project ? { id: project.id, title, kind: project.kind, data: project.data } : null}
            />
          </div>
        }
      />
    </div>
  );
}


