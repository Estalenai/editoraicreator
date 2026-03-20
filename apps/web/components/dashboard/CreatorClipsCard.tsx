"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiFetch } from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import { createIdempotencyKey } from "../../lib/idempotencyKey";
import { runAutoPromptFlow } from "../../lib/autoPromptFlow";
import { usePromptPreferences } from "../../hooks/usePromptPreferences";
import { PremiumSelect } from "../ui/PremiumSelect";
import { CreatorPlannerPanel } from "./CreatorPlannerPanel";
import {
  describeAsyncJobStatus,
  extractApiErrorMessage,
  shouldAutoRefreshAsyncJob,
  toUserFacingError,
  toUserFacingGenerationSuccess,
} from "../../lib/uiFeedback";
import { createCreatorClipsProjectData } from "../../lib/projectModel";

type ClipResult = {
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

type Props = {
  walletCommon: number;
  onRefetch: () => Promise<void>;
};

const CLIP_STYLE_OPTIONS = ["Cinemático", "Moderno", "Dinâmico", "Minimalista", "Documental"];
const CLIP_TONE_OPTIONS = ["Energético", "Inspirador", "Profissional", "Casual", "Dramático"];
const CLIP_PLATFORM_OPTIONS = ["Instagram Reels", "TikTok", "YouTube Shorts", "YouTube", "LinkedIn"];
const CLIP_ASPECT_OPTIONS = ["9:16", "16:9", "1:1"] as const;
const CLIP_QUALITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
] as const;
type ClipQuality = (typeof CLIP_QUALITY_OPTIONS)[number]["value"];

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

function toSafeDuration(value: number): number {
  if (!Number.isFinite(value)) return 8;
  if (value < 4) return 4;
  if (value > 20) return 20;
  return Math.round(value);
}

function buildClipPrompt({
  clipIdea,
  visualStyle,
  tone,
  platform,
  objective,
  language,
  notes,
  durationSec,
  aspectRatio,
}: {
  clipIdea: string;
  visualStyle: string;
  tone: string;
  platform: string;
  objective: string;
  language: string;
  notes: string;
  durationSec: number;
  aspectRatio: string;
}) {
  return [
    "Você é um diretor criativo especializado em clipes curtos para redes sociais.",
    `Idioma: ${language}`,
    `Ideia central do clipe: ${clipIdea}`,
    `Estilo visual: ${visualStyle}`,
    `Tom: ${tone}`,
    `Plataforma de destino: ${platform}`,
    `Objetivo: ${objective}`,
    `Duração aproximada: ${durationSec} segundos`,
    `Formato do vídeo: ${aspectRatio}`,
    `Observações extras: ${notes || "Nenhuma"}`,
    "",
    "Crie um prompt final pronto para geração de vídeo com foco em clareza visual, ritmo e impacto.",
    "Inclua cenas, movimentos de câmera, atmosfera e elementos principais no mesmo texto.",
  ].join("\n");
}

function pickClipUrl(result: ClipResult | null): string {
  if (!result) return "";
  return (
    String(result?.output?.video_url || "").trim() ||
    String(result?.assets?.preview_url || "").trim() ||
    ""
  );
}

