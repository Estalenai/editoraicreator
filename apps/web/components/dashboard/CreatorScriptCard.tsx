"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, apiFetch } from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import { createIdempotencyKey } from "../../lib/idempotencyKey";
import { runAutoPromptFlow } from "../../lib/autoPromptFlow";
import { usePromptPreferences } from "../../hooks/usePromptPreferences";
import { PremiumSelect } from "../ui/PremiumSelect";
import { CreatorPlannerPanel } from "./CreatorPlannerPanel";
import { toUserFacingError, toUserFacingGenerationSuccess } from "../../lib/uiFeedback";

type ScriptStructuredResult = {
  title?: string;
  opening?: string;
  development_points?: string[];
  closing?: string;
  cta?: string;
  final_script?: string;
};

type Props = {
  walletCommon: number;
  onRefetch: () => Promise<void>;
};

const SCRIPT_FORMAT_OPTIONS = [
  "Vídeo curto (Reels/Shorts)",
  "Vídeo longo (YouTube)",
  "Anúncio",
  "Narração",
  "Apresentação",
  "Podcast",
  "Live",
];

const SCRIPT_TONE_OPTIONS = [
  "Didático",
  "Profissional",
  "Conversacional",
  "Persuasivo",
  "Inspirador",
];

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

function safeJsonParse(text: string): any | null {
  try {
    const fenceMatch = text.match(/```json([\s\S]*?)```/i);
    const raw = fenceMatch ? fenceMatch[1].trim() : text;
    return JSON.parse(raw);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildScriptPrompt({
  theme,
  format,
  tone,
  audience,
  duration,
  objective,
  notes,
  language,
}: {
  theme: string;
  format: string;
  tone: string;
  audience: string;
  duration: string;
  objective: string;
  notes: string;
  language: string;
}) {
  return [
    "Você é um especialista em roteiros para criadores de conteúdo.",
    `Idioma: ${language}`,
    `Tema: ${theme}`,
    `Formato: ${format}`,
    `Tom: ${tone}`,
    `Público: ${audience}`,
    `Duração aproximada: ${duration}`,
    `Objetivo principal: ${objective}`,
    `Observações extras: ${notes || "Nenhuma"}`,
    "",
    "Crie um roteiro objetivo e prático, com gancho forte no início e CTA no final.",
    "Retorne JSON estrito com este formato:",
    JSON.stringify(
      {
        title: "Título do roteiro",
        opening: "Abertura curta com gancho",
        development_points: ["Ponto 1", "Ponto 2", "Ponto 3"],
        closing: "Encerramento",
        cta: "CTA final",
        final_script: "Roteiro completo pronto para gravação",
      },
      null,
      2
    ),
  ].join("\n");
}

function extractStructuredResult(text: string): ScriptStructuredResult | null {
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== "object") return null;
  const isString = (value: unknown): value is string => typeof value === "string";

  return {
    title: typeof parsed.title === "string" ? parsed.title : undefined,
    opening: typeof parsed.opening === "string" ? parsed.opening : undefined,
    development_points: Array.isArray(parsed.development_points)
      ? parsed.development_points.filter(isString)
      : undefined,
    closing: typeof parsed.closing === "string" ? parsed.closing : undefined,
    cta: typeof parsed.cta === "string" ? parsed.cta : undefined,
    final_script: typeof parsed.final_script === "string" ? parsed.final_script : undefined,
  };
}

function getScriptCopyValue(structured: ScriptStructuredResult | null, fallbackText: string): string {
  if (structured?.final_script) return structured.final_script;
  return fallbackText;
}

export function CreatorScriptCard({ walletCommon, onRefetch }: Props) {
  const [theme, setTheme] = useState("");
  const [format, setFormat] = useState("Vídeo curto (Reels/Shorts)");
  const [tone, setTone] = useState("Didático");
  const [audience, setAudience] = useState("");
  const [duration, setDuration] = useState("45-60 segundos");
  const [objective, setObjective] = useState("Engajamento");
  const [notes, setNotes] = useState("");
  const [language, setLanguage] = useState("pt-BR");

  const { promptEnabled, autoApply, updatePromptEnabled, updateAutoApply } = usePromptPreferences();

  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [inlinePromptOpen, setInlinePromptOpen] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [showPromptUsed, setShowPromptUsed] = useState(false);
  const [lastPromptUsed, setLastPromptUsed] = useState<string | null>(null);

  const [resultText, setResultText] = useState("");
  const [resultStructured, setResultStructured] = useState<ScriptStructuredResult | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [resultProvider, setResultProvider] = useState<string | null>(null);
  const [resultModel, setResultModel] = useState<string | null>(null);

  const estimatedCommon = useMemo(() => {
    const notesUnits = Math.max(1, Math.ceil(notes.trim().length / 300));
    return Math.max(1, notes.trim().length > 0 ? notesUnits : 1);
  }, [notes]);

  const hasCredits = walletCommon >= estimatedCommon;
  const isBusy = loadingPrompt || loadingApply;

  const plannerSteps = useMemo(
    () => [
      promptEnabled
        ? autoApply
          ? "Montar prompt otimizado e aplicar automaticamente ao briefing atual."
          : "Montar prompt otimizado e abrir revisão manual antes da execução."
        : "Usar o briefing atual como base direta para o roteiro.",
      "Gerar estrutura com gancho, desenvolvimento, fechamento e CTA.",
      "Entregar roteiro final pronto para revisão, salvamento e continuidade no editor.",
    ],
    [promptEnabled, autoApply]
  );

  const plannerSettings = useMemo(
    () => [
      { label: "Formato", value: format },
      { label: "Tom", value: tone },
      { label: "Público", value: audience.trim() || "A definir" },
      { label: "Idioma", value: language },
    ],
    [format, tone, audience, language]
  );

  const plannerParameters = useMemo(
    () => [
      { label: "Tema", value: theme.trim() || "A definir" },
      { label: "Objetivo", value: objective.trim() || "A definir" },
      { label: "Duração", value: duration.trim() || "A definir" },
      { label: "Prompt automático", value: promptEnabled ? "Ligado" : "Direto" },
      { label: "Aplicação", value: promptEnabled ? (autoApply ? "Automática" : "Manual") : "Briefing direto" },
      { label: "Estimativa", value: `${estimatedCommon} Comum` },
    ],
    [theme, objective, duration, promptEnabled, autoApply, estimatedCommon]
  );

  function openPlanner() {
    if (!theme.trim() || !objective.trim() || loadingPrompt || loadingApply || !hasCredits) return;
    setPlannerOpen(true);
    setError(null);
    setSuccess(null);
    window.requestAnimationFrame(() => {
      document.getElementById("creator-scripts-planner")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function editPlanner() {
    setPlannerOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("creator-scripts-config")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  const formatSelectOptions = useMemo(
    () => SCRIPT_FORMAT_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const toneSelectOptions = useMemo(
    () => SCRIPT_TONE_OPTIONS.map((item) => ({ value: item, label: item })),
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
    return buildScriptPrompt({
      theme,
      format,
      tone,
      audience,
      duration,
      objective,
      notes,
      language,
    });
  }

  async function applyFinalPrompt(finalPrompt: string) {
    setLoadingApply(true);
    setError(null);
    setSuccess(null);
    setCopyMsg(null);
    setSaveMsg(null);
    setSavedProjectId(null);
    setResultText("");
    setResultStructured(null);
    setResultProvider(null);
    setResultModel(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await apiFetch("/api/ai/text-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createIdempotencyKey("creator_script_generate"),
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          language,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Falha ao gerar roteiro.");
      }

      const text = String(payload?.text || "");
      setResultText(text);
      setResultStructured(extractStructuredResult(text));
      setResultProvider(typeof payload?.provider === "string" ? payload.provider : null);
      setResultModel(typeof payload?.model === "string" ? payload.model : null);
      setSuccess(
        toUserFacingGenerationSuccess({
          provider: typeof payload?.provider === "string" ? payload.provider : null,
          model: typeof payload?.model === "string" ? payload.model : null,
          defaultMessage: "Roteiro gerado e pronto para revisão.",
          mockMessage: "Resposta entregue em modo beta simulado. Ative o provedor real para versão final.",
        })
      );
      setLastPromptUsed(finalPrompt);
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar roteiro.");
    } finally {
      setLoadingApply(false);
    }
  }

  async function onGenerateFlow() {
    if (!theme.trim() || !objective.trim() || loadingPrompt || loadingApply) return;
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
        buildScriptPrompt({
          theme,
          format,
          tone,
          audience,
          duration,
          objective,
          notes,
          language,
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
        setPlannerOpen(false);
      },
    });
  }

  async function onSaveProject() {
    if (savingProject || (!resultText && !resultStructured)) return;

    setSavingProject(true);
    setError(null);
    setSuccess(null);
    setSaveMsg(null);

    try {
      const themeSnippet = theme.trim().slice(0, 60) || "roteiro";
      const payload = {
        type: "creator_scripts",
        theme,
        format,
        tone,
        audience,
        duration,
        objective,
        notes,
        language,
        generated: {
          structured: resultStructured,
          raw_text: resultText,
          prompt_used: lastPromptUsed,
        },
      };

      const created = await api.createProject({
        title: `Creator Scripts - ${themeSnippet}`,
        kind: "script",
        data: payload,
      });

      const projectId = String(created?.item?.id || created?.id || "").trim();
      setSavedProjectId(projectId || null);
      setSaveMsg("Projeto salvo com sucesso.");
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar roteiro em projeto.");
    } finally {
      setSavingProject(false);
    }
  }

  const finalScriptForCopy = getScriptCopyValue(resultStructured, resultText);

  return (
    <div
      className="premium-card creator-workspace-card creator-workspace-card-modular"
    >
      <div className="creator-workspace-header">
        <div className="hero-title-stack section-stack-tight">
          <p className="section-kicker">O que você quer criar</p>
          <h3 className="heading-reset">Creator Scripts</h3>
        </div>
        <p className="creator-workspace-subtitle">
          Organize tema, formato e objetivo para gerar um roteiro pronto para gravação.
        </p>
      </div>

      <div className="creator-workspace-zones">
      <div id="creator-scripts-config" className="creator-form-zone">
        <p className="creator-zone-title">Como deseja gerar</p>
        <p className="creator-zone-copy">Defina formato, tom, público e objetivo antes de adicionar observações extras.</p>
        <div className="form-grid-2 creator-field-grid">
        <label className="field-label-ea">
          <span>Tema</span>
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Ex.: Como crescer no Instagram em 30 dias"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Formato</span>
          <PremiumSelect
            value={format}
            onChange={setFormat}
            options={formatSelectOptions}
            ariaLabel="Formato do roteiro"
          />
        </label>

        <label className="field-label-ea">
          <span>Tom</span>
          <PremiumSelect
            value={tone}
            onChange={setTone}
            options={toneSelectOptions}
            ariaLabel="Tom do roteiro"
          />
        </label>

        <label className="field-label-ea">
          <span>Público</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Ex.: Criadores iniciantes"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Duração aproximada</span>
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Ex.: 60 segundos"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Objetivo</span>
          <input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Ex.: Engajar e converter"
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

      <div className="creator-form-zone">
        <p className="creator-zone-title">Contexto e observações</p>
        <p className="creator-zone-copy">Use este espaço para diferenciar gancho, restrições e detalhes de execução do roteiro.</p>
        <label className="field-label-ea">
          <span>Observações extras</span>
          <textarea
            className="field-ea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Detalhes adicionais, oferta, restrições ou palavras-chave..."
            rows={4}
            style={{
              minHeight: 120,
              resize: "vertical",
            }}
          />
        </label>
      </div>

      <div className="creator-context-zone">
        <p className="creator-zone-title">Estimativa e contexto</p>
        <p className="creator-zone-copy">O prompt automático pode acelerar o fluxo ou servir como base para revisão manual.</p>
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

        <div className="helper-note-inline">Se autoaplicar estiver ativo, o roteiro é gerado logo após montar o prompt.</div>
      </div>

      <div className="creator-estimate-row">
        <div className="helper-note-inline">Estimativa de consumo: ~{estimatedCommon} Comum</div>
        <div className="helper-note-subtle">
          Estimativa prévia. O consumo real aparece em Créditos {'>'} Histórico.
        </div>
        {!hasCredits && <div className="inline-alert inline-alert-error">Saldo insuficiente para gerar roteiro. Compre créditos avulsos para continuar.</div>}
      </div>

      <div className="creator-actions-row">
        {!plannerOpen ? (
        <div className="creator-action-buttons">
          <button
            onClick={openPlanner}
            disabled={isBusy || !theme.trim() || !objective.trim() || !hasCredits}
            className={`btn-ea btn-primary ${isBusy || !theme.trim() || !objective.trim() || !hasCredits ? "creator-button-busy" : ""}`}
          >
            {isBusy ? "Gerando..." : "Gerar roteiro com IA"}
          </button>
        </div>
        ) : (
          <div className="helper-note-inline">Revise o plano abaixo antes de executar a geração.</div>
        )}
        {(error || success || copyMsg || saveMsg) ? (
          <div className="creator-feedback-stack">
            {error ? (
              <div className="state-ea state-ea-error">
                <p className="state-ea-title">Falha ao gerar roteiro</p>
                <div className="state-ea-text">{toUserFacingError(error, "Revise o briefing e tente novamente.")}</div>
              </div>
            ) : null}
            {success ? (
              <div className={`state-ea ${resultProvider === "mock" ? "state-ea-warning" : "state-ea-success"}`}>
                <p className="state-ea-title">Geração concluída</p>
                <div className="state-ea-text">{success}</div>
              </div>
            ) : null}
            {copyMsg ? <div className="creator-feedback-note">{copyMsg}</div> : null}
            {saveMsg ? <div className="creator-feedback-note">{saveMsg}</div> : null}
          </div>
        ) : null}
      </div>

      {plannerOpen ? (
        <div id="creator-scripts-planner">
          <CreatorPlannerPanel
            title="Plano pronto para o Creator Scripts"
            objective={`Gerar roteiro em ${format.toLowerCase()} com foco em ${objective.toLowerCase()}.`}
            summary="Você revisa objetivo, etapas e parâmetros principais antes de a IA executar o roteiro."
            steps={plannerSteps}
            settings={plannerSettings}
            parameters={plannerParameters}
            note="Se o prompt automático estiver em modo manual, o roteiro só executa depois da sua revisão final do prompt."
            continueLabel="Continuar com o roteiro"
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

      {loadingApply && (
        <div className="premium-card-soft creator-loading-panel">
          <div className="helper-note-inline">EditexAI está montando seu roteiro...</div>
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "38%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "84%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "66%" }} />
        </div>
      )}

      {inlinePromptOpen && promptEnabled && !autoApply && (
        <div className="creator-inline-panel">
          <div className="creator-inline-panel-header">
            <strong>Prompt gerado</strong>
            <p>Revise o texto antes de aplicar para manter o roteiro alinhado ao tom e ao formato desejado.</p>
          </div>
          <textarea
            className="field-ea creator-prompt-textarea"
            value={generatedPrompt}
            onChange={(e) => setGeneratedPrompt(e.target.value)}
            rows={8}
          />
          <div className="creator-inline-actions">
            <button
              onClick={() => copyText(generatedPrompt, "Prompt")}
              className="btn-ea btn-ghost btn-sm creator-inline-action-soft"
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
              onClick={() => {
                setInlinePromptOpen(false);
                setGeneratedPrompt("");
              }}
              className="btn-ea btn-ghost btn-sm creator-inline-action-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {lastPromptUsed && (
        <div className="creator-inline-panel">
          <button
            onClick={() => setShowPromptUsed((value) => !value)}
            className="btn-ea btn-ghost btn-sm creator-inline-action-soft"
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

      {!(resultStructured || resultText) && !isBusy && !plannerOpen ? (
        <div className="state-ea creator-empty-state">
          <p className="state-ea-title">Nenhum roteiro gerado ainda</p>
          <div className="state-ea-text">
            Defina tema e objetivo, gere o roteiro e salve em projetos para continuar no editor.
          </div>
          <div className="state-ea-actions">
            <button
              className="btn-ea btn-primary btn-sm"
              onClick={openPlanner}
              disabled={isBusy || !theme.trim() || !objective.trim() || !hasCredits}
            >
              Gerar roteiro
            </button>
            <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
              Ver projetos
            </Link>
          </div>
        </div>
      ) : null}

      {(resultStructured || resultText) && (
        <div className="creator-result-stack">
          <div className="creator-result-header">
            <p className="section-kicker">Resultado</p>
            <div className="creator-result-title">Roteiro pronto para revisar</div>
            <p className="creator-result-copy">
              Confira estrutura, título e CTA antes de salvar o material.
            </p>
            {resultProvider ? (
              <div className={resultProvider === "mock" ? "inline-alert inline-alert-warning" : "helper-note-inline"}>
                {resultProvider === "mock"
                  ? "Resposta entregue em modo beta simulado. Ative o provedor real para versão final."
                  : `Gerado via ${resultProvider}${resultModel ? ` · ${resultModel}` : ""}.`}
              </div>
            ) : null}
          </div>

          <div className="creator-output-grid">
          {resultStructured?.title && (
            <div className="creator-output-card">
              <div className="creator-output-card-title">Título</div>
              <div>{resultStructured.title}</div>
            </div>
          )}

          {resultStructured?.opening && (
            <div className="creator-output-card">
              <div className="creator-output-card-title">Abertura</div>
              <div className="result-copy-prewrap">{resultStructured.opening}</div>
            </div>
          )}

          {Array.isArray(resultStructured?.development_points) &&
            resultStructured.development_points.length > 0 && (
              <div className="creator-output-card creator-output-card--wide">
              <div className="creator-output-card-title">Desenvolvimento</div>
              <ul>
                  {resultStructured.development_points.map((point, index) => (
                    <li key={`${point}-${index}`}>{point}</li>
                  ))}
                </ul>
              </div>
            )}

          {resultStructured?.closing && (
            <div className="creator-output-card">
              <div className="creator-output-card-title">Encerramento</div>
              <div className="result-copy-prewrap">{resultStructured.closing}</div>
            </div>
          )}

          {resultStructured?.cta && (
            <div className="creator-output-card">
              <div className="creator-output-card-title">CTA</div>
              <div>{resultStructured.cta}</div>
            </div>
          )}

          <div className="creator-output-card creator-output-card--wide">
            <div className="creator-output-card-title">Roteiro final</div>
            <div className="result-copy-prewrap">
              {resultStructured?.final_script || resultText || "Sem roteiro textual retornado."}
            </div>
          </div>

          <div className="postgen-panel creator-next-step-panel">
            <div className="postgen-title">Próximos passos</div>
            <div className="creator-next-step-copy">
              Fluxo recomendado: gerar → salvar projeto → continuar no editor.
            </div>
            <div className="postgen-actions">
              <button
                className="btn-ea btn-ghost btn-sm"
                onClick={() => copyText(finalScriptForCopy, "Roteiro")}
              >
                Copiar roteiro
              </button>
              <button
                className="btn-ea btn-secondary btn-sm"
                onClick={onSaveProject}
                disabled={savingProject}
              >
                {savingProject ? "Salvando..." : "Salvar projeto"}
              </button>
              <button
                className="btn-ea btn-ghost btn-sm"
                onClick={openPlanner}
                disabled={isBusy || !theme.trim() || !objective.trim() || !hasCredits}
              >
                Gerar novamente
              </button>
              <a
                href="/projects"
                className="btn-link-ea btn-ghost btn-sm"
              >
                Ver em Projetos
              </a>
              {savedProjectId && (
                <a
                  href={`/editor/${savedProjectId}`}
                  className="btn-link-ea btn-primary btn-sm"
                >
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




