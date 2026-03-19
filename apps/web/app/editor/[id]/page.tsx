"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { EditorShell, EditorTab } from "../../../components/editor/EditorShell";
import { GitHubWorkspaceCard } from "../../../components/projects/GitHubWorkspaceCard";
import { VercelPublishCard } from "../../../components/projects/VercelPublishCard";
import { toUserFacingError, toUserFacingGenerationSuccess } from "../../../lib/uiFeedback";

type Project = { id: string; title: string; kind: string; data?: any };

type AiStep = { id: string; ts: string; title: string; details?: string };

type CreatorSnapshot = {
  source: string;
  summary: string;
  details: string;
  prefillText?: string;
};

type EditorVersion = {
  id: string;
  ts: string;
  title: string;
  summary: string;
  tab: EditorTab;
  charCount: number;
  deliverable: string;
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
  review: { factCheck: any | null };
  versions: EditorVersion[];
  delivery: { exportTarget: "device" | "connected_storage"; connectedStorage: string | null; mediaRetention: "externalized" };
};

const PROJECT_KIND_LABEL: Record<string, string> = {
  video: "Projeto de Vídeo",
  text: "Projeto de Texto",
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

function extractProjectPayload(payload: any): Project {
  const resolved = (payload?.item || payload?.data?.item || payload?.data || payload || null) as Project | null;
  if (!resolved?.id) {
    throw new Error("Projeto não encontrado para o editor.");
  }
  return resolved;
}

function ensureEditor(project: Project): EditorDoc {
  const d = (project.data || {}) as any;
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
    },
    versions: Array.isArray(e.versions) ? e.versions : [],
    delivery: {
      exportTarget: e.delivery?.exportTarget === "connected_storage" ? "connected_storage" : "device",
      connectedStorage: typeof e.delivery?.connectedStorage === "string" ? e.delivery.connectedStorage : null,
      mediaRetention: "externalized",
    }
  };
}

