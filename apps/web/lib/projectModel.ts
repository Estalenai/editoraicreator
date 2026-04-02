"use client";

export const PROJECT_SCHEMA_VERSION = "editor-ai-creator.project.v1";

export type ReviewStatus = "draft" | "review_ready" | "approved" | "rework";
export type OutputStage = "draft" | "exported" | "published";
export type DeliveryChannel = "device" | "github" | "vercel" | "manual";
export type OutputState = "ready" | "working" | "context";
export type SourceOrigin =
  | "editor_new"
  | "creator_post"
  | "creator_scripts"
  | "creator_clips"
  | "creator_music"
  | "creator_ads"
  | "creator_no_code"
  | "legacy_content"
  | "legacy";

export type ProjectSourceField = {
  label: string;
  value: string;
};

export type ProjectSourceModel = {
  origin: SourceOrigin | string;
  label: string;
  summary: string;
  details: string;
  prefillText?: string;
  briefingFields?: ProjectSourceField[];
  outputFields?: ProjectSourceField[];
  nextAction?: string;
};

export type ProjectOutputAsset = {
  id: string;
  label: string;
  type: string;
  value: string;
  note?: string;
  url?: string | null;
  state: OutputState;
};

export type ProjectPrimaryOutput = {
  id: string;
  label: string;
  kind: string;
  value: string;
  note?: string;
  body?: string;
  url?: string | null;
  state: OutputState;
};

export type ProjectOutputModel = {
  primary: ProjectPrimaryOutput | null;
  assets: ProjectOutputAsset[];
  updatedAt: string | null;
  readyCount: number;
  workingCount: number;
  contextCount: number;
};

export type ProjectDeliveryEvent = {
  id: string;
  ts: string;
  stage: OutputStage;
  channel: DeliveryChannel;
  title: string;
  note: string;
};

export type ProjectDeliveryModel = {
  stage: OutputStage;
  exportTarget: "device" | "connected_storage";
  connectedStorage: string | null;
  mediaRetention: "externalized";
  lastExportedAt: string | null;
  lastPublishedAt: string | null;
  history: ProjectDeliveryEvent[];
};

export type ProjectDeliverableModel = {
  label: string;
  kind: string;
  summary: string;
  reviewStatus: ReviewStatus;
  primaryOutputId: string | null;
  latestVersionId: string | null;
  latestCheckpointId: string | null;
  nextAction: string;
};

export type ProjectGitHubBindingTarget = "app" | "site";

export type ProjectGitHubBinding = {
  provider: "github";
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  target: ProjectGitHubBindingTarget;
  connectedAt: string | null;
  updatedAt: string | null;
  accountLabel?: string | null;
  repositoryUrl?: string | null;
  defaultBranch?: string | null;
  lastVerifiedAt?: string | null;
  verificationStatus?: string | null;
  tokenConfigured?: boolean;
  lastResolvedCommitSha?: string | null;
  lastSyncStatus?: string | null;
  lastSyncedAt?: string | null;
  lastCommitSha?: string | null;
  lastCommitUrl?: string | null;
  lastPullRequestNumber?: number | null;
  lastPullRequestUrl?: string | null;
  lastPullRequestState?: string | null;
};

export type ProjectGitHubVersionRecord = {
  id: string;
  savedAt: string;
  handoffTarget: ProjectGitHubBindingTarget;
  repoLabel: string | null;
  branch?: string | null;
  commitMessage?: string | null;
};

export type ProjectGitHubExportRecord = {
  id: string;
  exportedAt: string;
  handoffTarget: ProjectGitHubBindingTarget;
  repoLabel: string | null;
  branch?: string | null;
  path?: string | null;
  commitSha?: string | null;
  commitUrl?: string | null;
  status?: string | null;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string | null;
};

export type ProjectGitHubIntegration = {
  binding: ProjectGitHubBinding | null;
  versions: ProjectGitHubVersionRecord[];
  exports: ProjectGitHubExportRecord[];
};

export type ProjectVercelBinding = {
  provider?: "vercel";
  projectId: string | null;
  projectName: string;
  teamId?: string | null;
  teamSlug: string;
  framework: "nextjs" | "vite" | "static";
  rootDirectory: string;
  target: "preview" | "production";
  deployStatus: "draft" | "ready" | "published";
  previewUrl: string;
  productionUrl: string;
  projectUrl?: string | null;
  connectedAt?: string | null;
  updatedAt: string | null;
  lastVerifiedAt?: string | null;
  verificationStatus?: string | null;
  tokenConfigured?: boolean;
  linkedRepoId?: string | null;
  linkedRepoType?: string | null;
  lastDeploymentId?: string | null;
  lastDeploymentUrl?: string | null;
  lastDeploymentInspectorUrl?: string | null;
  lastDeploymentState?: string | null;
  lastDeploymentTarget?: "preview" | "production" | null;
  lastDeploymentRef?: string | null;
  lastDeployRequestedAt?: string | null;
  lastDeployReadyAt?: string | null;
  lastDeployError?: string | null;
  publishMachine?: ProjectVercelPublishMachine | null;
};

export type ProjectVercelPublishMachineState =
  | "idle"
  | "workspace_verified"
  | "deployment_requested"
  | "deployment_running"
  | "deployment_ready"
  | "published"
  | "deployment_failed";

export type ProjectVercelPublishMachine = {
  version: string;
  state: ProjectVercelPublishMachineState;
  sourceOfTruth: "backend" | "provider";
  reconcileMode: string;
  externalState: string | null;
  confirmed: boolean;
  terminal: boolean;
  retryable: boolean;
  lastSource: string | null;
  lastEventType: string | null;
  lastTransitionAt: string | null;
  lastCheckedAt: string | null;
  lastWebhookAt: string | null;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  nextCheckAt: string | null;
  note: string | null;
};

export type ProjectVercelEvent = {
  id: string;
  ts: string;
  type:
    | "base_saved"
    | "handoff_exported"
    | "published_manual"
    | "status_updated"
    | "workspace_saved"
    | "deployment_requested"
    | "deployment_ready"
    | "deployment_failed"
    | "deployment_reconciled";
  stage: OutputStage;
  title: string;
  note: string;
};

export type ProjectVercelIntegration = {
  binding: ProjectVercelBinding | null;
  lastManifestExportedAt: string | null;
  lastDeploymentCheckedAt?: string | null;
  history: ProjectVercelEvent[];
};

export type ProjectIntegrationsModel = {
  github: ProjectGitHubIntegration;
  vercel: ProjectVercelIntegration;
};

export type CanonicalProjectData = {
  schema: typeof PROJECT_SCHEMA_VERSION;
  source: ProjectSourceModel;
  output: ProjectOutputModel;
  deliverable: ProjectDeliverableModel;
  delivery: ProjectDeliveryModel;
  integrations: ProjectIntegrationsModel;
  editor?: any;
  [key: string]: any;
};

type ProjectMeta = {
  projectKind?: string;
  projectTitle?: string;
};

type CreatorPostInput = {
  platform: string;
  contentType: string;
  tone: string;
  objective: string;
  language: string;
  theme: string;
  result: {
    caption?: string;
    hashtags?: string[];
    cta?: string;
    mediaSuggestion?: string;
    variations?: string[];
    platformChecklist?: string[];
  };
};

