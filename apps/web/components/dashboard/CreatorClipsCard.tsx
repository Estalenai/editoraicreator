"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, apiFetch } from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import { createIdempotencyKey } from "../../lib/idempotencyKey";
import { runAutoPromptFlow } from "../../lib/autoPromptFlow";
import { usePromptPreferences } from "../../hooks/usePromptPreferences";
import { PremiumSelect } from "../ui/PremiumSelect";
import { toUserFacingError, toUserFacingGenerationSuccess } from "../../lib/uiFeedback";

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

  const [clipResult, setClipResult] = useState<ClipResult | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  const estimatedCommon = useMemo(() => 0, []);
  const hasCredits = walletCommon >= estimatedCommon;
  const isBusy = loadingPrompt || loadingApply || loadingStatus;
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
    setSavedProjectId(null);
    setClipResult(null);

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
        throw new Error(payload?.error || "Falha ao gerar clipe.");
      }

      setClipResult(payload || {});
      setSuccess(
        toUserFacingGenerationSuccess({
          provider: typeof payload?.provider === "string" ? payload.provider : null,
          model: typeof payload?.model === "string" ? payload.model : null,
          replay: Boolean(payload?.replay),
          defaultMessage: pickClipUrl(payload || {}) ? "Clipe disponível para revisar." : "Job criado com sucesso. Atualize o status para acompanhar o clipe.",
          mockMessage: "Clipe entregue em modo beta simulado. Ative o provedor real para publicação final.",
          replayMessage: "Este job já estava em processamento. Atualize o status para acompanhar o retorno final.",
        })
      );
      setLastPromptUsed(finalPrompt);
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar clipe.");
    } finally {
      setLoadingApply(false);
    }
  }

  async function refreshClipStatus() {
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
        throw new Error(payload?.error || "Falha ao consultar status do clipe.");
      }

      const nextResult = {
        ...(clipResult || {}),
        ...(payload || {}),
      };
      setClipResult(nextResult);
      setSuccess(
        pickClipUrl(nextResult)
          ? toUserFacingGenerationSuccess({
              provider: typeof nextResult?.provider === "string" ? nextResult.provider : null,
              model: typeof nextResult?.model === "string" ? nextResult.model : null,
              replay: Boolean(nextResult?.replay),
              defaultMessage: "Clipe atualizado e pronto para revisar.",
              mockMessage: "Clipe entregue em modo beta simulado. Ative o provedor real para publicação final.",
              replayMessage: "Este job já estava em processamento. Atualize o status para acompanhar o retorno final.",
            })
          : "Status atualizado. O clipe ainda está sendo processado."
      );
    } catch (e: any) {
      setError(e?.message || "Falha ao consultar status do clipe.");
    } finally {
      setLoadingStatus(false);
    }
  }

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
        setSavedProjectId(null);
      },
    });
  }

  async function onSaveProject() {
    if (savingProject || !clipResult) return;

    setSavingProject(true);
    setError(null);
    setSuccess(null);
    setSaveMsg(null);

    try {
      const ideaSnippet = clipIdea.trim().slice(0, 60) || "clipe";
      const payload = {
        type: "creator_clips",
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
          prompt_used: lastPromptUsed,
          result: clipResult,
          clip_url: pickClipUrl(clipResult),
        },
      };

      const created = await api.createProject({
        title: `Creator Clips - ${ideaSnippet}`,
        kind: "video",
        data: payload,
      });

      const projectId = String(created?.item?.id || created?.id || "").trim();
      setSavedProjectId(projectId || null);
      setSaveMsg("Projeto salvo com sucesso.");
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar clipe em projeto.");
    } finally {
      setSavingProject(false);
    }
  }

  const clipUrl = pickClipUrl(clipResult);

  return (
    <div className="premium-card creator-workspace-card creator-workspace-card-modular">
      <div className="creator-workspace-header">
        <div className="hero-title-stack section-stack-tight">
          <p className="section-kicker">O que você quer criar</p>
          <h3 className="heading-reset">Creator Clips</h3>
        </div>
        <p className="creator-workspace-subtitle">
          Estruture a ideia, gere o job assíncrono e acompanhe o status do clipe com clareza operacional.
        </p>
      </div>

      <div className="creator-workspace-zones">
      <div className="creator-form-zone">
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

      <div className="creator-actions-row">
        <div className="creator-action-buttons">
        <button
          className={`btn-ea btn-primary ${isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits ? "creator-button-busy" : ""}`}
          onClick={onGenerateFlow}
          disabled={isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits}
        >
          {loadingApply ? "Gerando..." : "Gerar clipe com IA"}
        </button>

        {clipResult?.jobId && (
          <button className="btn-ea btn-secondary" onClick={refreshClipStatus} disabled={loadingStatus}>
            {loadingStatus ? "Atualizando..." : "Atualizar status"}
          </button>
        )}
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
          <div className={`state-ea ${clipResult?.provider === "mock" || clipResult?.provider === "replay" ? "state-ea-warning" : "state-ea-success"}`}>
            <p className="state-ea-title">Atualização da geração</p>
            <div className="state-ea-text">{success}</div>
          </div>
        ) : null}
        {copyMsg ? <div className="creator-feedback-note">{copyMsg}</div> : null}
        {saveMsg ? <div className="creator-feedback-note">{saveMsg}</div> : null}
          </div>
        ) : null}
      </div>

      {isBusy ? (
        <div className="premium-card-soft creator-loading-panel">
          <div className="helper-note-inline">Processando o job e preparando o retorno do provedor...</div>
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "36%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "82%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "58%" }} />
        </div>
      ) : null}

      {!clipResult && !isBusy ? (
        <div className="state-ea creator-empty-state">
          <p className="state-ea-title">Nenhum clipe gerado ainda</p>
          <div className="state-ea-text">
            Preencha ideia e objetivo para iniciar o job. Depois acompanhe status e salve em projetos.
          </div>
          <div className="state-ea-actions">
            <button
              className="btn-ea btn-primary btn-sm"
              onClick={onGenerateFlow}
              disabled={isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits}
            >
              Gerar clipe
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
            <p className="creator-result-copy">Acompanhe o status do clipe, copie o link final e siga para o editor quando salvar o projeto.</p>
            {clipResult?.provider ? (
              <div className={clipResult.provider === "mock" ? "inline-alert inline-alert-warning" : "helper-note-inline"}>
                {clipResult.provider === "mock"
                  ? "Clipe entregue em modo beta simulado. Ative o provedor real para publicação final."
                  : clipResult.replay || clipResult.provider === "replay"
                    ? "Este job já estava em processamento. Atualize o status para acompanhar o retorno final."
                    : `Job enviado via ${clipResult.provider}${clipResult.model ? ` · ${clipResult.model}` : ""}.`}
              </div>
            ) : clipResult?.replay ? (
              <div className="helper-note-inline">Este job já estava em processamento. Atualize o status para acompanhar o retorno final.</div>
            ) : null}
          </div>

          <div className="creator-output-grid">
          <div className="creator-output-card">
            <div className="creator-output-card-title">Status do job</div>
            <div className="creator-output-card-stat-row"><span>Job ID</span><strong>{String(clipResult.jobId || "—")}</strong></div>
            <div className="creator-output-card-stat-row"><span>Status</span><strong>{String(clipResult.status || "—")}</strong></div>
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
              O clipe ainda está sendo processado. Atualize o status em instantes.
              </div>
            </div>
          )}

          <div className="postgen-panel creator-next-step-panel">
            <div className="postgen-title">Próximos passos</div>
            <div className="creator-next-step-copy">
              Fluxo recomendado: gerar → salvar projeto → continuar no editor.
            </div>
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
              <button className="btn-ea btn-secondary btn-sm" onClick={onSaveProject} disabled={savingProject}>
                {savingProject ? "Salvando..." : "Salvar projeto"}
              </button>
              <button
                className="btn-ea btn-ghost btn-sm"
                onClick={onGenerateFlow}
                disabled={isBusy || !clipIdea.trim() || !objective.trim() || !hasCredits}
              >
                Gerar novamente
              </button>
              <a href="/projects" className="btn-link-ea btn-ghost btn-sm">
                Ver em Projetos
              </a>
              {savedProjectId && (
                <a href={`/editor/${savedProjectId}`} className="btn-link-ea btn-primary btn-sm">
                  Continuar no Editor
                </a>
              )}
            </div>
          </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}




