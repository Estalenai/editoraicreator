"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api, apiFetch } from "../../lib/api";
import { supabase } from "../../lib/supabaseClient";
import { createIdempotencyKey } from "../../lib/idempotencyKey";
import { runAutoPromptFlow } from "../../lib/autoPromptFlow";
import { usePromptPreferences } from "../../hooks/usePromptPreferences";
import { useAiExecutionMode } from "../../hooks/useAiExecutionMode";
import { buildExecutionTechnicalPayload } from "../../lib/aiExecution";
import { PremiumSelect } from "../ui/PremiumSelect";
import { CreatorPlannerPanel } from "./CreatorPlannerPanel";
import { AiExecutionModeFields } from "./AiExecutionModeFields";
import { extractApiErrorMessage, toUserFacingError, toUserFacingGenerationSuccess } from "../../lib/uiFeedback";

type AdsStructuredResult = {
  headline?: string;
  body?: string;
  cta?: string;
  short_variant?: string;
  full_version?: string;
};

type Props = {
  planCode: string | null;
  walletCommon: number;
  onRefetch: () => Promise<void>;
};

const ADS_PLATFORM_OPTIONS = ["Instagram", "Facebook", "Google Ads", "TikTok", "YouTube", "LinkedIn"];
const ADS_TONE_OPTIONS = ["Direto", "Persuasivo", "Educativo", "Premium", "Conversacional"];

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

function buildAdsPrompt({
  productService,
  objective,
  audience,
  platform,
  tone,
  offerCta,
  differential,
  language,
  notes,
}: {
  productService: string;
  objective: string;
  audience: string;
  platform: string;
  tone: string;
  offerCta: string;
  differential: string;
  language: string;
  notes: string;
}) {
  return [
    "Você é um estrategista de marketing de performance.",
    `Idioma: ${language}`,
    `Produto/Serviço: ${productService}`,
    `Objetivo do anúncio: ${objective}`,
    `Público-alvo: ${audience}`,
    `Plataforma/canal: ${platform}`,
    `Tom: ${tone}`,
    `Oferta/CTA: ${offerCta || "Não definido"}`,
    `Diferencial: ${differential || "Não definido"}`,
    `Observações: ${notes || "Nenhuma"}`,
    "",
    "Crie uma peça de anúncio pronta para uso, com foco em clareza e conversão.",
    "Retorne JSON estrito com este formato:",
    JSON.stringify(
      {
        headline: "Headline principal",
        body: "Corpo principal do anúncio",
        cta: "CTA final",
        short_variant: "Variação curta",
        full_version: "Versao completa para publicacao",
      },
      null,
      2
    ),
  ].join("\n");
}

function extractStructuredResult(text: string): AdsStructuredResult | null {
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== "object") return null;

  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : undefined,
    body: typeof parsed.body === "string" ? parsed.body : undefined,
    cta: typeof parsed.cta === "string" ? parsed.cta : undefined,
    short_variant: typeof parsed.short_variant === "string" ? parsed.short_variant : undefined,
    full_version: typeof parsed.full_version === "string" ? parsed.full_version : undefined,
  };
}

function getAdCopyValue(structured: AdsStructuredResult | null, fallbackText: string): string {
  if (structured?.full_version) return structured.full_version;
  return fallbackText;
}