type CreatorScriptsInput = {
  theme: string;
  format: string;
  tone: string;
  audience: string;
  duration: string;
  objective: string;
  notes: string;
  language: string;
  generated: {
    structured?: {
      title?: string;
      opening?: string;
      development_points?: string[];
      closing?: string;
      cta?: string;
      final_script?: string;
    } | null;
    raw_text?: string;
    prompt_used?: string;
  };
};

type CreatorClipsInput = {
  clipIdea: string;
  visualStyle: string;
  tone: string;
  platform: string;
  objective: string;
  durationSec: number;
  aspectRatio: string;
  quality: string;
  language: string;
  notes: string;
  generated: {
    prompt_used?: string;
    clip_url?: string;
    result?: {
      ok?: boolean;
      jobId?: string;
      status?: string;
      provider?: string;
      model?: string;
      estimated_seconds?: number;
      assets?: {
        preview_url?: string;
        [key: string]: any;
      };
      output?: {
        video_url?: string;
        thumbnail_url?: string;
        [key: string]: any;
      };
      replay?: boolean;
    };
  };
};

type SyncEditorStateInput = {
  projectKind: string;
  editor: any;
  source?: ProjectSourceModel;
  outputAssets: ProjectOutputAsset[];
  primaryOutput: ProjectPrimaryOutput | null;
  deliverable: {
    label: string;
    summary: string;
    reviewStatus: ReviewStatus;
    nextAction: string;
    latestVersionId?: string | null;
    latestCheckpointId?: string | null;
  };
  delivery: ProjectDeliveryModel;
  updatedAt?: string;
};

function localId() {
  try {
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asText(item)).filter(Boolean);
}

function summarizeText(value: string, max = 140): string {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Sem conteudo consolidado ainda.";
  return normalized.length <= max ? normalized : `${normalized.slice(0, max).trim()}...`;
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeReviewStatus(value: unknown): ReviewStatus {
  if (value === "review_ready" || value === "approved" || value === "rework") return value;
  return "draft";
}

function normalizeOutputStage(value: unknown): OutputStage {
  if (value === "exported" || value === "published") return value;
  return "draft";
}

function normalizeDeliveryChannel(value: unknown): DeliveryChannel {
  if (value === "github" || value === "vercel" || value === "manual") return value;
  return "device";
}

function normalizeSourceFieldList(value: unknown): ProjectSourceField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      label: asText(item.label),
      value: asText(item.value),
    }))
    .filter((item) => item.label && item.value);
}

function normalizeOutputAsset(asset: any): ProjectOutputAsset | null {
  if (!asset || typeof asset !== "object") return null;
  const id = asText(asset.id) || localId();
  const label = asText(asset.label);
  const type = asText(asset.type);
  const value = asText(asset.value);
  if (!label || !type || !value) return null;
  return {
    id,
    label,
    type,
    value,
    note: asText(asset.note) || undefined,
    url: asText(asset.url) || null,
    state: asset.state === "working" ? "working" : asset.state === "context" ? "context" : "ready",
  };
}

function normalizePrimaryOutput(value: any): ProjectPrimaryOutput | null {
  if (!value || typeof value !== "object") return null;
  const id = asText(value.id) || localId();
  const label = asText(value.label);
  const kind = asText(value.kind);
  const summary = asText(value.value);
  if (!label || !kind || !summary) return null;
  return {
    id,
    label,
    kind,
    value: summary,
    note: asText(value.note) || undefined,
    body: asText(value.body) || undefined,
    url: asText(value.url) || null,
    state: value.state === "working" ? "working" : value.state === "context" ? "context" : "ready",
  };
}

function countAssetStates(assets: ProjectOutputAsset[]) {
  return assets.reduce(
    (acc, asset) => {
      if (asset.state === "ready") acc.readyCount += 1;
      else if (asset.state === "working") acc.workingCount += 1;
      else acc.contextCount += 1;
      return acc;
    },
    { readyCount: 0, workingCount: 0, contextCount: 0 }
  );
}

function buildOutputModel(
  assets: ProjectOutputAsset[],
  primary: ProjectPrimaryOutput | null,
  updatedAt: string | null
): ProjectOutputModel {
  const normalizedAssets = assets.map((asset) => normalizeOutputAsset(asset)).filter(Boolean) as ProjectOutputAsset[];
  const normalizedPrimary = normalizePrimaryOutput(primary);
  const counts = countAssetStates(normalizedAssets);
  return {
    primary: normalizedPrimary,
    assets: normalizedAssets,
    updatedAt,
    readyCount: counts.readyCount,
    workingCount: counts.workingCount,
    contextCount: counts.contextCount,
  };
}

function buildDeliveryModel(input?: Partial<ProjectDeliveryModel> | null): ProjectDeliveryModel {
  const normalizedHistory = Array.isArray(input?.history)
    ? input?.history
        .filter((item) => item && typeof item === "object")
        .map((item: any) => ({
          id: asText(item.id) || localId(),
          ts: asText(item.ts) || new Date().toISOString(),
          stage: normalizeOutputStage(item.stage),
          channel: normalizeDeliveryChannel(item.channel),
          title: asText(item.title) || "Evento de saida",
          note: asText(item.note),
        }))
    : [];

  return {
    stage: normalizeOutputStage(input?.stage),
    exportTarget: input?.exportTarget === "connected_storage" ? "connected_storage" : "device",
    connectedStorage: asText(input?.connectedStorage) || null,
    mediaRetention: "externalized",
    lastExportedAt: asText(input?.lastExportedAt) || null,
    lastPublishedAt: asText(input?.lastPublishedAt) || null,
    history: normalizedHistory,
  };
}