export function CreatorClipsCard({ walletCommon, onRefetch }: Props) {
  const router = useRouter();
  const [clipIdea, setClipIdea] = useState("");
  const [visualStyle, setVisualStyle] = useState("Cinemático");
  const [tone, setTone] = useState("Energético");
  const [platform, setPlatform] = useState("Instagram Reels");
  const [objective, setObjective] = useState("Aumentar engajamento");
  const [durationSec, setDurationSec] = useState<number>(8);
  const [aspectRatio, setAspectRatio] = useState<(typeof CLIP_ASPECT_OPTIONS)[number]>("9:16");
  const [quality, setQuality] = useState<ClipQuality>("medium");
  const [language, setLanguage] = useState("pt-BR");
  const [notes, setNotes] = useState("");

  const { promptEnabled, autoApply, updatePromptEnabled, updateAutoApply } = usePromptPreferences();

  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [inlinePromptOpen, setInlinePromptOpen] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [showPromptUsed, setShowPromptUsed] = useState(false);
  const [lastPromptUsed, setLastPromptUsed] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);

  const [clipResult, setClipResult] = useState<ClipResult | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [statusAutoRefreshCount, setStatusAutoRefreshCount] = useState(0);
  const [resultDirty, setResultDirty] = useState(false);

  const estimatedCommon = useMemo(() => 0, []);
  const hasCredits = walletCommon >= estimatedCommon;
  const isBusy = loadingPrompt || loadingApply || loadingStatus;
  const hasSavedProject = Boolean(savedProjectId);
  const needsProjectSync = Boolean(savedProjectId && resultDirty);
  const visualStyleSelectOptions = useMemo(
    () => CLIP_STYLE_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const toneSelectOptions = useMemo(
    () => CLIP_TONE_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const platformSelectOptions = useMemo(
    () => CLIP_PLATFORM_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const aspectRatioSelectOptions = useMemo(
    () => CLIP_ASPECT_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const qualitySelectOptions = useMemo(
    () => CLIP_QUALITY_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    []
  );
  const jobStatusUi = useMemo(
    () =>
      describeAsyncJobStatus({
        status: clipResult?.status,
        provider: clipResult?.provider,
        replay: Boolean(clipResult?.replay),
        hasResultUrl: Boolean(pickClipUrl(clipResult)),
      }),
    [clipResult]
  );
  const plannerSteps = useMemo(
    () => [
      promptEnabled && !autoApply
        ? "Gerar e revisar o prompt final antes de iniciar o job do clipe."
        : "Usar o briefing atual para iniciar o job visual com o menor atrito possível.",
      "Criar o job assíncrono com formato, duração, qualidade e direção visual já definidos.",
      "Acompanhar o status do provedor até existir um link final ou uma prévia utilizável.",
      "Salvar o job no projeto e levar o ativo para o editor com continuidade clara.",
      "Registrar exported e published só quando a saída visual realmente estiver pronta.",
    ],
    [autoApply, promptEnabled]
  );
  const plannerSettings = useMemo(
    () => [
      { label: "Estilo visual", value: visualStyle },
      { label: "Tom", value: tone },
      { label: "Plataforma", value: platform },
      { label: "Formato", value: aspectRatio },
      { label: "Qualidade", value: quality.toUpperCase() },
      { label: "Idioma", value: language },
    ],
    [aspectRatio, language, platform, quality, tone, visualStyle]
  );
  const plannerParameters = useMemo(
    () => [
      { label: "Ideia", value: clipIdea.trim() || "A definir" },
      { label: "Objetivo", value: objective.trim() || "A definir" },
      { label: "Duração", value: `${toSafeDuration(durationSec)}s` },
      { label: "Prompt automático", value: promptEnabled ? "Ligado" : "Direto" },
      { label: "Aplicação", value: promptEnabled ? (autoApply ? "Automática" : "Manual") : "Briefing direto" },
      { label: "Estimativa", value: estimatedCommon > 0 ? `${estimatedCommon} Comum` : "Custo final após o job" },
    ],
    [autoApply, clipIdea, durationSec, estimatedCommon, objective, promptEnabled]
  );
  const clipUrl = useMemo(() => pickClipUrl(clipResult), [clipResult]);
  const resultSourceNote = useMemo(() => {
    if (clipResult?.replay || clipResult?.provider === "replay") {
      return {
        tone: "warning" as const,
        text: "Este job reaproveitou uma execução recente com segurança. Acompanhe o status até o ativo final ficar pronto.",
      };
    }
    if (clipResult?.provider === "mock") {
      return {
        tone: "warning" as const,
        text: "Clipe entregue em modo beta manual. Revise antes de tratar esta saída como publicação final.",
      };
    }
    if (clipResult?.provider) {
      return {
        tone: "success" as const,
        text: `Job enviado via ${clipResult.provider}${clipResult.model ? ` · ${clipResult.model}` : ""}.`,
      };
    }
    return null;
  }, [clipResult?.model, clipResult?.provider, clipResult?.replay]);
  const resultSummary = useMemo(
    () => [
      {
        label: "Status do job",
        value: jobStatusUi.label,
      },
      {
        label: "Saída visual",
        value: clipUrl ? "Prévia ou link final disponível" : "Ativo final ainda em processamento",
      },
      {
        label: "Estado do projeto",
        value: hasSavedProject && !needsProjectSync ? "Pronto para abrir no editor" : "Salvar no projeto",
      },
      {
        label: "Próxima ação",
        value: clipUrl ? "Revisar o clipe e registrar exported" : "Salvar o job e acompanhar o retorno final",
      },
    ],
    [clipUrl, hasSavedProject, jobStatusUi.label, needsProjectSync]
  );
  const primaryEditorCtaLabel = useMemo(() => {
    if (!savedProjectId) {
      return clipUrl ? "Salvar e abrir no Editor" : "Salvar job e abrir no Editor";
    }
    if (needsProjectSync) {
      return clipUrl ? "Atualizar projeto e abrir no Editor" : "Atualizar job e abrir no Editor";
    }
    return "Abrir no Editor";
  }, [clipUrl, needsProjectSync, savedProjectId]);

  useEffect(() => {
    setStatusAutoRefreshCount(0);
  }, [clipResult?.jobId]);

  function openPlanner() {
    if (!clipIdea.trim() || !objective.trim() || loadingPrompt || loadingApply || !hasCredits) return;
    setPlannerOpen(true);
    setError(null);
    setSuccess(null);
    window.requestAnimationFrame(() => {
      document.getElementById("creator-clips-planner")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function editPlanner() {
    setPlannerOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("creator-clips-config")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function copyText(value: string, label: string) {
    setCopyMsg(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopyMsg(`${label} copiado.`);
      setTimeout(() => setCopyMsg(null), 2000);
    } catch {
      setCopyMsg("Falha ao copiar. Tente manualmente.");
    }
  }

  async function generatePromptOnly(): Promise<string> {
    return buildClipPrompt({
      clipIdea,
      visualStyle,
      tone,
      platform,
      objective,
      language,
      notes,
      durationSec: toSafeDuration(durationSec),
      aspectRatio,
    });
  }

  async function applyFinalPrompt(finalPrompt: string) {
    setLoadingApply(true);
    setError(null);
    setSuccess(null);
    setCopyMsg(null);
    setSaveMsg(null);
    setClipResult(null);
    setResultDirty(false);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await apiFetch("/api/ai/video-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createIdempotencyKey("creator_clips_generate"),
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          durationSec: toSafeDuration(durationSec),
          aspectRatio,
          quality,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(payload, "Falha ao gerar clipe."));
      }

      setClipResult(payload || {});
      setStatusAutoRefreshCount(0);
      setResultDirty(Boolean(savedProjectId));
      setSuccess(
        toUserFacingGenerationSuccess({
          provider: typeof payload?.provider === "string" ? payload.provider : null,
          model: typeof payload?.model === "string" ? payload.model : null,
          replay: Boolean(payload?.replay),
          defaultMessage: pickClipUrl(payload || {}) ? "Clipe disponível para revisar." : "Job criado com sucesso. Atualize o status para acompanhar o clipe.",
          mockMessage: "Clipe entregue em modo beta manual. Revise antes de tratar este ativo como saída final.",
          replayMessage: "Este job já estava em processamento. Atualize o status para acompanhar o retorno final.",
        })
      );
      setLastPromptUsed(
        typeof payload?.used_prompt === "string" && payload.used_prompt.trim()
          ? payload.used_prompt.trim()
          : finalPrompt
      );
      if (savedProjectId) {
        setSaveMsg("Novo estado do clipe disponível. Atualize o projeto salvo antes de abrir ou publicar.");
      }
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar clipe.");
    } finally {
      setLoadingApply(false);
    }
  }

  const refreshClipStatus = useCallback(async () => {
    const jobId = String(clipResult?.jobId || "").trim();
    if (!jobId) return;

    setLoadingStatus(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await apiFetch("/api/ai/video-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createIdempotencyKey("creator_clips_status"),
        },
        body: JSON.stringify({ jobId }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(payload, "Falha ao consultar status do clipe."));
      }

      const nextResult = {
        ...(clipResult || {}),
        ...(payload || {}),
      };
      setClipResult(nextResult);
      setResultDirty(Boolean(savedProjectId));
      if (!shouldAutoRefreshAsyncJob(nextResult.status)) {
        setStatusAutoRefreshCount(0);
      }
      setSuccess(
        pickClipUrl(nextResult)
          ? toUserFacingGenerationSuccess({
              provider: typeof nextResult?.provider === "string" ? nextResult.provider : null,
              model: typeof nextResult?.model === "string" ? nextResult.model : null,
              replay: Boolean(nextResult?.replay),
              defaultMessage: "Clipe atualizado e pronto para revisar.",
              mockMessage: "Clipe entregue em modo beta manual. Revise antes de tratar este ativo como saída final.",
              replayMessage: "Este job já estava em processamento. Atualize o status para acompanhar o retorno final.",
            })
          : "Status atualizado. O clipe ainda está sendo processado."
      );
      if (savedProjectId) {
        setSaveMsg(
          pickClipUrl(nextResult)
            ? "O ativo visual foi atualizado. Sincronize o projeto salvo antes de registrar exported ou published."
            : "O status do job mudou. Atualize o projeto salvo para manter o editor no mesmo estado do clipe."
        );
      }
    } catch (e: any) {
      setError(e?.message || "Falha ao consultar status do clipe.");
    } finally {
      setLoadingStatus(false);
    }
  }, [clipResult, savedProjectId]);

  useEffect(() => {
    if (!clipResult?.jobId || loadingStatus) return;
    if (!shouldAutoRefreshAsyncJob(clipResult.status)) return;
    if (statusAutoRefreshCount >= 3) return;

    const timer = window.setTimeout(() => {
      setStatusAutoRefreshCount((current) => current + 1);
      void refreshClipStatus();
    }, 7000 + statusAutoRefreshCount * 2000);

    return () => window.clearTimeout(timer);
  }, [clipResult?.jobId, clipResult?.status, loadingStatus, refreshClipStatus, statusAutoRefreshCount]);

  async function onGenerateFlow() {
    if (!clipIdea.trim() || !objective.trim() || loadingPrompt || loadingApply) return;
    if (!hasCredits) return;

    await runAutoPromptFlow({
      promptEnabled,
      autoApply,
      generatePrompt: generatePromptOnly,
      applyPrompt: applyFinalPrompt,
      showPromptEditor: (promptText) => {
        setGeneratedPrompt(promptText);
        setInlinePromptOpen(true);
      },
      onPromptUsed: (promptText) => setLastPromptUsed(promptText),
      buildManualPrompt: () =>
        buildClipPrompt({
          clipIdea,
          visualStyle,
          tone,
          platform,
          objective,
          language,
          notes,
          durationSec: toSafeDuration(durationSec),
          aspectRatio,
        }),
      setLoadingPrompt,
      setError,
      onStart: () => {
        setInlinePromptOpen(false);
        setGeneratedPrompt("");
        setShowPromptUsed(false);
        setLastPromptUsed(null);
        setSuccess(null);
        setSaveMsg(null);
        setPlannerOpen(false);
        setResultDirty(false);
      },
    });
  }

  async function persistProject(openEditorAfterSave = false) {
    if (savingProject || !clipResult) return;

    setSavingProject(true);
    setError(null);
    setSuccess(null);
    setSaveMsg(null);

    try {
      const ideaSnippet = clipIdea.trim().slice(0, 60) || "clipe";
      const payload = createCreatorClipsProjectData({
        clipIdea,
        visualStyle,
        tone,
        platform,
        objective,
        durationSec: toSafeDuration(durationSec),
        aspectRatio,
        quality,
        language,
        notes,
        generated: {
          prompt_used: lastPromptUsed || undefined,
          result: clipResult,
          clip_url: pickClipUrl(clipResult),
        },
      });

      const created = savedProjectId
        ? await api.updateProject(savedProjectId, {
            title: `Creator Clips - ${ideaSnippet}`,
            kind: "video",
            data: payload,
          })
        : await api.createProject({
            title: `Creator Clips - ${ideaSnippet}`,
            kind: "video",
            data: payload,
          });

      const projectId = String(created?.item?.id || created?.id || savedProjectId || "").trim();
      setSavedProjectId(projectId || null);
      setResultDirty(false);
      setSaveMsg(
        openEditorAfterSave
          ? clipUrl
            ? "Projeto sincronizado. Abrindo o editor com o clipe pronto para revisão visual e saída."
            : "Job sincronizado. Abrindo o editor para acompanhar o clipe e consolidar a saída final."
          : savedProjectId
            ? "Projeto atualizado com segurança. O editor vai receber o estado mais recente deste clipe."
            : clipUrl
              ? "Projeto salvo com segurança. O clipe já está pronto para continuar no editor."
              : "Projeto salvo com segurança. O job do clipe agora segue com continuidade real no editor."
      );
      await onRefetch();
      if (openEditorAfterSave && projectId) {
        router.push(`/editor/${projectId}?source=creator_clips&handoff=saved`);
      }
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar clipe em projeto.");
    } finally {
      setSavingProject(false);
    }
  }

  return (
    <div className="creator-workspace-card creator-workspace-card-modular creator-workspace-module">
      <div className="creator-workspace-header">
        <div className="hero-title-stack section-stack-tight">
          <p className="section-kicker">Briefing visual</p>
          <h3 className="heading-reset">Creator Clips</h3>
        </div>
        <p className="creator-workspace-subtitle">
          Estruture a ideia, gere o job assíncrono e acompanhe o status do clipe com clareza operacional.
        </p>
      </div>

      <div className="creator-workspace-zones">
      <div className="creator-form-zone" id="creator-clips-config">
        <p className="creator-zone-title">Como deseja gerar</p>
        <p className="creator-zone-copy">Defina ideia, estilo, canal e qualidade antes de iniciar o job.</p>
        <div className="form-grid-2 creator-field-grid">
        <label className="field-label-ea">
          <span>Tema/ideia do clipe</span>
          <input
            value={clipIdea}
            onChange={(e) => setClipIdea(e.target.value)}
            placeholder="Ex.: clipe urbano noturno com energia alta"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Estilo visual</span>
          <PremiumSelect
            value={visualStyle}
            onChange={setVisualStyle}
            options={visualStyleSelectOptions}
            ariaLabel="Estilo visual do clipe"
          />
        </label>

        <label className="field-label-ea">
          <span>Tom</span>
          <PremiumSelect
            value={tone}
            onChange={setTone}
            options={toneSelectOptions}
            ariaLabel="Tom do clipe"
          />
        </label>

        <label className="field-label-ea">
          <span>Plataforma de destino</span>
          <PremiumSelect
            value={platform}
            onChange={setPlatform}
            options={platformSelectOptions}
            ariaLabel="Plataforma de destino do clipe"
          />
        </label>

        <label className="field-label-ea">
          <span>Objetivo</span>
          <input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Ex.: reter atenção e gerar compartilhamentos"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Duração (4 a 20s)</span>
          <input
            type="number"
            min={4}
            max={20}
            value={durationSec}
            onChange={(e) => setDurationSec(Number(e.target.value || 8))}
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Formato</span>
          <PremiumSelect
            value={aspectRatio}
            onChange={(next) => setAspectRatio(next as (typeof CLIP_ASPECT_OPTIONS)[number])}
            options={aspectRatioSelectOptions}
            ariaLabel="Formato do vídeo"
          />
        </label>

        <label className="field-label-ea">
          <span>Qualidade</span>
          <PremiumSelect
            value={quality}
            onChange={(next) => setQuality(next as ClipQuality)}
            options={qualitySelectOptions}
            ariaLabel="Qualidade do clipe"
          />
        </label>

        <label className="field-label-ea">
          <span>Idioma</span>
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="field-ea"
          />
        </label>
        </div>
      </div>

      <div className="creator-form-zone">
        <p className="creator-zone-title">Contexto e observações</p>
        <p className="creator-zone-copy">Use observações para orientar câmera, transições e restrições visuais.</p>
        <label className="field-label-ea">
        <span>Observações</span>
        <textarea
          className="field-ea creator-prompt-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex.: câmera em movimento, transições rápidas, sem texto na tela"
          rows={4}
        />
      </label>
      </div>

      <div className="creator-context-zone">
        <p className="creator-zone-title">Prompt e previsibilidade</p>
        <p className="creator-zone-copy">Revise o prompt antes da geração ou deixe a IA aplicar automaticamente.</p>
        <div className="creator-section-label">Prompt Automático</div>
        <div className="creator-toggle-stack">
        <label className="toggle-row" data-active={promptEnabled}>
          <input
            type="checkbox"
            checked={promptEnabled}
            onChange={async (e) => {
              await updatePromptEnabled(e.target.checked);
            }}
          />
          <span>Usar Prompt Automático</span>
        </label>
        <label className="toggle-row" data-active={promptEnabled && autoApply} data-disabled={!promptEnabled}>
          <input
            type="checkbox"
            checked={autoApply}
            disabled={!promptEnabled}
            onChange={async (e) => {
              await updateAutoApply(e.target.checked);
            }}
          />
          <span>Auto aplicar prompt</span>
        </label>
        </div>
        <div className="helper-note-inline">
          {estimatedCommon > 0
            ? `Estimativa de consumo inicial: ~${estimatedCommon} Comum.`
            : "Estimativa de consumo inicial disponível após o processamento do vídeo."}{" "}
          O custo final pode variar conforme o job. O consumo real aparece em Créditos {'>'} Histórico.
        </div>
      </div>

      <div className="creator-planner-field-grid creator-clips-journey-grid">
        <div className="creator-planner-field">
          <span>Saída esperada</span>
          <strong>Job visual com preview ou link final pronto para revisão, continuidade e handoff.</strong>
        </div>
        <div className="creator-planner-field">
          <span>Encerramento do fluxo</span>
          <strong>Salvar no projeto, abrir o editor, revisar o ativo visual e registrar exported ou published com clareza.</strong>
        </div>
      </div>

      <div className="creator-actions-row">
        <div className="creator-action-buttons">
        <button
          className={`btn-ea btn-primary ${isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits ? "creator-button-busy" : ""}`}
          onClick={openPlanner}
          disabled={isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits}
        >
          {loadingApply ? "Gerando..." : clipResult ? "Gerar nova versão" : "Revisar plano e gerar"}
        </button>

        {clipResult?.jobId && (
          <button className="btn-ea btn-secondary" onClick={refreshClipStatus} disabled={loadingStatus}>
            {loadingStatus ? "Atualizando..." : "Atualizar status"}
          </button>
        )}
        {clipResult ? (
          <button
            className={`btn-ea btn-secondary ${isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits ? "creator-button-busy-soft" : ""}`}
            onClick={openPlanner}
            disabled={isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits}
          >
            Ajustar plano
          </button>
        ) : null}
        </div>

        {(error || success || copyMsg || saveMsg) ? (
          <div className="creator-feedback-stack">
            {error ? (
          <div className="state-ea state-ea-error">
            <p className="state-ea-title">Falha no processamento do clipe</p>
            <div className="state-ea-text">{toUserFacingError(error, "Tente novamente ou atualize o status do job.")}</div>
          </div>
            ) : null}
        {success ? (
          <div className={`state-ea ${clipResult?.provider === "mock" || clipResult?.provider === "replay" || clipResult?.replay ? "state-ea-warning" : "state-ea-success"}`}>
            <p className="state-ea-title">Atualização da geração</p>
            <div className="state-ea-text">{success}</div>
          </div>
        ) : null}
        {copyMsg ? <div className="creator-feedback-note">{copyMsg}</div> : null}
        {saveMsg ? <div className="creator-feedback-note">{saveMsg}</div> : null}
          </div>
        ) : null}
      </div>

      {plannerOpen ? (
        <div id="creator-clips-planner">
          <CreatorPlannerPanel
            title="Plano pronto para o Creator Clips"
            objective={`Gerar clipe em ${aspectRatio} com foco em ${objective.toLowerCase()} e linguagem ${tone.toLowerCase()}.`}
            summary="Você revisa briefing, etapas, qualidade e parâmetros principais antes de iniciar o job visual."
            steps={plannerSteps}
            settings={plannerSettings}
            parameters={plannerParameters}
            note="Se o prompt automático estiver em modo manual, o job só executa depois da sua revisão final do prompt."
            continueLabel="Continuar com o clipe"
            busy={isBusy}
            onContinue={() => {
              setPlannerOpen(false);
              void onGenerateFlow();
            }}
            onEdit={editPlanner}
            onCancel={() => setPlannerOpen(false)}
          />
        </div>
      ) : null}

      {isBusy ? (
        <div className="creator-loading-panel creator-workspace-note">
          <div className="helper-note-inline">Processando o job visual e preparando o retorno do provedor com status legível...</div>
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "36%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "82%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "58%" }} />
        </div>
      ) : null}

      {!clipResult && !isBusy && !plannerOpen ? (
        <div className="state-ea creator-empty-state">
          <p className="state-ea-title">Nenhum clipe gerado ainda</p>
          <div className="state-ea-text">
            Preencha ideia e objetivo, revise o planner e inicie o job. Depois acompanhe o status e leve o ativo para o editor com continuidade clara.
          </div>
          <div className="state-ea-actions">
            <button
              className="btn-ea btn-primary btn-sm"
              onClick={openPlanner}
              disabled={isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits}
            >
              Revisar plano e gerar
            </button>
            <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
              Ver projetos
            </Link>
          </div>
        </div>
      ) : null}

      {inlinePromptOpen && promptEnabled && !autoApply && (
        <div className="creator-inline-panel">
          <div className="creator-inline-panel-header">
            <strong>Prompt gerado</strong>
            <p>Revise e aplique o prompt antes de iniciar o job final.</p>
          </div>
          <textarea
            className="field-ea creator-prompt-textarea"
            value={generatedPrompt}
            onChange={(e) => setGeneratedPrompt(e.target.value)}
            rows={8}
          />
          <div className="creator-inline-actions">
            <button
              className="btn-ea btn-ghost btn-sm creator-inline-action-soft"
              onClick={() => copyText(generatedPrompt, "Prompt")}
            >
              Copiar prompt
            </button>
            <button
              className="btn-ea btn-primary btn-sm"
              onClick={async () => {
                if (!generatedPrompt.trim()) return;
                setInlinePromptOpen(false);
                setLastPromptUsed(generatedPrompt);
                await applyFinalPrompt(generatedPrompt);
              }}
              disabled={loadingApply || !generatedPrompt.trim()}
            >
              {loadingApply ? "Aplicando..." : "Aplicar prompt"}
            </button>
            <button
              className="btn-ea btn-ghost btn-sm creator-inline-action-muted"
              onClick={() => {
                setInlinePromptOpen(false);
                setGeneratedPrompt("");
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {lastPromptUsed && (
        <div className="creator-inline-panel">
          <button
            className="btn-ea btn-ghost btn-sm creator-inline-action-soft"
            onClick={() => setShowPromptUsed((value) => !value)}
          >
            {showPromptUsed ? "Ocultar prompt usado (avançado)" : "Mostrar prompt usado (avançado)"}
          </button>

          {showPromptUsed && (
            <div className="creator-result-stack">
              <textarea
                className="field-ea creator-prompt-textarea"
                value={lastPromptUsed}
                onChange={(e) => setLastPromptUsed(e.target.value)}
                rows={8}
              />
              <div className="creator-inline-actions">
                <button
                  className="btn-ea btn-ghost btn-sm"
                  onClick={() => copyText(lastPromptUsed, "Prompt usado")}
                >
                  Copiar prompt usado
                </button>
                <button
                  onClick={async () => {
                    if (!lastPromptUsed.trim()) return;
                    await applyFinalPrompt(lastPromptUsed);
                  }}
                  disabled={loadingApply || !lastPromptUsed.trim()}
                  className="btn-ea btn-secondary btn-sm creator-inline-action-soft"
                >
                  {loadingApply ? "Gerando..." : "Editar e gerar novamente"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {clipResult && (
        <div className="creator-result-stack">
          <div className="creator-result-header">
            <p className="section-kicker">Resultado</p>
            <div className="creator-result-title">Job registrado e pronto para acompanhamento</div>
            <p className="creator-result-copy">Acompanhe o status do clipe, entenda quando o ativo ficou pronto e siga para o editor com o job sincronizado no projeto.</p>
            {resultSourceNote ? (
              <div className={resultSourceNote.tone === "warning" ? "inline-alert inline-alert-warning" : "helper-note-inline"}>
                {resultSourceNote.text}
              </div>
            ) : null}
          </div>

          {(jobStatusUi.isPending || jobStatusUi.tone === "error") ? (
            <div className={`state-ea ${jobStatusUi.tone === "error" ? "state-ea-error" : "state-ea-warning"}`}>
              <p className="state-ea-title">{jobStatusUi.label}</p>
              <div className="state-ea-text">
                {jobStatusUi.detail}
                {jobStatusUi.isPending && statusAutoRefreshCount > 0 ? ` Atualização automática ${statusAutoRefreshCount}/3 em andamento.` : ""}
              </div>
            </div>
          ) : null}

          <div className="creator-planner-field-grid creator-clips-result-summary-grid">
            {resultSummary.map((item) => (
              <div key={item.label} className="creator-planner-field">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="creator-output-grid">
          <div className="creator-output-card">
            <div className="creator-output-card-title">Status do job</div>
            <div className="creator-output-card-stat-row"><span>Job ID</span><strong>{String(clipResult.jobId || "—")}</strong></div>
            <div className="creator-output-card-stat-row"><span>Status</span><strong>{jobStatusUi.label}</strong></div>
            <div className="creator-output-card-stat-row"><span>Provedor</span><strong>{String(clipResult.provider || "—")}</strong></div>
            <div className="creator-output-card-stat-row"><span>Modelo</span><strong>{String(clipResult.model || "—")}</strong></div>
            {clipResult.replay ? <div className="creator-output-card-meta">Replay: sim</div> : null}
            {Number.isFinite(Number(clipResult.estimated_seconds)) ? (
              <div className="creator-output-card-meta">Tempo estimado: {Number(clipResult.estimated_seconds)}s</div>
            ) : null}
          </div>

          {clipUrl ? (
            <div className="creator-output-card">
              <div className="creator-output-card-title">Resultado</div>
              <a href={clipUrl} target="_blank" rel="noreferrer" className="creator-output-card-link">
                {clipUrl}
              </a>
              <div className="creator-output-card-actions">
                <button className="btn-ea btn-ghost btn-sm" onClick={() => copyText(clipUrl, "Link do clipe")}>
                  Copiar link
                </button>
              </div>
            </div>
          ) : (
            <div className="creator-output-card">
              <div className="creator-output-card-title">Resultado em andamento</div>
              <div className="creator-output-card-meta">
              {jobStatusUi.detail}
              </div>
            </div>
          )}

          <div className="postgen-panel creator-next-step-panel">
            <div className="postgen-title">Próximos passos</div>
            <div className="creator-next-step-copy">
              {clipUrl
                ? "Fluxo recomendado: revisar o ativo → salvar no projeto → abrir no editor → salvar checkpoint → registrar exported → confirmar published."
                : "Fluxo recomendado: acompanhar o job → salvar no projeto → abrir no editor → manter o estado do ativo sincronizado até o link final."}
            </div>
            {hasSavedProject && !needsProjectSync ? (
              <div className="creator-feedback-note creator-feedback-note-muted">
                Projeto sincronizado. O editor vai receber o job, o link do clipe e o estado de saída preservados para revisão visual.
              </div>
            ) : null}
            <div className="postgen-actions">
              <button
                className="btn-ea btn-secondary btn-sm"
                onClick={refreshClipStatus}
                disabled={loadingStatus || !clipResult?.jobId}
              >
                {loadingStatus ? "Atualizando..." : "Atualizar status"}
              </button>
              {clipUrl && (
                <button className="btn-ea btn-ghost btn-sm" onClick={() => copyText(clipUrl, "Link do clipe")}>
                  Copiar link
                </button>
              )}
              <button
                className="btn-ea btn-primary btn-sm"
                onClick={() => {
                  if (savedProjectId && !needsProjectSync) {
                    router.push(`/editor/${savedProjectId}?source=creator_clips&handoff=saved`);
                    return;
                  }
                  void persistProject(true);
                }}
                disabled={savingProject}
              >
                {savingProject ? "Sincronizando..." : primaryEditorCtaLabel}
              </button>
              {!hasSavedProject || needsProjectSync ? (
                <button className="btn-ea btn-secondary btn-sm" onClick={() => void persistProject(false)} disabled={savingProject}>
                  {savingProject ? "Salvando..." : savedProjectId ? "Atualizar projeto salvo" : "Salvar projeto"}
                </button>
              ) : null}
              <button
                className="btn-ea btn-ghost btn-sm"
                onClick={openPlanner}
                disabled={isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits}
              >
                Ajustar plano
              </button>
              <a href="/projects" className="btn-link-ea btn-ghost btn-sm">
                Ver em Projetos
              </a>
            </div>
          </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}