function parseCreatorProjectData(project: Project): any | null {
  const rawData = project.data;
  if (!rawData || typeof rawData !== "object") return null;

  if (typeof rawData.content === "string") {
    try {
      const parsed = JSON.parse(rawData.content);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      return {
        type: "legacy_content",
        raw_text: String(rawData.content || "").trim(),
      };
    }
  }

  if (
    rawData.type ||
    rawData.generated ||
    rawData.result ||
    rawData.projectName ||
    rawData.clipIdea
  ) {
    return rawData;
  }

  return null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function buildCreatorSnapshot(project: Project): CreatorSnapshot | null {
  const payload = parseCreatorProjectData(project);
  if (!payload || typeof payload !== "object") return null;

  if (payload.type === "creator_post") {
    const result = payload.result || {};
    const caption = String(result.caption || "").trim();
    const cta = String(result.cta || "").trim();
    const hashtags = normalizeStringList(result.hashtags).join(" ");
    const variations = normalizeStringList(result.variations);
    return {
      source: "Creator Post",
      summary: "Post salvo a partir de Creators com contexto pronto para continuidade.",
      details: [
        caption ? `Legenda\n${caption}` : "",
        hashtags ? `Hashtags\n${hashtags}` : "",
        cta ? `CTA\n${cta}` : "",
        variations.length ? `Variacoes\n- ${variations.join("\n- ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [caption, hashtags, cta ? `CTA: ${cta}` : ""].filter(Boolean).join("\n\n"),
    };
  }

  if (payload.type === "creator_music") {
    const result = payload.result || {};
    const lyrics = String(result.lyrics || "").trim();
    const audioUrl = String(result.audio_url || "").trim();
    return {
      source: "Creator Music",
      summary: "Trilha salva a partir de Creators com metadados e referencia de audio.",
      details: [
        result.title ? `Titulo\n${String(result.title).trim()}` : "",
        audioUrl ? `Audio\n${audioUrl}` : "",
        result.provider ? `Provedor\n${String(result.provider).trim()}` : "",
        lyrics ? `Letras / direcao\n${lyrics}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [
        result.title ? `Titulo: ${String(result.title).trim()}` : "",
        audioUrl ? `Audio: ${audioUrl}` : "",
        lyrics,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  if (payload.type === "creator_scripts") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const finalScript = String(structured.final_script || generated.raw_text || "").trim();
    return {
      source: "Creator Scripts",
      summary: "Roteiro salvo a partir de Creators para continuar refinando no editor.",
      details: [
        structured.title ? `Titulo\n${String(structured.title).trim()}` : "",
        finalScript ? `Roteiro final\n${finalScript}` : "",
        structured.cta ? `CTA\n${String(structured.cta).trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: finalScript,
    };
  }

  if (payload.type === "creator_ads") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const fullVersion = String(structured.full_version || generated.raw_text || "").trim();
    return {
      source: "Creator Ads",
      summary: "Peca de anuncio salva a partir de Creators com copy pronta para refinamento.",
      details: [
        structured.headline ? `Headline\n${String(structured.headline).trim()}` : "",
        fullVersion ? `Versao completa\n${fullVersion}` : "",
        structured.cta ? `CTA\n${String(structured.cta).trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: fullVersion,
    };
  }

  if (payload.type === "creator_clips") {
    const generated = payload.generated || {};
    const result = generated.result || {};
    const clipUrl = String(generated.clip_url || result?.output?.video_url || "").trim();
    return {
      source: "Creator Clips",
      summary: "Job de vídeo salvo a partir de Creators com status e referência do clipe.",
      details: [
        payload.clipIdea ? `Ideia do clipe\n${String(payload.clipIdea).trim()}` : "",
        result.jobId ? `Job ID\n${String(result.jobId).trim()}` : "",
        result.status ? `Status\n${String(result.status).trim()}` : "",
        clipUrl ? `URL do vídeo\n${clipUrl}` : "",
        generated.prompt_used ? `Prompt usado\n${String(generated.prompt_used).trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [
        payload.clipIdea ? `Ideia: ${String(payload.clipIdea).trim()}` : "",
        clipUrl ? `Video: ${clipUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  if (payload.type === "creator_no_code") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const overview = String(structured.product_overview || generated.raw_text || "").trim();
    const modules = normalizeStringList(structured.core_modules);
    return {
      source: "Creator No Code",
      summary: "Blueprint salvo a partir de Creators com estrutura inicial do produto.",
      details: [
        payload.projectName ? `Projeto\n${String(payload.projectName).trim()}` : "",
        overview ? `Visao do produto\n${overview}` : "",
        modules.length ? `Modulos principais\n- ${modules.join("\n- ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [payload.projectName ? `Projeto: ${String(payload.projectName).trim()}` : "", overview]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  if (payload.type === "legacy_content") {
    const rawText = String(payload.raw_text || "").trim();
    if (!rawText) return null;
    return {
      source: "Contexto importado",
      summary: "Projeto salvo antes da estrutura atual do editor.",
      details: rawText,
      prefillText: rawText,
    };
  }

  return null;
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
}: {
  tab: EditorTab;
  text: string;
  creatorSnapshot: CreatorSnapshot | null;
  projectKindLabel: string;
}): EditorVersion {
  const trimmed = String(text || "").trim();
  const charCount = trimmed.length;
  const titleByTab: Record<EditorTab, string> = {
    video: "Versão de vídeo",
    text: "Versão editorial",
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
    deliverable: trimmed ? "Pronto para revisar" : "Base salva",
  };
}

function buildProjectAssets({
  project,
  creatorSnapshot,
  text,
  factResult,
}: {
  project: Project | null;
  creatorSnapshot: CreatorSnapshot | null;
  text: string;
  factResult: any;
}): EditorAsset[] {
  const assets: EditorAsset[] = [];

  if (creatorSnapshot) {
    assets.push({
      id: "source-context",
      label: creatorSnapshot.source,
      type: "Contexto de origem",
      value: creatorSnapshot.summary,
      note: "Base importada para continuidade no editor.",
      state: "context",
    });
  }

  const payload = project ? parseCreatorProjectData(project) : null;
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
    assets.push({
      id: "clip-output",
      label: "Clipe gerado",
      type: "Vídeo",
      value: result.status ? `Status ${String(result.status)}` : "Job salvo no projeto",
      note: clipUrl ? "Link do clipe disponível para revisão." : "Acompanhe o job e consolide o link final antes de exportar.",
      url: clipUrl || null,
      state: clipUrl ? "ready" : "working",
    });
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

  return assets.slice(0, 6);
}

function buildDeliverableStages({
  creatorSnapshot,
  text,
  versions,
  factResult,
  exportTarget,
}: {
  creatorSnapshot: CreatorSnapshot | null;
  text: string;
  versions: EditorVersion[];
  factResult: any;
  exportTarget: "device" | "connected_storage";
}): DeliverableStage[] {
  const hasBase = Boolean(creatorSnapshot || String(text || "").trim());
  const hasRefinement = String(text || "").trim().length > 120;
  const hasReview = Boolean(factResult);
  const hasSavedVersion = versions.length > 0;

  return [
    {
      id: "generate",
      label: "Gerar",
      detail: hasBase ? "Base do projeto já entrou no editor com contexto real." : "Traga uma base de Creators ou escreva a primeira versão no editor.",
      status: hasBase ? "done" : "active",
    },
    {
      id: "refine",
      label: "Refinar",
      detail: hasRefinement ? "O material principal já tem corpo para revisão séria." : "Consolide o texto, vídeo ou fluxo principal antes de aprovar.",
      status: hasRefinement ? "done" : hasBase ? "active" : "pending",
    },
    {
      id: "approve",
      label: "Aprovar",
      detail: hasReview ? "Há uma checagem editorial salva no contexto do projeto." : "Use a Biblioteca IA para validar afirmações e registrar a revisão.",
      status: hasReview ? "done" : hasRefinement ? "active" : "pending",
    },
    {
      id: "save",
      label: "Salvar",
      detail: hasSavedVersion ? `${versions.length} versão(ões) já registradas neste projeto.` : "Salve uma versão para travar um ponto de continuidade real.",
      status: hasSavedVersion ? "done" : hasRefinement ? "active" : "pending",
    },
    {
      id: "export",
      label: "Exportar",
      detail:
        exportTarget === "device"
          ? "Saída padrão atual: exported no dispositivo ao concluir o entregável. Published segue como etapa manual fora da plataforma."
          : "Fluxo preparado para storage conectado quando essa etapa estiver disponível.",
      status: hasSavedVersion ? "active" : "pending",
    },
  ];
}

export default function EditorProjectPage() {
  const params = useParams();
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
  const latestVersion = versions[0] || null;
  const outputAssets = useMemo(
    () => buildProjectAssets({ project, creatorSnapshot, text, factResult }),
    [creatorSnapshot, factResult, project, text]
  );
  const deliverableStages = useMemo(
    () =>
      buildDeliverableStages({
        creatorSnapshot,
        text,
        versions,
        factResult,
        exportTarget: editorState?.delivery.exportTarget || "device",
      }),
    [creatorSnapshot, editorState?.delivery.exportTarget, factResult, text, versions]
  );
  const documentMetrics = useMemo(() => {
    const trimmed = String(text || "").trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((item) => item.trim().length > 0).length : 0;
    return { chars: trimmed.length, words, paragraphs };
  }, [text]);
  const activeDeliverableLabel = useMemo(() => {
    const current = deliverableStages.find((item) => item.status === "active") || deliverableStages[deliverableStages.length - 1];
    return current?.label || "Refinar";
  }, [deliverableStages]);

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
      });
      const next: EditorDoc = {
        ...current,
        mode: { professor: professorMode, transparent: transparentMode },
        doc: { text },
        aiSteps,
        review: { factCheck: factResult || null },
        versions: [nextVersion, ...current.versions].slice(0, 12),
        delivery: current.delivery
      };

      const updated = await api.updateProject(project.id, {
        data: {
          ...(project.data || {}),
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
            delivery: next.delivery
          }
        }
      });

      const proj = extractProjectPayload(updated);
      setProject(proj);
      setSaveFeedback("Projeto salvo com segurança. Continue editando, abra em Projetos quando precisar e exporte ao concluir.");
      setAiSteps((current) => pushStep(current, "Projeto salvo", new Date().toLocaleString()));
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao salvar"));
    } finally {
      setSaving(false);
    }
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

      <EditorShell
        title={title}
        tab={tab}
        onTab={setTab}
        versionLabel={latestVersion ? `${latestVersion.title} · ${new Date(latestVersion.ts).toLocaleDateString("pt-BR")}` : "Salve a primeira versão"}
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
                  <strong>{saving ? "Salvando draft" : "Draft ativo"}</strong>
                </div>
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Versões</span>
                  <strong>{versions.length ? `${versions.length} registradas` : "Nenhuma versão salva"}</strong>
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
                  {saving ? "Salvando..." : "Salvar projeto"}
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
                <pre className="editor-shell-pre editor-shell-pre-compact">{creatorSnapshot.details}</pre>
              </section>
            ) : null}

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Assets e outputs</p>
                <h4>O que este projeto já entrega</h4>
                <p className="editor-shell-note">
                  Contexto importado, saídas geradas e validações ficam reunidos para separar o que ainda está em draft do que já está pronto para exportação.
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
                  <h3>Editor de Vídeo</h3>
                  <p className="editor-shell-note">
                    Base do fluxo pronta para continuidade. Aqui o vídeo deixa de ser só geração e passa a ter contexto, assets e entregável.
                  </p>
                </div>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Timeline preparada</strong>
                  <p className="editor-shell-note">Clipes, status do job e ativos visuais já ficam organizados para revisão, salvamento de versão e saída final.</p>
                </div>
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
                <p className="section-kicker">Versões salvas</p>
                <h4>Histórico de continuidade</h4>
                <p className="editor-shell-note">
                  Cada salvamento cria uma nova referência de trabalho para retomar, revisar ou exportar depois.
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
                    </div>
                    <p>{version.summary}</p>
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
                  O fluxo agora fecha aqui: draft no editor, exported via saída ou handoff beta e published apenas como etapa manual informada. Exportação padrão no dispositivo; GitHub e Vercel seguem como continuidade honesta desta fase.
                </p>
              </div>
              <div className="editor-shell-cta-group">
                <button className="btn-ea btn-primary btn-sm" onClick={save} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar nova versão"}
                </button>
                <button className="btn-ea btn-ghost btn-sm" onClick={() => setAiSteps([])}>
                  Limpar log
                </button>
              </div>
            </div>
            <GitHubWorkspaceCard
              variant="compact"
              project={project ? { id: project.id, title, kind: project.kind, data: project.data } : null}
            />
            <VercelPublishCard
              variant="compact"
              project={project ? { id: project.id, title, kind: project.kind } : null}
            />
          </div>
        }
      />
    </div>
  );
}