function normalizeProjectRootPath(value: any): string {
  const trimmed = asText(value) || "/";
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function normalizeGitHubBindingTarget(value: any): ProjectGitHubBindingTarget {
  return value === "app" ? "app" : "site";
}

function normalizeVercelFramework(value: any): ProjectVercelBinding["framework"] {
  if (value === "vite") return "vite";
  if (value === "static") return "static";
  return "nextjs";
}

function normalizeVercelTarget(value: any): ProjectVercelBinding["target"] {
  return value === "production" ? "production" : "preview";
}

function normalizeVercelDeployStatus(value: any): ProjectVercelBinding["deployStatus"] {
  if (value === "ready") return "ready";
  if (value === "published") return "published";
  return "draft";
}

function editorKindLabel(kind?: string): string {
  const normalized = asText(kind).toLowerCase();
  if (normalized === "post") return "Post";
  if (normalized === "script") return "Roteiro";
  if (normalized === "video") return "Clipe";
  if (normalized === "text") return "Peca textual";
  if (normalized === "website") return "Site";
  if (normalized === "automation") return "Workflow";
  if (normalized === "course") return "Curso";
  return "Projeto";
}

function buildBaseSource(meta: ProjectMeta): ProjectSourceModel {
  const label = "Editor";
  const deliverableKind = editorKindLabel(meta.projectKind);
  return {
    origin: "editor_new",
    label,
    summary: `Projeto iniciado direto no editor para ${deliverableKind.toLowerCase()}.`,
    details: [
      meta.projectTitle ? `Projeto\n${meta.projectTitle}` : "",
      deliverableKind ? `Entregavel\n${deliverableKind}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    prefillText: "",
    briefingFields: deliverableKind ? [{ label: "Tipo", value: deliverableKind }] : [],
    outputFields: [],
    nextAction: "Construa a primeira base no editor, salve um checkpoint e registre a saida so quando o entregavel estiver consolidado.",
  };
}

function buildBaseDelivery(stage: OutputStage = "draft"): ProjectDeliveryModel {
  return buildDeliveryModel({
    stage,
    exportTarget: "device",
    connectedStorage: null,
    mediaRetention: "externalized",
    lastExportedAt: null,
    lastPublishedAt: null,
    history: [],
  });
}

export function buildBaseEditorState({
  docText = "",
  reviewStatus = "draft",
  delivery,
}: {
  docText?: string;
  reviewStatus?: ReviewStatus;
  delivery?: ProjectDeliveryModel;
}) {
  const normalizedDelivery = buildDeliveryModel(delivery || buildBaseDelivery());
  return {
    version: 1,
    mode: { professor: false, transparent: false },
    timeline: { clips: [] },
    doc: { text: docText },
    workflow: { nodes: [], edges: [] },
    course: { sections: [] },
    website: { blocks: [] },
    aiSteps: [],
    review: { factCheck: null, status: normalizeReviewStatus(reviewStatus) },
    versions: [],
    checkpoints: [],
    delivery: {
      exportTarget: normalizedDelivery.exportTarget,
      connectedStorage: normalizedDelivery.connectedStorage,
      mediaRetention: normalizedDelivery.mediaRetention,
      outputStage: normalizedDelivery.stage,
      lastExportedAt: normalizedDelivery.lastExportedAt,
      lastPublishedAt: normalizedDelivery.lastPublishedAt,
      history: normalizedDelivery.history,
    },
  };
}

export function parseLegacyProjectPayload(rawData: any): any | null {
  if (!rawData || typeof rawData !== "object") return null;

  if (typeof rawData.content === "string") {
    const parsed = safeJsonParse(rawData.content);
    if (parsed && typeof parsed === "object") return parsed;
    const rawText = asText(rawData.content);
    if (rawText) {
      return {
        type: "legacy_content",
        raw_text: rawText,
      };
    }
  }

  if (
    rawData.type ||
    rawData.generated ||
    rawData.result ||
    rawData.projectName ||
    rawData.clipIdea ||
    rawData.theme
  ) {
    return rawData;
  }

  return null;
}

function buildSourceFromPayload(payload: any, meta: ProjectMeta): ProjectSourceModel {
  if (!payload || typeof payload !== "object") return buildBaseSource(meta);

  if (payload.type === "creator_post") {
    const result = payload.result || {};
    const platform = asText(payload.platform);
    const contentType = asText(payload.contentType);
    const tone = asText(payload.tone);
    const objective = asText(payload.objective);
    const theme = asText(payload.theme);
    const caption = asText(result.caption);
    const cta = asText(result.cta);
    const hashtagsList = normalizeStringList(result.hashtags);
    const hashtags = hashtagsList.join(" ");
    const variations = normalizeStringList(result.variations);
    const mediaSuggestion = asText(result.mediaSuggestion);
    const checklist = normalizeStringList(result.platformChecklist);
    return {
      origin: "creator_post",
      label: "Creator Post",
      summary: "Post salvo a partir de Creators com briefing, legenda e proximos passos prontos para continuidade no editor.",
      details: [
        platform ? `Plataforma\n${platform}` : "",
        contentType ? `Formato\n${contentType}` : "",
        theme ? `Briefing\n${theme}` : "",
        caption ? `Legenda\n${caption}` : "",
        hashtags ? `Hashtags\n${hashtags}` : "",
        cta ? `CTA\n${cta}` : "",
        mediaSuggestion ? `Midia sugerida\n${mediaSuggestion}` : "",
        variations.length ? `Variacoes\n- ${variations.join("\n- ")}` : "",
        checklist.length ? `Checklist\n- ${checklist.join("\n- ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [caption, hashtags, cta ? `CTA: ${cta}` : ""].filter(Boolean).join("\n\n"),
      briefingFields: [
        { label: "Plataforma", value: platform },
        { label: "Formato", value: contentType },
        { label: "Tom", value: tone },
        { label: "Objetivo", value: objective },
      ].filter((item) => item.value),
      outputFields: [
        { label: "Hashtags", value: hashtagsList.length ? `${hashtagsList.length} conectadas` : "" },
        { label: "CTA", value: cta },
        { label: "Midia sugerida", value: mediaSuggestion },
        { label: "Variacoes", value: variations.length ? `${variations.length} prontas para iteracao` : "" },
      ].filter((item) => item.value),
        nextAction: "Refine a legenda principal, salve a primeira versao do post e registre a saida quando a peca realmente sair da plataforma.",
    };
  }

  if (payload.type === "creator_scripts") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const theme = asText(payload.theme);
    const format = asText(payload.format);
    const tone = asText(payload.tone);
    const audience = asText(payload.audience);
    const duration = asText(payload.duration);
    const objective = asText(payload.objective);
    const finalScript = asText(structured.final_script || generated.raw_text);
    const developmentPoints = normalizeStringList(structured.development_points);
    return {
      origin: "creator_scripts",
      label: "Creator Scripts",
      summary: "Roteiro salvo a partir de Creators com estrutura, CTA e continuidade prontos para revisao editorial.",
      details: [
        format ? `Formato\n${format}` : "",
        theme ? `Tema\n${theme}` : "",
        asText(structured.title) ? `Titulo\n${asText(structured.title)}` : "",
        asText(structured.opening) ? `Abertura\n${asText(structured.opening)}` : "",
        developmentPoints.length ? `Desenvolvimento\n- ${developmentPoints.join("\n- ")}` : "",
        asText(structured.closing) ? `Encerramento\n${asText(structured.closing)}` : "",
        finalScript ? `Roteiro final\n${finalScript}` : "",
        asText(structured.cta) ? `CTA\n${asText(structured.cta)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: finalScript,
      briefingFields: [
        { label: "Formato", value: format },
        { label: "Tom", value: tone },
        { label: "Publico", value: audience },
        { label: "Objetivo", value: objective },
        { label: "Duracao", value: duration },
      ].filter((item) => item.value),
      outputFields: [
        { label: "Hook", value: asText(structured.opening) ? "Abertura pronta" : "" },
        { label: "Desenvolvimento", value: developmentPoints.length ? `${developmentPoints.length} bloco(s)` : "" },
        { label: "Fechamento", value: asText(structured.closing) ? "Encerramento pronto" : "" },
        { label: "CTA", value: asText(structured.cta) ? "CTA definido" : "" },
      ].filter((item) => item.value),
      nextAction: "Abra a revisao editorial, marque o roteiro como pronto para revisao e salve um checkpoint antes de registrar exported.",
    };
  }

  if (payload.type === "creator_clips") {
    const generated = payload.generated || {};
    const result = generated.result || {};
    const clipIdea = asText(payload.clipIdea);
    const visualStyle = asText(payload.visualStyle);
    const tone = asText(payload.tone);
    const platform = asText(payload.platform);
    const duration = Number.isFinite(Number(payload.durationSec)) ? `${Number(payload.durationSec)}s` : "";
    const aspectRatio = asText(payload.aspectRatio);
    const quality = asText(payload.quality);
    const clipStatus = asText(result.status);
    const provider = asText(result.provider);
    const model = asText(result.model);
    const clipUrl = asText(generated.clip_url || result?.output?.video_url || result?.assets?.preview_url);
    const thumbnailUrl = asText(result?.output?.thumbnail_url);
    return {
      origin: "creator_clips",
      label: "Creator Clips",
      summary: clipUrl
        ? "Clipe salvo a partir de Creators com link visual pronto para revisao, checkpoint e saida."
        : "Job de video salvo a partir de Creators com status, briefing visual e continuidade pronta para o editor.",
      details: [
        clipIdea ? `Ideia do clipe\n${clipIdea}` : "",
        visualStyle ? `Estilo visual\n${visualStyle}` : "",
        platform ? `Plataforma\n${platform}` : "",
        asText(result.jobId) ? `Job ID\n${asText(result.jobId)}` : "",
        clipStatus ? `Status\n${clipStatus}` : "",
        provider ? `Provedor\n${provider}${model ? ` · ${model}` : ""}` : "",
        clipUrl ? `URL do video\n${clipUrl}` : "",
        thumbnailUrl ? `Thumbnail\n${thumbnailUrl}` : "",
        asText(generated.prompt_used) ? `Prompt usado\n${asText(generated.prompt_used)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [
        clipIdea ? `Ideia: ${clipIdea}` : "",
        clipStatus ? `Status: ${clipStatus}` : "",
        clipUrl ? `Video: ${clipUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      briefingFields: [
        { label: "Estilo", value: visualStyle },
        { label: "Tom", value: tone },
        { label: "Plataforma", value: platform },
        { label: "Duracao", value: duration },
        { label: "Formato", value: aspectRatio },
        { label: "Qualidade", value: quality },
      ].filter((item) => item.value),
      outputFields: [
        { label: "Job", value: asText(result.jobId) ? `ID ${asText(result.jobId)}` : "" },
        { label: "Status", value: clipStatus || "" },
        { label: "Saida visual", value: clipUrl ? "Link do clipe disponivel" : "Aguardando link final" },
        { label: "Publicacao", value: clipUrl ? "Pronto para revisao visual" : "Acompanhar job antes da saida" },
      ].filter((item) => item.value),
      nextAction: clipUrl
          ? "Abra o clipe no editor, valide o ativo visual, salve um checkpoint e registre a saida quando ela realmente sair da plataforma."
          : "Leve o job para o editor, acompanhe o status do clipe e so registre a saida quando o link final estiver disponivel.",
    };
  }

  if (payload.type === "legacy_content") {
    const rawText = asText(payload.raw_text);
    return {
      origin: "legacy_content",
      label: "Contexto importado",
      summary: "Projeto salvo antes da estrutura atual do editor.",
      details: rawText,
      prefillText: rawText,
      briefingFields: [],
      outputFields: [],
      nextAction: "Revise a base importada, consolide o entregavel no editor e salve um checkpoint antes da saida.",
    };
  }

  return buildBaseSource(meta);
}

function buildPrimaryOutputFromAssets(
  assets: ProjectOutputAsset[],
  fallbackKind: string,
  preferredAssetId?: string | null
): ProjectPrimaryOutput | null {
  const preferred = preferredAssetId ? assets.find((asset) => asset.id === preferredAssetId) || null : null;
  const base = preferred || assets.find((asset) => asset.state === "ready") || assets[0] || null;
  if (!base) return null;
  return {
    id: base.id,
    label: base.label,
    kind: fallbackKind,
    value: base.value,
    note: base.note,
    url: base.url || null,
    state: base.state,
  };
}

function buildOutputFromPayload(rawData: any, meta: ProjectMeta): ProjectOutputModel {
  const payload = parseLegacyProjectPayload(rawData);
  const editorText = asText(rawData?.editor?.doc?.text);
  const now =
    asText(rawData?.output?.updatedAt) ||
    asText(rawData?.delivery?.lastPublishedAt) ||
    asText(rawData?.delivery?.lastExportedAt) ||
    asText(rawData?.editor?.versions?.[0]?.ts) ||
    null;
  const assets: ProjectOutputAsset[] = [];

  if (editorText) {
    assets.push({
      id: "main-doc",
      label: "Documento principal",
      type: "Saida central",
      value: `${editorText.length} caracteres prontos para refinamento`,
      note: summarizeText(editorText, 120),
      state: "ready",
    });
  }

  if (payload?.type === "creator_post") {
    const result = payload.result || {};
    const caption = asText(result.caption);
    const hashtags = normalizeStringList(result.hashtags);
    const cta = asText(result.cta);
    const mediaSuggestion = asText(result.mediaSuggestion);
    if (!editorText && caption) {
      assets.push({
        id: "post-caption",
        label: "Legenda principal",
        type: "Post",
        value: `${caption.length} caracteres prontos para edicao`,
        note: summarizeText(caption, 120),
        state: "ready",
      });
    }
    if (hashtags.length) {
      assets.push({
        id: "post-hashtags",
        label: "Hashtags do post",
        type: "Distribuicao",
        value: `${hashtags.length} conectadas a peca`,
        note: hashtags.join(" "),
        state: "ready",
      });
    }
    if (cta) {
      assets.push({
        id: "post-cta",
        label: "CTA principal",
        type: "Conversao",
        value: cta,
        note: "Chamada pronta para publicacao ou refinamento editorial.",
        state: "ready",
      });
    }
    if (mediaSuggestion) {
      assets.push({
        id: "post-media",
        label: "Direcao de midia",
        type: "Referencia visual",
        value: summarizeText(mediaSuggestion, 96),
        note: "Referencia salva junto da copy para briefing visual ou publicacao.",
        state: "context",
      });
    }
    return buildOutputModel(
      assets,
      buildPrimaryOutputFromAssets(assets, "post", editorText ? "main-doc" : "post-caption"),
      now
    );
  }

  if (payload?.type === "creator_scripts") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const developmentPoints = normalizeStringList(structured.development_points);
    const finalScript = asText(structured.final_script || generated.raw_text);
    if (asText(structured.title)) {
      assets.push({
        id: "script-title",
        label: "Titulo do roteiro",
        type: "Estrutura",
        value: asText(structured.title),
        note: "Titulo salvo junto do roteiro para revisao editorial e continuidade.",
        state: "ready",
      });
    }
    if (asText(structured.opening)) {
      assets.push({
        id: "script-hook",
        label: "Hook de abertura",
        type: "Estrutura",
        value: summarizeText(asText(structured.opening), 96),
        note: "Abertura pronta para revisao de gancho e ritmo.",
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
    if (asText(structured.cta)) {
      assets.push({
        id: "script-cta",
        label: "CTA do roteiro",
        type: "Saida editorial",
        value: asText(structured.cta),
        note: "Chamada final pronta para aprovacao editorial.",
        state: "ready",
      });
    }
    if (!editorText && finalScript) {
      assets.unshift({
        id: "script-body",
        label: "Roteiro consolidado",
        type: "Saida central",
        value: `${finalScript.length} caracteres prontos para revisao`,
        note: summarizeText(finalScript, 120),
        state: "ready",
      });
    }
    return buildOutputModel(
      assets,
      buildPrimaryOutputFromAssets(assets, "script", editorText ? "main-doc" : "script-body"),
      now
    );
  }

  if (payload?.type === "creator_clips") {
    const generated = payload.generated || {};
    const result = generated.result || {};
    const clipUrl = asText(generated.clip_url || result?.output?.video_url || result?.assets?.preview_url);
    const thumbnailUrl = asText(result?.output?.thumbnail_url);
    const clipStatus = asText(result.status);
    const provider = asText(result.provider);
    const model = asText(result.model);
    const visualStyle = asText(payload.visualStyle);
    const platform = asText(payload.platform);

    if (clipStatus || provider) {
      assets.push({
        id: "clip-job",
        label: "Estado do job",
        type: "Pipeline visual",
        value: clipStatus ? `Status ${clipStatus}` : "Job registrado",
        note: provider ? `Execucao via ${provider}${model ? ` · ${model}` : ""}.` : "Acompanhe o retorno do provedor antes da saida final.",
        state: clipUrl ? "ready" : "working",
      });
    }

    assets.push({
      id: "clip-output",
      label: "Clipe gerado",
      type: "Video",
      value: clipStatus ? `Status ${clipStatus}` : "Job salvo no projeto",
      note: clipUrl ? "Link do clipe disponivel para revisao." : "Acompanhe o job e consolide o link final antes de exportar.",
      url: clipUrl || null,
      state: clipUrl ? "ready" : "working",
    });

    if (thumbnailUrl) {
      assets.push({
        id: "clip-thumbnail",
        label: "Thumbnail do clipe",
        type: "Preview",
        value: "Thumbnail pronta para revisao visual",
        note: "Use a thumbnail para validar enquadramento e continuidade antes da publicacao.",
        url: thumbnailUrl,
        state: "ready",
      });
    }

    if (visualStyle || platform) {
      assets.push({
        id: "clip-direction",
        label: "Direcao visual",
        type: "Briefing",
        value: [visualStyle, platform].filter(Boolean).join(" · ") || "Briefing visual salvo",
        note: "A ideia, o estilo e o canal do clipe continuam ligados ao ativo final no editor.",
        state: "context",
      });
    }

    return buildOutputModel(assets, buildPrimaryOutputFromAssets(assets, "clip", "clip-output"), now);
  }

  if (payload?.type === "legacy_content") {
    const rawText = asText(payload.raw_text);
    if (rawText) {
      assets.push({
        id: "legacy-content",
        label: "Conteudo importado",
        type: "Base antiga",
        value: `${rawText.length} caracteres herdados`,
        note: summarizeText(rawText, 120),
        state: "ready",
      });
    }
  }

  return buildOutputModel(assets, buildPrimaryOutputFromAssets(assets, editorKindLabel(meta.projectKind)), now);
}

function buildDeliverableFromData(
  rawData: any,
  meta: ProjectMeta,
  source: ProjectSourceModel,
  output: ProjectOutputModel,
  delivery: ProjectDeliveryModel
): ProjectDeliverableModel {
  const existing = rawData?.deliverable;
  const reviewStatus = normalizeReviewStatus(existing?.reviewStatus || rawData?.editor?.review?.status);
  const latestVersionId = asText(existing?.latestVersionId || rawData?.editor?.versions?.[0]?.id) || null;
  const latestCheckpointId = asText(existing?.latestCheckpointId || rawData?.editor?.checkpoints?.[0]?.id) || null;
  const baseKind = editorKindLabel(meta.projectKind);
  const defaultLabel =
    source.origin === "creator_post"
      ? "Post principal"
      : source.origin === "creator_scripts"
        ? "Roteiro principal"
        : source.origin === "creator_clips"
          ? "Clipe principal"
          : baseKind;
  const nextAction =
    asText(existing?.nextAction) ||
    source.nextAction ||
    (delivery.stage === "draft"
      ? "Continue no editor, salve uma versao e registre a saida so quando o trabalho estiver consolidado."
      : delivery.stage === "exported"
          ? "Finalize a etapa externa ou a publicacao manual antes de marcar o projeto como publicado."
        : "A publicacao ja foi registrada. Use o historico para acompanhar a saida.");

  return {
    label: asText(existing?.label) || defaultLabel,
    kind: asText(existing?.kind) || baseKind,
    summary:
      asText(existing?.summary) ||
      output.primary?.note ||
      output.primary?.value ||
      source.summary,
    reviewStatus,
    primaryOutputId: asText(existing?.primaryOutputId) || output.primary?.id || null,
    latestVersionId,
    latestCheckpointId,
    nextAction,
  };
}

function normalizeExistingSource(value: any): ProjectSourceModel | null {
  if (!value || typeof value !== "object") return null;
  const label = asText(value.label);
  const summary = asText(value.summary);
  const details = typeof value.details === "string" ? value.details : "";
  if (!label || !summary) return null;
  return {
    origin: asText(value.origin) || "legacy",
    label,
    summary,
    details,
    prefillText: asText(value.prefillText) || undefined,
    briefingFields: normalizeSourceFieldList(value.briefingFields),
    outputFields: normalizeSourceFieldList(value.outputFields),
    nextAction: asText(value.nextAction) || undefined,
  };
}

function normalizeExistingOutput(value: any): ProjectOutputModel | null {
  if (!value || typeof value !== "object") return null;
  const assets = Array.isArray(value.assets)
    ? value.assets.map((asset: any) => normalizeOutputAsset(asset)).filter(Boolean) as ProjectOutputAsset[]
    : [];
  const primary = normalizePrimaryOutput(value.primary);
  const counts = countAssetStates(assets);
  return {
    primary,
    assets,
    updatedAt: asText(value.updatedAt) || null,
    readyCount: Number.isFinite(Number(value.readyCount)) ? Number(value.readyCount) : counts.readyCount,
    workingCount: Number.isFinite(Number(value.workingCount)) ? Number(value.workingCount) : counts.workingCount,
    contextCount: Number.isFinite(Number(value.contextCount)) ? Number(value.contextCount) : counts.contextCount,
  };
}

function normalizeExistingDeliverable(value: any): Partial<ProjectDeliverableModel> | null {
  if (!value || typeof value !== "object") return null;
  return {
    label: asText(value.label),
    kind: asText(value.kind),
    summary: asText(value.summary),
    reviewStatus: normalizeReviewStatus(value.reviewStatus),
    primaryOutputId: asText(value.primaryOutputId) || null,
    latestVersionId: asText(value.latestVersionId) || null,
    latestCheckpointId: asText(value.latestCheckpointId) || null,
    nextAction: asText(value.nextAction),
  };
}


function normalizeGitHubVersionRecords(value: any): ProjectGitHubVersionRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      id: asText(item.id) || localId(),
      savedAt: asText(item.savedAt) || new Date().toISOString(),
      handoffTarget: normalizeGitHubBindingTarget(item.handoffTarget),
      repoLabel: asText(item.repoLabel) || null,
      branch: asText(item.branch) || null,
      commitMessage: asText(item.commitMessage) || null,
    }))
    .slice(0, 16);
}

function normalizeGitHubExportRecords(value: any): ProjectGitHubExportRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      id: asText(item.id) || localId(),
      exportedAt: asText(item.exportedAt) || new Date().toISOString(),
      handoffTarget: normalizeGitHubBindingTarget(item.handoffTarget),
      repoLabel: asText(item.repoLabel) || null,
      branch: asText(item.branch) || null,
      path: asText(item.path) || null,
      commitSha: asText(item.commitSha) || null,
      commitUrl: asText(item.commitUrl) || null,
      status: asText(item.status) || null,
      pullRequestNumber: asOptionalNumber(item.pullRequestNumber),
      pullRequestUrl: asText(item.pullRequestUrl) || null,
    }))
    .slice(0, 16);
}

function normalizeExistingGitHubBinding(value: any): ProjectGitHubBinding | null {
  if (!value || typeof value !== "object") return null;
  const owner = asText(value.owner);
  const repo = asText(value.repo);
  if (!owner || !repo) return null;
  return {
    provider: "github",
    owner,
    repo,
    branch: asText(value.branch) || "main",
    rootPath: normalizeProjectRootPath(value.rootPath),
    target: normalizeGitHubBindingTarget(value.target),
    connectedAt: asText(value.connectedAt) || null,
    updatedAt: asText(value.updatedAt) || null,
    accountLabel: asText(value.accountLabel) || null,
    repositoryUrl: asText(value.repositoryUrl) || null,
    defaultBranch: asText(value.defaultBranch) || null,
    lastVerifiedAt: asText(value.lastVerifiedAt) || null,
    verificationStatus: asText(value.verificationStatus) || null,
    tokenConfigured: Boolean(value.tokenConfigured),
    lastResolvedCommitSha: asText(value.lastResolvedCommitSha) || null,
    lastSyncStatus: asText(value.lastSyncStatus) || null,
    lastSyncedAt: asText(value.lastSyncedAt) || null,
    lastCommitSha: asText(value.lastCommitSha) || null,
    lastCommitUrl: asText(value.lastCommitUrl) || null,
    lastPullRequestNumber: asOptionalNumber(value.lastPullRequestNumber),
    lastPullRequestUrl: asText(value.lastPullRequestUrl) || null,
    lastPullRequestState: asText(value.lastPullRequestState) || null,
  };
}

function normalizeExistingGitHubIntegration(value: any): ProjectGitHubIntegration {
  return {
    binding: normalizeExistingGitHubBinding(value?.binding),
    versions: normalizeGitHubVersionRecords(value?.versions),
    exports: normalizeGitHubExportRecords(value?.exports),
  };
}

function normalizeVercelHistory(value: any): ProjectVercelEvent[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item: any) => ({
      id: asText(item.id) || localId(),
      ts: asText(item.ts) || new Date().toISOString(),
      type:
        item.type === "handoff_exported" ||
        item.type === "published_manual" ||
        item.type === "status_updated" ||
        item.type === "workspace_saved" ||
        item.type === "deployment_requested" ||
        item.type === "deployment_ready" ||
        item.type === "deployment_failed" ||
        item.type === "deployment_reconciled"
          ? item.type
          : "base_saved",
      stage: normalizeOutputStage(item.stage),
      title: asText(item.title) || "Evento Vercel",
      note: asText(item.note),
    }))
    .slice(0, 12);
}

function normalizeExistingVercelPublishMachine(value: any): ProjectVercelPublishMachine | null {
  if (!value || typeof value !== "object") return null;
  const state =
    value.state === "workspace_verified" ||
    value.state === "deployment_requested" ||
    value.state === "deployment_running" ||
    value.state === "deployment_ready" ||
    value.state === "published" ||
    value.state === "deployment_failed"
      ? value.state
      : "idle";

  return {
    version: asText(value.version) || "vercel.publish-machine.v1",
    state,
    sourceOfTruth: value.sourceOfTruth === "provider" ? "provider" : "backend",
    reconcileMode: asText(value.reconcileMode) || "webhook+poll",
    externalState: asText(value.externalState) || null,
    confirmed: Boolean(value.confirmed),
    terminal: Boolean(value.terminal),
    retryable: Boolean(value.retryable),
    lastSource: asText(value.lastSource) || null,
    lastEventType: asText(value.lastEventType) || null,
    lastTransitionAt: asText(value.lastTransitionAt) || null,
    lastCheckedAt: asText(value.lastCheckedAt) || null,
    lastWebhookAt: asText(value.lastWebhookAt) || null,
    lastPollAt: asText(value.lastPollAt) || null,
    lastSuccessAt: asText(value.lastSuccessAt) || null,
    lastFailureAt: asText(value.lastFailureAt) || null,
    nextCheckAt: asText(value.nextCheckAt) || null,
    note: asText(value.note) || null,
  };
}

function normalizeExistingVercelBinding(value: any): ProjectVercelBinding | null {
  if (!value || typeof value !== "object") return null;
  const projectName = asText(value.projectName || value.vercelProjectName);
  if (!projectName) return null;
  return {
    provider: "vercel",
    projectId: asText(value.projectId) || null,
    projectName,
    teamId: asText(value.teamId) || null,
    teamSlug: asText(value.teamSlug),
    framework: normalizeVercelFramework(value.framework),
    rootDirectory: asText(value.rootDirectory) || "",
    target: normalizeVercelTarget(value.target),
    deployStatus: normalizeVercelDeployStatus(value.deployStatus),
    previewUrl: asText(value.previewUrl),
    productionUrl: asText(value.productionUrl),
    projectUrl: asText(value.projectUrl) || null,
    connectedAt: asText(value.connectedAt) || null,
    updatedAt: asText(value.updatedAt) || null,
    lastVerifiedAt: asText(value.lastVerifiedAt) || null,
    verificationStatus: asText(value.verificationStatus) || null,
    tokenConfigured: Boolean(value.tokenConfigured),
    linkedRepoId: asText(value.linkedRepoId) || null,
    linkedRepoType: asText(value.linkedRepoType) || null,
    lastDeploymentId: asText(value.lastDeploymentId) || null,
    lastDeploymentUrl: asText(value.lastDeploymentUrl) || null,
    lastDeploymentInspectorUrl: asText(value.lastDeploymentInspectorUrl) || null,
    lastDeploymentState: asText(value.lastDeploymentState) || null,
    lastDeploymentTarget:
      value.lastDeploymentTarget === "production"
        ? "production"
        : value.lastDeploymentTarget === "preview"
          ? "preview"
          : null,
    lastDeploymentRef: asText(value.lastDeploymentRef) || null,
    lastDeployRequestedAt: asText(value.lastDeployRequestedAt) || null,
    lastDeployReadyAt: asText(value.lastDeployReadyAt) || null,
    lastDeployError: asText(value.lastDeployError) || null,
    publishMachine: normalizeExistingVercelPublishMachine(value.publishMachine),
  };
}

function normalizeExistingVercelIntegration(value: any): ProjectVercelIntegration {
  return {
    binding: normalizeExistingVercelBinding(value?.binding),
    lastManifestExportedAt: asText(value?.lastManifestExportedAt) || null,
    lastDeploymentCheckedAt: asText(value?.lastDeploymentCheckedAt) || null,
    history: normalizeVercelHistory(value?.history),
  };
}

function buildBaseProjectIntegrations(): ProjectIntegrationsModel {
  return {
    github: {
      binding: null,
      versions: [],
      exports: [],
    },
    vercel: {
      binding: null,
      lastManifestExportedAt: null,
      lastDeploymentCheckedAt: null,
      history: [],
    },
  };
}

function normalizeExistingIntegrations(value: any): ProjectIntegrationsModel {
  const base = buildBaseProjectIntegrations();
  if (!value || typeof value !== "object") return base;
  return {
    github: normalizeExistingGitHubIntegration(value.github),
    vercel: normalizeExistingVercelIntegration(value.vercel),
  };
}

function mergeProjectIntegrations(
  current: ProjectIntegrationsModel,
  patch?: {
    github?: Partial<ProjectGitHubIntegration>;
    vercel?: Partial<ProjectVercelIntegration>;
  } | null
): ProjectIntegrationsModel {
  if (!patch || typeof patch !== "object") return current;

  const githubPatch = patch.github;
  const vercelPatch = patch.vercel;

  const nextGitHub = githubPatch
    ? normalizeExistingGitHubIntegration({
        ...current.github,
        ...githubPatch,
        binding: Object.prototype.hasOwnProperty.call(githubPatch, "binding")
          ? githubPatch.binding === null
            ? null
            : {
                ...(current.github.binding || {}),
                ...(githubPatch.binding || {}),
              }
          : current.github.binding,
        versions: Object.prototype.hasOwnProperty.call(githubPatch, "versions") ? githubPatch.versions : current.github.versions,
        exports: Object.prototype.hasOwnProperty.call(githubPatch, "exports") ? githubPatch.exports : current.github.exports,
      })
    : current.github;

  const nextVercel = vercelPatch
    ? normalizeExistingVercelIntegration({
        ...current.vercel,
        ...vercelPatch,
        binding: Object.prototype.hasOwnProperty.call(vercelPatch, "binding")
          ? vercelPatch.binding === null
            ? null
            : {
                ...(current.vercel.binding || {}),
                ...(vercelPatch.binding || {}),
              }
          : current.vercel.binding,
        history: Object.prototype.hasOwnProperty.call(vercelPatch, "history") ? vercelPatch.history : current.vercel.history,
      })
    : current.vercel;

  return {
    github: nextGitHub,
    vercel: nextVercel,
  };
}

export function ensureCanonicalProjectData(rawData: any, meta: ProjectMeta = {}): CanonicalProjectData {
  const baseData = rawData && typeof rawData === "object" ? rawData : {};
  const payload = parseLegacyProjectPayload(baseData);
  const existingSource = normalizeExistingSource(baseData.source);
  const source = existingSource || buildSourceFromPayload(payload, meta);
  const existingOutput = normalizeExistingOutput(baseData.output);
  const output = existingOutput || buildOutputFromPayload(baseData, meta);
  const existingDelivery = baseData.delivery && typeof baseData.delivery === "object" ? buildDeliveryModel(baseData.delivery) : null;
  const legacyEditorDelivery =
    baseData.editor && typeof baseData.editor === "object" && baseData.editor.delivery
      ? buildDeliveryModel({
          stage: baseData.editor.delivery.outputStage,
          exportTarget: baseData.editor.delivery.exportTarget,
          connectedStorage: baseData.editor.delivery.connectedStorage,
          mediaRetention: baseData.editor.delivery.mediaRetention,
          lastExportedAt: baseData.editor.delivery.lastExportedAt,
          lastPublishedAt: baseData.editor.delivery.lastPublishedAt,
          history: baseData.editor.delivery.history,
        })
      : null;
  const delivery = existingDelivery || legacyEditorDelivery || buildBaseDelivery();
  const integrations = normalizeExistingIntegrations(baseData.integrations);
  const deliverableBase = normalizeExistingDeliverable(baseData.deliverable) || null;
  const derivedDeliverable = buildDeliverableFromData(baseData, meta, source, output, delivery);
  const deliverable: ProjectDeliverableModel = {
    ...derivedDeliverable,
    ...deliverableBase,
    reviewStatus: normalizeReviewStatus(deliverableBase?.reviewStatus || derivedDeliverable.reviewStatus),
    primaryOutputId: deliverableBase?.primaryOutputId || derivedDeliverable.primaryOutputId,
    latestVersionId: deliverableBase?.latestVersionId || derivedDeliverable.latestVersionId,
    latestCheckpointId: deliverableBase?.latestCheckpointId || derivedDeliverable.latestCheckpointId,
  };

  return {
    ...baseData,
    schema: PROJECT_SCHEMA_VERSION,
    source,
    output,
    deliverable,
    delivery,
    integrations,
    editor: baseData.editor,
  };
}

export function mergeCanonicalProjectData(
  rawData: any,
  patch: {
    source?: Partial<ProjectSourceModel>;
    output?: Partial<ProjectOutputModel>;
    deliverable?: Partial<ProjectDeliverableModel>;
    delivery?: Partial<ProjectDeliveryModel>;
    integrations?: {
      github?: Partial<ProjectGitHubIntegration>;
      vercel?: Partial<ProjectVercelIntegration>;
    };
    editor?: any;
  } & Record<string, any>
): CanonicalProjectData {
  const current = ensureCanonicalProjectData(rawData);
  const nextSource = patch.source
    ? {
        ...current.source,
        ...patch.source,
        briefingFields: patch.source.briefingFields ? normalizeSourceFieldList(patch.source.briefingFields) : current.source.briefingFields,
        outputFields: patch.source.outputFields ? normalizeSourceFieldList(patch.source.outputFields) : current.source.outputFields,
      }
    : current.source;

  const nextOutput = patch.output
    ? buildOutputModel(
        Array.isArray(patch.output.assets) ? patch.output.assets : current.output.assets,
        (patch.output.primary as ProjectPrimaryOutput | null | undefined) ?? current.output.primary,
        patch.output.updatedAt ?? current.output.updatedAt
      )
    : current.output;

  const nextDelivery = patch.delivery
    ? buildDeliveryModel({
        ...current.delivery,
        ...patch.delivery,
      })
    : current.delivery;

  const nextIntegrations = patch.integrations
    ? mergeProjectIntegrations(current.integrations, patch.integrations)
    : current.integrations;

  const deliverablePatch: Partial<ProjectDeliverableModel> = patch.deliverable || {};
  const nextDeliverable: ProjectDeliverableModel = {
    ...current.deliverable,
    ...deliverablePatch,
    reviewStatus: normalizeReviewStatus(deliverablePatch.reviewStatus || current.deliverable.reviewStatus),
    primaryOutputId:
      (typeof deliverablePatch.primaryOutputId === "string" ? deliverablePatch.primaryOutputId : null) ||
      current.deliverable.primaryOutputId ||
      nextOutput.primary?.id ||
      null,
    latestVersionId:
      (typeof deliverablePatch.latestVersionId === "string" ? deliverablePatch.latestVersionId : null) ||
      current.deliverable.latestVersionId ||
      null,
    latestCheckpointId:
      (typeof deliverablePatch.latestCheckpointId === "string" ? deliverablePatch.latestCheckpointId : null) ||
      current.deliverable.latestCheckpointId ||
      null,
    nextAction: asText(deliverablePatch.nextAction) || current.deliverable.nextAction,
  };

  const next: CanonicalProjectData = {
    ...current,
    ...patch,
    schema: PROJECT_SCHEMA_VERSION,
    source: nextSource,
    output: nextOutput,
    deliverable: nextDeliverable,
    delivery: nextDelivery,
    integrations: nextIntegrations,
    editor: patch.editor !== undefined ? patch.editor : current.editor,
  };

  return next;
}

export function createEditorProjectData({ kind, title }: { kind: string; title?: string }): CanonicalProjectData {
  const source = buildBaseSource({ projectKind: kind, projectTitle: title });
  const output = buildOutputModel([], null, null);
  const delivery = buildBaseDelivery();
  return mergeCanonicalProjectData(
    {
      editor: buildBaseEditorState({
        docText: "",
        reviewStatus: "draft",
        delivery,
      }),
    },
    {
      source,
      output,
      delivery,
      deliverable: {
        label: editorKindLabel(kind),
        kind: editorKindLabel(kind),
        summary: source.summary,
        reviewStatus: "draft",
        primaryOutputId: null,
        latestVersionId: null,
        latestCheckpointId: null,
        nextAction: source.nextAction || "Comece a construir a primeira base do projeto no editor.",
      },
    }
  );
}

export function createCreatorPostProjectData(input: CreatorPostInput): CanonicalProjectData {
  const source = buildSourceFromPayload({ type: "creator_post", ...input }, { projectKind: "post" });
  const base = {
    type: "creator_post",
    ...input,
  };
  const output = buildOutputFromPayload(base, { projectKind: "post" });
  const delivery = buildBaseDelivery();
  return mergeCanonicalProjectData(
    {
      ...base,
      editor: buildBaseEditorState({
        docText: source.prefillText || "",
        reviewStatus: "draft",
        delivery,
      }),
    },
    {
      source,
      output: {
        ...output,
        updatedAt: new Date().toISOString(),
      },
      delivery,
      deliverable: {
        label: "Post principal",
        kind: "Post",
        summary: output.primary?.note || output.primary?.value || source.summary,
        reviewStatus: "draft",
        primaryOutputId: output.primary?.id || null,
        latestVersionId: null,
        latestCheckpointId: null,
        nextAction: source.nextAction || "Refine a legenda no editor, salve a primeira versao e registre a saida quando a peca estiver pronta.",
      },
    }
  );
}

export function createCreatorScriptsProjectData(input: CreatorScriptsInput): CanonicalProjectData {
  const source = buildSourceFromPayload({ type: "creator_scripts", ...input }, { projectKind: "script" });
  const base = {
    type: "creator_scripts",
    ...input,
  };
  const output = buildOutputFromPayload(base, { projectKind: "script" });
  const delivery = buildBaseDelivery();
  return mergeCanonicalProjectData(
    {
      ...base,
      editor: buildBaseEditorState({
        docText: source.prefillText || "",
        reviewStatus: "draft",
        delivery,
      }),
    },
    {
      source,
      output: {
        ...output,
        updatedAt: new Date().toISOString(),
      },
      delivery,
      deliverable: {
        label: "Roteiro principal",
        kind: "Roteiro",
        summary: output.primary?.note || output.primary?.value || source.summary,
        reviewStatus: "draft",
        primaryOutputId: output.primary?.id || null,
        latestVersionId: null,
        latestCheckpointId: null,
        nextAction: source.nextAction || "Abra a revisao editorial, salve um checkpoint e registre a saida so depois da leitura final.",
      },
    }
  );
}

export function createCreatorClipsProjectData(input: CreatorClipsInput): CanonicalProjectData {
  const source = buildSourceFromPayload({ type: "creator_clips", ...input }, { projectKind: "video" });
  const base = {
    type: "creator_clips",
    ...input,
  };
  const output = buildOutputFromPayload(base, { projectKind: "video" });
  const delivery = buildBaseDelivery();
  return mergeCanonicalProjectData(
    {
      ...base,
      editor: buildBaseEditorState({
        docText: source.prefillText || "",
        reviewStatus: "draft",
        delivery,
      }),
    },
    {
      source,
      output: {
        ...output,
        updatedAt: new Date().toISOString(),
      },
      delivery,
      deliverable: {
        label: "Clipe principal",
        kind: "Clipe",
        summary: output.primary?.note || output.primary?.value || source.summary,
        reviewStatus: "draft",
        primaryOutputId: output.primary?.id || null,
        latestVersionId: null,
        latestCheckpointId: null,
        nextAction: source.nextAction || "Acompanhe o job, revise o ativo no editor e registre a saida so quando o link final estiver pronto.",
      },
    }
  );
}

export function syncProjectDataFromEditor(rawData: any, input: SyncEditorStateInput): CanonicalProjectData {
  const now = input.updatedAt || new Date().toISOString();
  return mergeCanonicalProjectData(rawData, {
    editor: input.editor,
    source: input.source,
    output: buildOutputModel(input.outputAssets, input.primaryOutput, now),
    delivery: input.delivery,
    deliverable: {
      label: input.deliverable.label,
      kind: editorKindLabel(input.projectKind),
      summary: input.deliverable.summary,
      reviewStatus: input.deliverable.reviewStatus,
      primaryOutputId: input.primaryOutput?.id || null,
      latestVersionId: input.deliverable.latestVersionId || null,
      latestCheckpointId: input.deliverable.latestCheckpointId || null,
      nextAction: input.deliverable.nextAction,
    },
  });
}

export function outputStageLabel(stage: OutputStage): string {
  if (stage === "exported") return "Saída registrada";
  if (stage === "published") return "Publicado";
  return "Rascunho";
}

export function reviewStatusLabel(status: ReviewStatus): string {
  if (status === "review_ready") return "Pronto para revisao";
  if (status === "approved") return "Aprovado";
  if (status === "rework") return "Ajustes pendentes";
  return "Em edicao";
}

export function continuityStatusLabel(stage: OutputStage, status: ReviewStatus): string {
  if (stage === "published") return "Publicado";
  if (stage === "exported") return "Saída registrada";
  return reviewStatusLabel(status);
}

export function getCanonicalProjectSummary(rawData: any, meta: ProjectMeta = {}) {
  const data = ensureCanonicalProjectData(rawData, meta);
  return {
    source: data.source,
    output: data.output,
    deliverable: data.deliverable,
    delivery: data.delivery,
    integrations: data.integrations,
    outputStageLabel: outputStageLabel(data.delivery.stage),
    reviewStatusLabel: reviewStatusLabel(data.deliverable.reviewStatus),
    continuityStatusLabel: continuityStatusLabel(data.delivery.stage, data.deliverable.reviewStatus),
  };
}
