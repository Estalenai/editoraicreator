"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { apiFetch } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotencyKey";
import { PremiumSelect } from "../ui/PremiumSelect";
import { toUserFacingError } from "../../lib/uiFeedback";

type CreatorMusicResult = {
  provider?: string;
  model?: string;
  status?: string;
  job_id?: string;
  preview_url?: string;
  type?: string;
  title?: string;
  prompt_used?: string;
  audio_url?: string;
  lyrics?: string;
  tags?: string[];
  duration?: number;
  bpm?: number;
  created_at?: string;
};

type Props = {
  walletCommon: number;
  onRefetch: () => Promise<void>;
};

const MOOD_OPTIONS = [
  { value: "energetico", label: "Energético" },
  { value: "inspirador", label: "Inspirador" },
  { value: "suave", label: "Suave" },
  { value: "intermediario", label: "Intermediária" },
];

function extractApiErrorMessage(payload: any, fallback: string) {
  const candidates = [payload?.message, payload?.detail, payload?.error, payload?.reason];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function buildMusicPrompt({ theme, mood, bpm, duration, language }: { theme: string; mood: string; bpm: number; duration: number; language: string }) {
  return `Crie uma musica no estilo ${theme}, humor ${mood}, ${bpm} BPM, duracao de ${duration} segundos em ${language}.`;
}

function normalizeMusicResult(payload: any, fallback: { theme: string; mood: string; bpm: number; duration: number; prompt: string }): CreatorMusicResult | null {
  const source = payload?.result && typeof payload.result === "object" ? payload.result : payload;
  if (!source || typeof source !== "object") return null;

  const audioUrl = String(source?.audio_url || payload?.output?.audio_url || "").trim();
  const previewUrl = String(source?.preview_url || payload?.assets?.preview_url || source?.assets?.preview_url || "").trim();
  const provider = String(source?.provider || payload?.provider || "").trim();
  const model = String(source?.model || payload?.model || "").trim();
  const jobId = String(source?.job_id || source?.jobId || payload?.jobId || "").trim();
  const status = String(source?.status || payload?.status || (audioUrl ? "succeeded" : jobId ? "queued" : "")).trim();

  if (!provider && !audioUrl && !previewUrl && !jobId && !status) return null;

  return {
    title: String(source?.title || `${fallback.theme} (${fallback.mood})`).trim(),
    provider: provider || undefined,
    model: model || undefined,
    status: status || undefined,
    job_id: jobId || undefined,
    preview_url: previewUrl || undefined,
    audio_url: audioUrl || undefined,
    prompt_used: String(source?.prompt_used || payload?.used_prompt || fallback.prompt || "").trim() || undefined,
    lyrics: typeof source?.lyrics === "string" ? source.lyrics : undefined,
    tags: Array.isArray(source?.tags) ? source.tags : undefined,
    duration: Number(source?.duration ?? fallback.duration) || fallback.duration,
    bpm: Number(source?.bpm ?? fallback.bpm) || fallback.bpm,
    created_at: String(source?.created_at || new Date().toISOString()),
  };
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export function CreatorMusicCard({ walletCommon, onRefetch }: Props) {
  const [theme, setTheme] = useState("");
  const [mood, setMood] = useState("energetico");
  const [bpm, setBpm] = useState<number>(140);
  const [duration, setDuration] = useState<number>(30);
  const [language, setLanguage] = useState("pt-BR");

  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [result, setResult] = useState<CreatorMusicResult | null>(null);

  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [interactionStarted, setInteractionStarted] = useState(false);

  const estimatedCommon = useMemo(() => {
    const themeUnits = Math.max(1, Math.ceil(theme.trim().length / 120));
    const durationUnits = Math.max(1, Math.ceil(duration / 30));
    return themeUnits + durationUnits;
  }, [theme, duration]);

  const normalizedTheme = theme.trim();
  const hasTheme = normalizedTheme.length > 0;
  const canGenerate = hasTheme && walletCommon >= estimatedCommon;
  const validationMessage = !hasTheme && interactionStarted
    ? "Preencha o tema para habilitar a geração."
    : walletCommon < estimatedCommon
      ? `Saldo insuficiente para esta geração. Necessário: ~${estimatedCommon} Comum. Compre créditos avulsos para continuar.`
      : null;

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

  async function onGeneratePrompt() {
    setInteractionStarted(true);
    if (!hasTheme) return;
    setLoadingPrompt(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const idempotencyKey = createIdempotencyKey("creator_music_prompt");

      const res = await apiFetch("/api/creator-music/prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({ theme, mood, bpm, duration, language }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(payload, "Falha ao gerar prompt."));
      }

      setGeneratedPrompt(String(payload?.prompt || ""));
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar prompt.");
    } finally {
      setLoadingPrompt(false);
    }
  }

  async function onGenerateMusic() {
    setInteractionStarted(true);
    if (!hasTheme) return;
    setLoadingGenerate(true);
    setError(null);
    setSuccess(null);
    setCopyMsg(null);
    setSavedProjectId(null);
    setResult(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const idempotencyKey = createIdempotencyKey("creator_music_generate");
      const promptToUse = generatedPrompt.trim() || buildMusicPrompt({ theme, mood, bpm, duration, language });

      const res = await apiFetch("/api/creator-music/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          theme,
          mood,
          bpm,
          duration,
          language,
          prompt: promptToUse,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(payload, "Falha ao gerar música."));
      }

      const normalizedResult = normalizeMusicResult(payload, {
        theme,
        mood,
        bpm,
        duration,
        prompt: promptToUse,
      });
      if (!normalizedResult) {
        throw new Error("Falha ao interpretar a resposta da música.");
      }

      setResult(normalizedResult);
      setGeneratedPrompt(String(payload?.used_prompt || promptToUse));
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar música.");
    } finally {
      setLoadingGenerate(false);
    }
  }

  async function onRefreshStatus() {
    const jobId = String(result?.job_id || "").trim();
    if (!jobId || loadingStatus) return;

    setLoadingStatus(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await apiFetch("/api/ai/music-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createIdempotencyKey("creator_music_status"),
        },
        body: JSON.stringify({ jobId }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(payload, "Falha ao consultar status da música."));
      }

      const normalizedResult = normalizeMusicResult(payload, {
        theme,
        mood,
        bpm,
        duration,
        prompt: generatedPrompt.trim() || buildMusicPrompt({ theme, mood, bpm, duration, language }),
      });
      if (!normalizedResult) {
        throw new Error("Falha ao interpretar o status retornado.");
      }

      setResult((prev) => ({
        ...(prev || {}),
        ...normalizedResult,
        prompt_used: prev?.prompt_used || normalizedResult.prompt_used,
      }));
      if (normalizedResult.status === "succeeded" && normalizedResult.audio_url) {
        setSuccess("Áudio final disponível para revisar e salvar.");
      }
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao consultar status da música.");
    } finally {
      setLoadingStatus(false);
    }
  }

  async function onSaveProject() {
    if (!result || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const payload = {
        type: "creator_music",
        theme,
        mood,
        bpm,
        duration,
        language,
        result,
      };

      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: `Creator Music - ${theme}`,
          kind: "text",
          data: {
            content: JSON.stringify(payload),
          },
        }),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(body, "Falha ao salvar projeto."));
      }

      const projectId = String(body?.item?.id || body?.id || "").trim();
      setSavedProjectId(projectId || null);
      setSuccess("Projeto salvo com sucesso.");
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar projeto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="premium-card creator-workspace-card creator-workspace-card-modular">
      <div className="creator-workspace-header">
        <div className="hero-title-stack section-stack-tight">
          <p className="section-kicker">O que você quer criar</p>
          <h3 className="heading-reset">Creator Music</h3>
        </div>
        <p className="creator-workspace-subtitle">
          Monte a direção sonora, gere uma trilha inicial e salve o resultado para continuar no editor.
        </p>
      </div>

      <div className="creator-workspace-zones">
        <div className="creator-form-zone">
          <p className="creator-zone-title">Como deseja gerar</p>
          <p className="creator-zone-copy">Defina tema, clima, BPM e duração antes de pedir o prompt ou a geração final.</p>
          <div className="form-grid-2 creator-field-grid">
            <label className="field-label-ea">
              <span>Tema</span>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="trap motivacional"
                className="field-ea"
              />
            </label>

            <label className="field-label-ea">
              <span>Clima</span>
              <PremiumSelect
                value={mood}
                onChange={setMood}
                options={MOOD_OPTIONS}
                ariaLabel="Clima da música"
              />
            </label>

            <label className="field-label-ea">
              <span>BPM</span>
              <input
                type="number"
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value || 0))}
                className="field-ea"
              />
            </label>

            <label className="field-label-ea">
              <span>Duração (s)</span>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value || 0))}
                className="field-ea"
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

        <div className="creator-context-zone">
          <p className="creator-zone-title">Contexto e previsibilidade</p>
          <p className="creator-zone-copy">
            O fluxo está em beta, mas já permite revisar o prompt, gerar a faixa e continuar o trabalho com contexto salvo.
          </p>
          <div className="creator-section-label">Beta operacional</div>
          <div className="helper-note-inline">Disponível no beta com melhorias contínuas de qualidade e experiência.</div>
        </div>

        <div className="creator-estimate-row">
          <div className="helper-note-inline">Estimativa de consumo: ~{estimatedCommon} Comum</div>
          <div className="helper-note-subtle">Estimativa prévia. O consumo real aparece em Créditos {'>'} Histórico.</div>
          {!hasTheme && !interactionStarted ? (
            <div className="inline-alert">Defina o tema para habilitar a geração.</div>
          ) : null}
          {validationMessage ? (
            <div className={`inline-alert ${hasTheme ? "inline-alert-error" : "inline-alert-warning"}`}>{validationMessage}</div>
          ) : null}
        </div>

        <div className="creator-actions-row">
          <div className="creator-action-buttons">
            <button
              className={`btn-ea btn-ghost ${loadingPrompt || !hasTheme ? "creator-button-busy-soft" : ""}`}
              onClick={onGeneratePrompt}
              disabled={loadingPrompt || !hasTheme}
            >
              {loadingPrompt ? "Gerando..." : "Gerar prompt"}
            </button>

            <button
              className={`btn-ea btn-primary ${loadingGenerate || !canGenerate ? "creator-button-busy" : ""}`}
              onClick={onGenerateMusic}
              disabled={loadingGenerate || !canGenerate}
            >
              {loadingGenerate ? "Gerando..." : "Gerar música"}
            </button>

            {result?.job_id ? (
              <button className="btn-ea btn-secondary" onClick={onRefreshStatus} disabled={loadingStatus}>
                {loadingStatus ? "Atualizando..." : "Atualizar status"}
              </button>
            ) : null}
          </div>

          {(error || success || copyMsg) ? (
            <div className="creator-feedback-stack">
              {error ? (
                <div className="state-ea state-ea-error">
                  <p className="state-ea-title">Falha na geração</p>
                  <div className="state-ea-text">{toUserFacingError(error, "Tente gerar novamente em instantes.")}</div>
                </div>
              ) : null}
              {success ? <div className="creator-feedback-note">{success}</div> : null}
              {copyMsg ? <div className="creator-feedback-note">{copyMsg}</div> : null}
            </div>
          ) : null}
        </div>

        {loadingGenerate ? (
          <div className="premium-card-soft creator-loading-panel">
            <div className="helper-note-inline">Gerando a faixa com o briefing atual...</div>
            <div className="premium-skeleton premium-skeleton-line" style={{ width: "38%" }} />
            <div className="premium-skeleton premium-skeleton-line" style={{ width: "82%" }} />
            <div className="premium-skeleton premium-skeleton-line" style={{ width: "64%" }} />
          </div>
        ) : null}

        {generatedPrompt ? (
          <div className="creator-inline-panel">
            <div className="creator-inline-panel-header">
              <strong>Prompt gerado</strong>
              <p>Revise o texto antes de gerar a faixa final para manter a direção sonora sob controle.</p>
            </div>
            <textarea
              className="field-ea creator-prompt-textarea"
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              rows={4}
            />
            <div className="creator-inline-actions">
              <button className="btn-ea btn-ghost btn-sm creator-inline-action-soft" onClick={() => copyText(generatedPrompt, "Prompt")}>
                Copiar prompt
              </button>
            </div>
          </div>
        ) : null}

        {!result && !loadingGenerate ? (
          <div className="state-ea creator-empty-state">
            <p className="state-ea-title">Nenhuma música gerada ainda</p>
            <div className="state-ea-text">
              Preencha o tema, gere a faixa e salve em projetos para continuar no editor.
            </div>
            <div className="state-ea-actions">
              <button
                type="button"
                onClick={onGenerateMusic}
                disabled={!canGenerate || loadingGenerate}
                className="btn-ea btn-primary btn-sm"
              >
                Gerar música
              </button>
              <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
                Ver projetos
              </Link>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="creator-result-stack">
            <div className="creator-result-header">
              <p className="section-kicker">Resultado</p>
              <div className="creator-result-title">Trilha pronta para revisar</div>
              <p className="creator-result-copy">Confira metadados, status do job e próximos passos antes de salvar o projeto.</p>
              {result?.provider ? (
                <div className={result.provider === "mock" ? "inline-alert inline-alert-warning" : "helper-note-inline"}>
                  {result.provider === "mock"
                    ? "Resultado entregue em modo beta simulado. Ative o provedor real para áudio final."
                    : `Gerado via ${result.provider}${result.model ? ` · ${result.model}` : ""}.`}
                </div>
              ) : null}
            </div>

            <div className="creator-output-grid">
              <div className="creator-output-card">
                <div className="creator-output-card-title">Resumo da faixa</div>
                <div className="creator-output-card-stat-row"><span>Título</span><strong>{result.title || "—"}</strong></div>
                <div className="creator-output-card-stat-row"><span>Provedor</span><strong>{result.provider || "—"}</strong></div>
                <div className="creator-output-card-stat-row"><span>Status</span><strong>{result.status || "—"}</strong></div>
                <div className="creator-output-card-stat-row"><span>BPM</span><strong>{result.bpm ?? bpm}</strong></div>
                <div className="creator-output-card-stat-row"><span>Duração</span><strong>{result.duration ?? duration}s</strong></div>
              </div>

              <div className="creator-output-card">
                <div className="creator-output-card-title">Entrega do áudio</div>
                {result.audio_url ? (
                  <>
                    <div className="creator-output-card-meta">Áudio final retornado pelo provedor.</div>
                    <a href={result.audio_url} target="_blank" rel="noreferrer" className="creator-output-card-link">
                      {result.audio_url}
                    </a>
                  </>
                ) : result.preview_url ? (
                  <>
                    <div className="creator-output-card-meta">Prévia disponível enquanto o job continua em processamento.</div>
                    <a href={result.preview_url} target="_blank" rel="noreferrer" className="creator-output-card-link">
                      {result.preview_url}
                    </a>
                  </>
                ) : (
                  <div className="creator-output-card-meta">Ainda sem link retornado pelo provedor.</div>
                )}
              </div>

              {result.tags?.length ? (
                <div className="creator-output-card">
                  <div className="creator-output-card-title">Tags</div>
                  <div className="creator-chip-list">
                    {result.tags.map((tag, index) => (
                      <span key={`${tag}-${index}`} className="choice-chip" data-active="true">
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.lyrics ? (
                <div className="creator-output-card creator-output-card--wide">
                  <div className="creator-output-card-title">Letras / direção textual</div>
                  <div className="result-copy-prewrap">{result.lyrics}</div>
                </div>
              ) : null}

              <div className="postgen-panel creator-next-step-panel">
                <div className="postgen-title">Próximos passos</div>
                <div className="creator-next-step-copy">
                  Fluxo recomendado: gerar → salvar projeto → continuar no editor.
                </div>
                <div className="postgen-actions">
                  {result.audio_url ? (
                    <button
                      className="btn-ea btn-ghost btn-sm"
                      onClick={() => copyText(result.audio_url || "", "Link do áudio")}
                    >
                      Copiar link do áudio
                    </button>
                  ) : result.preview_url ? (
                    <button
                      className="btn-ea btn-ghost btn-sm"
                      onClick={() => copyText(result.preview_url || "", "Link da prévia")}
                    >
                      Copiar link da prévia
                    </button>
                  ) : null}
                  {result.job_id ? (
                    <button className="btn-ea btn-secondary btn-sm" onClick={onRefreshStatus} disabled={loadingStatus}>
                      {loadingStatus ? "Atualizando..." : "Atualizar status"}
                    </button>
                  ) : null}
                  <button
                    className="btn-ea btn-secondary btn-sm"
                    onClick={onSaveProject}
                    disabled={saving}
                  >
                    {saving ? "Salvando..." : "Salvar projeto"}
                  </button>
                  <button
                    className="btn-ea btn-ghost btn-sm"
                    onClick={onGenerateMusic}
                    disabled={loadingGenerate || !canGenerate}
                  >
                    {loadingGenerate ? "Gerando..." : "Gerar novamente"}
                  </button>
                  <a href="/projects" className="btn-link-ea btn-ghost btn-sm">
                    Ver em Projetos
                  </a>
                  {savedProjectId ? (
                    <a href={`/editor/${savedProjectId}`} className="btn-link-ea btn-primary btn-sm">
                      Continuar no Editor
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}