export function CreatorAdsCard({ planCode, walletCommon, onRefetch }: Props) {
  const [productService, setProductService] = useState("");
  const [objective, setObjective] = useState("Conversão");
  const [audience, setAudience] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [tone, setTone] = useState("Direto");
  const [offerCta, setOfferCta] = useState("");
  const [differential, setDifferential] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [notes, setNotes] = useState("");

  const {
    promptEnabled,
    autoApply,
    executionModePreference,
    executionModeSaving,
    executionModeError,
    updatePromptEnabled,
    updateAutoApply,
    updateExecutionModePreference,
  } = usePromptPreferences();
  const execution = useAiExecutionMode({
    planCode,
    feature: "text",
    automaticPreference: executionModePreference,
    onAutomaticPreferenceChange: updateExecutionModePreference,
  });

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
  const [resultStructured, setResultStructured] = useState<AdsStructuredResult | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [resultProvider, setResultProvider] = useState<string | null>(null);
  const [resultModel, setResultModel] = useState<string | null>(null);

  const estimatedCommon = useMemo(() => {
    const notesUnits = Math.max(1, Math.ceil(notes.trim().length / 300));
    const bodyUnits = Math.max(1, Math.ceil(productService.trim().length / 160));
    return Math.max(1, notesUnits + bodyUnits - 1);
  }, [notes, productService]);

  const hasCredits = walletCommon >= estimatedCommon;
  const isBusy = loadingPrompt || loadingApply;

  const plannerSteps = useMemo(
    () => [
      promptEnabled
        ? autoApply
          ? "Montar prompt otimizado e aplicar automaticamente ao briefing atual."
          : "Montar prompt otimizado e abrir revisão manual antes da execução."
        : "Usar o briefing atual como base direta para a peça de anúncio.",
      "Gerar headline, corpo principal e CTA alinhados ao canal de mídia.",
      "Entregar versão curta e peça completa para revisão e salvamento em projeto.",
    ],
    [promptEnabled, autoApply]
  );

  const plannerSettings = useMemo(
    () => [
      { label: "Canal", value: platform },
      { label: "Tom", value: tone },
      { label: "Público", value: audience.trim() || "A definir" },
      { label: "Idioma", value: language },
    ],
    [platform, tone, audience, language]
  );

  const plannerParameters = useMemo(
    () => [
      { label: "Produto", value: productService.trim() || "A definir" },
      { label: "Objetivo", value: objective.trim() || "A definir" },
      { label: "Oferta / CTA", value: offerCta.trim() || "A definir" },
      { label: "Diferencial", value: differential.trim() || "A definir" },
      { label: "Execução IA", value: execution.modeLabel },
      { label: "Prompt automático", value: promptEnabled ? "Ligado" : "Direto" },
      { label: "Aplicação", value: promptEnabled ? (autoApply ? "Automática" : "Manual") : "Briefing direto" },
      { label: "Estimativa", value: `${estimatedCommon} Comum` },
    ],
    [productService, objective, offerCta, differential, execution.modeLabel, promptEnabled, autoApply, estimatedCommon]
  );
  const executionTechnicalPayload = useMemo(
    () =>
      buildExecutionTechnicalPayload({
        feature: "text",
        capabilities: execution.capabilities,
        functionsCount: 1,
        filesCount: 0,
        requestedPipelineLevel: "simple",
        storageMode: "platform_temporary",
      }),
    [execution.capabilities]
  );

  function openPlanner() {
    if (!productService.trim() || !objective.trim() || loadingPrompt || loadingApply || !hasCredits) return;
    setPlannerOpen(true);
    setError(null);
    setSuccess(null);
    window.requestAnimationFrame(() => {
      document.getElementById("creator-ads-planner")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function editPlanner() {
    setPlannerOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("creator-ads-config")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  const platformSelectOptions = useMemo(
    () => ADS_PLATFORM_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const toneSelectOptions = useMemo(
    () => ADS_TONE_OPTIONS.map((item) => ({ value: item, label: item })),
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
    return buildAdsPrompt({
      productService,
      objective,
      audience,
      platform,
      tone,
      offerCta,
      differential,
      language,
      notes,
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
          "Idempotency-Key": createIdempotencyKey("creator_ads_generate"),
        },
        body: JSON.stringify({
          prompt: finalPrompt,
          language,
          ...executionTechnicalPayload,
          routing: execution.routing,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(payload, "Falha ao gerar anúncio."));
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
          replay: Boolean(payload?.replay),
          defaultMessage: "Peça gerada e pronta para revisão.",
          mockMessage: "Resposta entregue em modo beta simulado. Ative o provedor real para peça final.",
          replayMessage: "Esta resposta reaproveitou uma execução recente com segurança. Revise a peça antes de seguir.",
        })
      );
      setLastPromptUsed(finalPrompt);
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar anúncio.");
    } finally {
      setLoadingApply(false);
    }
  }

  async function onGenerateFlow() {
    if (!productService.trim() || !objective.trim() || loadingPrompt || loadingApply) return;
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
        buildAdsPrompt({
          productService,
          objective,
          audience,
          platform,
          tone,
          offerCta,
          differential,
          language,
          notes,
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
      const productSnippet = productService.trim().slice(0, 60) || "anuncio";
      const payload = {
        type: "creator_ads",
        productService,
        objective,
        audience,
        platform,
        tone,
        offerCta,
        differential,
        language,
        notes,
        generated: {
          structured: resultStructured,
          raw_text: resultText,
          prompt_used: lastPromptUsed,
        },
      };

      const created = await api.createProject({
        title: `Creator Ads - ${productSnippet}`,
        kind: "ads",
        data: payload,
      });

      const projectId = String(created?.item?.id || created?.id || "").trim();
      setSavedProjectId(projectId || null);
      setSaveMsg("Projeto salvo com segurança. Continue no Editor para revisar, salvar novas versões e exportar depois.");
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar anúncio em projeto.");
    } finally {
      setSavingProject(false);
    }
  }

  const finalAdForCopy = getAdCopyValue(resultStructured, resultText);

  return (
    <div
      className="premium-card creator-workspace-card creator-workspace-card-modular"
    >
      <div className="creator-workspace-header">
        <div className="hero-title-stack section-stack-tight">
          <p className="section-kicker">Briefing da campanha</p>
          <h3 className="heading-reset">Creator Ads</h3>
        </div>
        <p className="creator-workspace-subtitle">
          Construa uma peça com foco em conversão, valide a mensagem e salve em projeto.
        </p>
      </div>

      <div className="creator-workspace-zones">
      <div id="creator-ads-config" className="creator-form-zone">
        <p className="creator-zone-title">Como deseja gerar</p>
        <p className="creator-zone-copy">Defina produto, público, canal e diferencial antes de adicionar observações extras.</p>
        <div className="form-grid-2 creator-field-grid">
        <label className="field-label-ea">
          <span>Produto/serviço</span>
          <input
            value={productService}
            onChange={(e) => setProductService(e.target.value)}
            placeholder="Ex.: Curso de edição para criadores"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Objetivo</span>
          <input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="Ex.: Gerar leads qualificados"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Público-alvo</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Ex.: Donos de ecommerce iniciantes"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Plataforma/canal</span>
          <PremiumSelect
            value={platform}
            onChange={setPlatform}
            options={platformSelectOptions}
            ariaLabel="Plataforma do anúncio"
          />
        </label>

        <label className="field-label-ea">
          <span>Tom</span>
          <PremiumSelect
            value={tone}
            onChange={setTone}
            options={toneSelectOptions}
            ariaLabel="Tom do anúncio"
          />
        </label>

        <label className="field-label-ea">
          <span>Oferta/CTA</span>
          <input
            value={offerCta}
            onChange={(e) => setOfferCta(e.target.value)}
            placeholder="Ex.: Teste grátis por 7 dias"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Diferencial</span>
          <input
            value={differential}
            onChange={(e) => setDifferential(e.target.value)}
            placeholder="Ex.: Suporte humano em 24h"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Idioma</span>
          <input value={language} onChange={(e) => setLanguage(e.target.value)} className="field-ea" />
        </label>
        </div>
      </div>

      <div className="creator-form-zone">
        <p className="creator-zone-title">Contexto e observações</p>
        <p className="creator-zone-copy">Refine restrições, prova social, urgência e contexto para direcionar melhor a saída.</p>
        <label className="field-label-ea">
          <span>Observações extras</span>
          <textarea
            className="field-ea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex.: Evitar promessas exageradas, foco em prova social e urgência leve."
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
        <p className="creator-zone-copy">Use o prompt automático para acelerar variações de anúncio ou revisar manualmente antes de gerar.</p>
        <AiExecutionModeFields
          capabilities={execution.capabilities}
          mode={execution.mode}
          onModeChange={execution.handleModeChange}
          modeDetail={execution.modeDetail}
          availabilityNote={execution.availabilityNote}
          qualityOutputsLabel={execution.qualityOutputsLabel}
          manualProvider={execution.manualProvider}
          onManualProviderChange={execution.setManualProvider}
          manualTier={execution.manualTier}
          onManualTierChange={execution.setManualTier}
          manualSelectionLabel={execution.manualSelectionLabel}
          persistingPreference={executionModeSaving}
          preferenceError={executionModeError}
        />
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
        <div className="helper-note-inline">Use a revisão manual quando precisar ajustar a mensagem antes de gerar.</div>
      </div>

      <div className="creator-estimate-row">
        <div className="helper-note-inline">Estimativa de consumo: ~{estimatedCommon} Comum</div>
        <div className="helper-note-subtle">
          Estimativa prévia. O consumo real aparece em Créditos {'>'} Histórico.
        </div>
        {!hasCredits && <div className="inline-alert inline-alert-error">Saldo insuficiente para gerar anúncio. Compre créditos avulsos para continuar.</div>}
      </div>

      <div className="creator-actions-row">
        {!plannerOpen ? (
        <div className="creator-action-buttons">
          <button
            onClick={openPlanner}
            disabled={isBusy || !productService.trim() || !objective.trim() || !hasCredits}
            className={`btn-ea btn-primary ${isBusy || !productService.trim() || !objective.trim() || !hasCredits ? "creator-button-busy" : ""}`}
          >
            {isBusy ? "Gerando..." : "Gerar anúncio com IA"}
          </button>
        </div>
        ) : (
          <div className="helper-note-inline">Revise o plano abaixo antes de executar a geração.</div>
        )}
        {(error || success || copyMsg || saveMsg) ? (
          <div className="creator-feedback-stack">
            {error ? (
              <div className="state-ea state-ea-error">
                <p className="state-ea-title">Falha ao gerar anúncio</p>
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
        <div id="creator-ads-planner">
          <CreatorPlannerPanel
            title="Plano pronto para o Creator Ads"
            objective={`Gerar anúncio para ${platform} com foco em ${objective.toLowerCase()}.`}
            summary="Você revisa os principais blocos da peça antes da IA executar a geração final."
            steps={plannerSteps}
            settings={plannerSettings}
            parameters={plannerParameters}
            note="Se o prompt automático estiver em modo manual, a peça ainda passa pela sua revisão antes de executar."
            continueLabel="Continuar com o anúncio"
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
          <div className="helper-note-inline">EditexAI está refinando a peça de anúncio...</div>
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "41%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "82%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "70%" }} />
        </div>
      )}

      {inlinePromptOpen && promptEnabled && !autoApply && (
        <div className="creator-inline-panel">
          <div className="creator-inline-panel-header">
            <strong>Prompt gerado</strong>
            <p>Revise o prompt antes de aplicar para manter a peça de anúncio alinhada ao canal e ao objetivo.</p>
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
          <p className="state-ea-title">Nenhum anúncio gerado ainda</p>
          <div className="state-ea-text">
            Defina produto e objetivo para gerar a primeira peça e registrar continuidade em projetos.
          </div>
          <div className="state-ea-actions">
            <button
              className="btn-ea btn-primary btn-sm"
              onClick={openPlanner}
              disabled={isBusy || !productService.trim() || !objective.trim() || !hasCredits}
            >
              Gerar anúncio
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
            <div className="creator-result-title">Peça pronta para revisar</div>
            <p className="creator-result-copy">
              Compare headline, corpo e variações antes de salvar a peça.
            </p>
            {resultProvider ? (
              <div className={resultProvider === "mock" ? "inline-alert inline-alert-warning" : "helper-note-inline"}>
                {resultProvider === "mock"
                  ? "Resposta entregue em modo beta simulado. Ative o provedor real para peça final."
                  : `Gerado via ${resultProvider}${resultModel ? ` · ${resultModel}` : ""}.`}
              </div>
            ) : null}
          </div>

          <div className="creator-output-grid">
          {resultStructured?.headline && (
            <div className="creator-output-card">
              <div className="creator-output-card-title">Headline</div>
              <div>{resultStructured.headline}</div>
            </div>
          )}

          {resultStructured?.body && (
            <div className="creator-output-card creator-output-card--wide">
              <div className="creator-output-card-title">Corpo principal</div>
              <div className="result-copy-prewrap">{resultStructured.body}</div>
            </div>
          )}

          {resultStructured?.cta && (
            <div className="creator-output-card">
              <div className="creator-output-card-title">CTA</div>
              <div>{resultStructured.cta}</div>
            </div>
          )}

          {resultStructured?.short_variant && (
            <div className="creator-output-card">
              <div className="creator-output-card-title">Variação curta</div>
              <div className="result-copy-prewrap">{resultStructured.short_variant}</div>
            </div>
          )}

          <div className="creator-output-card creator-output-card--wide">
            <div className="creator-output-card-title">Versão completa</div>
            <div className="result-copy-prewrap">
              {resultStructured?.full_version || resultText || "Sem texto de anúncio retornado."}
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
                onClick={() => copyText(finalAdForCopy, "Anuncio")}
              >
                Copiar anúncio
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
                disabled={isBusy || !productService.trim() || !objective.trim() || !hasCredits}
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




