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
import { isCreatorNoCodeAllowed } from "../../lib/planGates";
import { PremiumSelect } from "../ui/PremiumSelect";
import { AiExecutionModeFields } from "./AiExecutionModeFields";
import { toUserFacingError } from "../../lib/uiFeedback";

type NoCodeStructuredResult = {
  product_overview?: string;
  suggested_stack?: {
    frontend?: string;
    backend?: string;
    database?: string;
    infra?: string;
  };
  core_modules?: string[];
  pages?: string[];
  data_entities?: Array<{ name?: string; fields?: string[] }>;
  integrations?: string[];
  roadmap?: string[];
  first_milestones?: string[];
};

type Props = {
  planCode: string | null;
  walletCommon: number;
  onRefetch: () => Promise<void>;
};

const PRODUCT_TYPE_OPTIONS = ["App", "Site", "SaaS", "Automação", "Landing Page", "Jogo (conceito)"];
const COMPLEXITY_OPTIONS = ["MVP enxuto", "Intermediário", "Escalável"];
const TARGET_PLATFORM_OPTIONS = ["Web", "Mobile", "Web + Mobile"];

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

function buildNoCodePrompt({
  projectName,
  productType,
  objective,
  audience,
  mainFeatures,
  desiredIntegrations,
  complexity,
  targetPlatform,
  observations,
  language,
}: {
  projectName: string;
  productType: string;
  objective: string;
  audience: string;
  mainFeatures: string;
  desiredIntegrations: string;
  complexity: string;
  targetPlatform: string;
  observations: string;
  language: string;
}) {
  return [
    "Você é um arquiteto de produto no-code e low-code.",
    `Idioma: ${language}`,
    `Nome do projeto: ${projectName}`,
    `Tipo de produto: ${productType}`,
    `Objetivo principal: ${objective}`,
    `Público-alvo: ${audience}`,
    `Funcionalidades principais: ${mainFeatures}`,
    `Integrações desejadas: ${desiredIntegrations || "Nenhuma definida"}`,
    `Complexidade desejada: ${complexity}`,
    `Plataforma alvo: ${targetPlatform}`,
    `Observações adicionais: ${observations || "Nenhuma"}`,
    "",
    "Gere uma estrutura inicial clara e executável por etapas.",
    "Retorne JSON estrito com o formato:",
    JSON.stringify(
      {
        product_overview: "Resumo claro do produto",
        suggested_stack: {
          frontend: "stack sugerida",
          backend: "stack sugerida",
          database: "stack sugerida",
          infra: "stack sugerida",
        },
        core_modules: ["módulo 1", "módulo 2"],
        pages: ["tela 1", "tela 2"],
        data_entities: [{ name: "entidade", fields: ["campo1", "campo2"] }],
        integrations: ["integração 1"],
        roadmap: ["fase 1", "fase 2"],
        first_milestones: ["marco 1", "marco 2"],
      },
      null,
      2
    ),
  ].join("\n");
}

function extractStructuredResult(text: string): NoCodeStructuredResult | null {
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== "object") return null;
  const isString = (value: unknown): value is string => typeof value === "string";
  return {
    product_overview: typeof parsed.product_overview === "string" ? parsed.product_overview : undefined,
    suggested_stack: parsed.suggested_stack && typeof parsed.suggested_stack === "object" ? parsed.suggested_stack : undefined,
    core_modules: Array.isArray(parsed.core_modules) ? parsed.core_modules.filter(isString) : undefined,
    pages: Array.isArray(parsed.pages) ? parsed.pages.filter(isString) : undefined,
    data_entities: Array.isArray(parsed.data_entities)
      ? parsed.data_entities.map((item: any) => ({
          name: typeof item?.name === "string" ? item.name : undefined,
          fields: Array.isArray(item?.fields) ? item.fields.filter((field: unknown): field is string => typeof field === "string") : [],
        }))
      : undefined,
    integrations: Array.isArray(parsed.integrations) ? parsed.integrations.filter(isString) : undefined,
    roadmap: Array.isArray(parsed.roadmap) ? parsed.roadmap.filter(isString) : undefined,
    first_milestones: Array.isArray(parsed.first_milestones)
      ? parsed.first_milestones.filter(isString)
      : undefined,
  };
}

function listOrPlaceholder(items?: string[]) {
  if (!Array.isArray(items) || items.length === 0) return ["—"];
  return items;
}

export function CreatorNoCodeCard({ planCode, walletCommon, onRefetch }: Props) {
  const [projectName, setProjectName] = useState("");
  const [productType, setProductType] = useState("SaaS");
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [mainFeatures, setMainFeatures] = useState("");
  const [desiredIntegrations, setDesiredIntegrations] = useState("");
  const [complexity, setComplexity] = useState("MVP enxuto");
  const [targetPlatform, setTargetPlatform] = useState("Web");
  const [observations, setObservations] = useState("");
  const [language, setLanguage] = useState("pt-BR");

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

  const [inlinePromptOpen, setInlinePromptOpen] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [showPromptUsed, setShowPromptUsed] = useState(false);
  const [lastPromptUsed, setLastPromptUsed] = useState<string | null>(null);

  const [resultText, setResultText] = useState("");
  const [resultStructured, setResultStructured] = useState<NoCodeStructuredResult | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  const isAllowed = useMemo(() => isCreatorNoCodeAllowed(planCode), [planCode]);
  const estimatedCommon = 1;
  const hasCredits = walletCommon >= estimatedCommon;
  const isBusy = loadingPrompt || loadingApply || savingProject;
  const productTypeSelectOptions = useMemo(
    () => PRODUCT_TYPE_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const complexitySelectOptions = useMemo(
    () => COMPLEXITY_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const targetPlatformSelectOptions = useMemo(
    () => TARGET_PLATFORM_OPTIONS.map((item) => ({ value: item, label: item })),
    []
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
    return buildNoCodePrompt({
      projectName,
      productType,
      objective,
      audience,
      mainFeatures,
      desiredIntegrations,
      complexity,
      targetPlatform,
      observations,
      language,
    });
  }

  async function applyFinalPrompt(finalPrompt: string) {
    setLoadingApply(true);
    setError(null);
    setSuccess(null);
    setResultText("");
    setResultStructured(null);

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await apiFetch("/api/ai/text-generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createIdempotencyKey("creator_nocode_generate"),
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
        throw new Error(payload?.error || "Falha ao gerar estrutura no-code.");
      }

      const text = String(payload?.text || "");
      setResultText(text);
      setResultStructured(extractStructuredResult(text));
      setLastPromptUsed(finalPrompt);
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar estrutura no-code.");
    } finally {
      setLoadingApply(false);
    }
  }

  async function onGenerateFlow() {
    if (!projectName.trim() || !objective.trim() || !mainFeatures.trim() || loadingPrompt || loadingApply) return;
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
        buildNoCodePrompt({
          projectName,
          productType,
          objective,
          audience,
          mainFeatures,
          desiredIntegrations,
          complexity,
          targetPlatform,
          observations,
          language,
        }),
      setLoadingPrompt,
      setError,
      onStart: () => {
        setInlinePromptOpen(false);
        setGeneratedPrompt("");
        setShowPromptUsed(false);
        setLastPromptUsed(null);
        setSavedProjectId(null);
      },
    });
  }

  async function onSaveProject() {
    if (savingProject) return;
    if (!resultText && !resultStructured) return;

    setSavingProject(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        type: "creator_no_code",
        projectName,
        productType,
        objective,
        audience,
        mainFeatures,
        desiredIntegrations,
        complexity,
        targetPlatform,
        observations,
        language,
        generated: {
          structured: resultStructured,
          raw_text: resultText,
          prompt_used: lastPromptUsed,
        },
      };

      const created = await api.createProject({
        title: `No Code - ${projectName}`,
        kind: "no_code",
        data: payload,
      });

      const projectId = String(created?.item?.id || created?.id || "").trim();
      setSavedProjectId(projectId || null);
      setSuccess("Estrutura do projeto salva com sucesso.");
      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao salvar estrutura do projeto.");
    } finally {
      setSavingProject(false);
    }
  }

  const structuredExportText = resultStructured ? JSON.stringify(resultStructured, null, 2) : resultText;

  if (!isAllowed) {
    return (
      <div className="creator-workspace-card creator-workspace-card-modular">
        <div className="creator-workspace-header">
          <div className="hero-title-stack section-stack-tight">
            <p className="section-kicker">Briefing do blueprint</p>
            <h3 className="heading-reset">Creator No Code</h3>
          </div>
          <p className="creator-workspace-subtitle">
            Estruture a ideia inicial do produto com visão, stack, módulos e roadmap antes de seguir para o editor.
          </p>
        </div>
        <div className="state-ea state-ea-warning creator-empty-state">
          <p className="state-ea-title">Disponível a partir do Creator Pro</p>
          <div className="state-ea-text">
            A Fase 1 libera a estruturação inicial do produto com contexto salvo e próximos passos claros.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="creator-workspace-card creator-workspace-card-modular">
      <div className="creator-workspace-header">
        <div className="hero-title-stack section-stack-tight">
          <p className="section-kicker">Briefing do blueprint</p>
          <h3 className="heading-reset">Creator No Code</h3>
        </div>
        <p className="creator-workspace-subtitle">
          Gere a estrutura inicial do produto com visão clara, stack sugerida, módulos, telas e roadmap acionável.
        </p>
      </div>

      <div className="creator-workspace-zones">
        <div className="creator-form-zone">
          <p className="creator-zone-title">Briefing do produto</p>
          <p className="creator-zone-copy">Defina contexto, público e escopo principal antes de montar a estrutura inicial.</p>
          <div className="form-grid-2 creator-field-grid">
            <label className="field-label-ea">
              <span>Nome da ideia/projeto</span>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="field-ea" />
            </label>

            <label className="field-label-ea">
              <span>Tipo de produto</span>
              <PremiumSelect
                value={productType}
                onChange={setProductType}
                options={productTypeSelectOptions}
                ariaLabel="Tipo de produto no-code"
              />
            </label>

            <label className="field-label-ea">
              <span>Objetivo principal</span>
              <input value={objective} onChange={(e) => setObjective(e.target.value)} className="field-ea" />
            </label>

            <label className="field-label-ea">
              <span>Público-alvo</span>
              <input value={audience} onChange={(e) => setAudience(e.target.value)} className="field-ea" />
            </label>

            <label className="field-label-ea">
              <span>Complexidade</span>
              <PremiumSelect
                value={complexity}
                onChange={setComplexity}
                options={complexitySelectOptions}
                ariaLabel="Complexidade do projeto"
              />
            </label>

            <label className="field-label-ea">
              <span>Plataforma alvo</span>
              <PremiumSelect
                value={targetPlatform}
                onChange={setTargetPlatform}
                options={targetPlatformSelectOptions}
                ariaLabel="Plataforma alvo do projeto"
              />
            </label>

            <label className="field-label-ea">
              <span>Idioma</span>
              <input value={language} onChange={(e) => setLanguage(e.target.value)} className="field-ea" />
            </label>
          </div>
        </div>

        <div className="creator-form-zone">
          <p className="creator-zone-title">Escopo inicial</p>
          <p className="creator-zone-copy">Liste funcionalidades, integrações e restrições para orientar o blueprint.</p>

          <label className="field-label-ea">
            <span>Funcionalidades principais</span>
            <textarea
              className="field-ea creator-prompt-textarea"
              value={mainFeatures}
              onChange={(e) => setMainFeatures(e.target.value)}
              rows={4}
              placeholder="Ex.: cadastro/login, onboarding, dashboard, relatórios..."
            />
          </label>

          <label className="field-label-ea">
            <span>Integrações desejadas</span>
            <textarea
              className="field-ea creator-prompt-textarea"
              value={desiredIntegrations}
              onChange={(e) => setDesiredIntegrations(e.target.value)}
              rows={3}
              placeholder="Ex.: Stripe, WhatsApp, Google Drive, CRM..."
            />
          </label>

          <label className="field-label-ea">
            <span>Observações</span>
            <textarea
              className="field-ea creator-prompt-textarea"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Restrições, preferências técnicas ou contexto de negócio."
            />
          </label>
        </div>

        <div className="creator-context-zone">
          <p className="creator-zone-title">Contexto e previsibilidade</p>
          <p className="creator-zone-copy">
            A Fase 1 foca em clareza estrutural: visão, stack, módulos, telas e roadmap antes do fluxo de execução no editor.
          </p>
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
              <input type="checkbox" checked={promptEnabled} onChange={async (e) => await updatePromptEnabled(e.target.checked)} />
              <span>Usar Prompt Automático</span>
            </label>
            <label className="toggle-row" data-active={promptEnabled && autoApply} data-disabled={!promptEnabled}>
              <input
                type="checkbox"
                checked={autoApply}
                disabled={!promptEnabled}
                onChange={async (e) => await updateAutoApply(e.target.checked)}
              />
              <span>Auto aplicar prompt</span>
            </label>
          </div>
          <div className="helper-note-subtle">
            Revise o prompt quando quiser mais controle do blueprint antes de consumir créditos na geração final.
          </div>
        </div>

        <div className="creator-estimate-row">
          <div className="helper-note-inline">Estimativa de consumo: ~{estimatedCommon} Comum</div>
          <div className="helper-note-subtle">Estimativa prévia. O consumo real aparece em Créditos {'>'} Histórico.</div>
          {!hasCredits ? <div className="inline-alert inline-alert-error">Saldo insuficiente para gerar blueprint.</div> : null}
        </div>

        <div className="creator-actions-row">
          <div className="creator-action-buttons">
            <button
              className={`btn-ea btn-primary ${loadingApply ? "creator-button-busy" : ""}`}
              onClick={onGenerateFlow}
              disabled={isBusy || !projectName.trim() || !objective.trim() || !mainFeatures.trim() || !hasCredits}
            >
              {loadingApply ? "Gerando..." : "Gerar estrutura inicial"}
            </button>
            <button
              className={`btn-ea btn-secondary ${savingProject ? "creator-button-busy-soft" : ""}`}
              onClick={onSaveProject}
              disabled={savingProject || (!resultText && !resultStructured)}
            >
              {savingProject ? "Salvando..." : "Salvar estrutura no projeto"}
            </button>
          </div>

          {(error || success || copyMsg) ? (
            <div className="creator-feedback-stack">
              {error ? (
                <div className="state-ea state-ea-error state-ea-spaced">
                  <p className="state-ea-title">Falha ao gerar blueprint</p>
                  <div className="state-ea-text">{toUserFacingError(error, "Revise o briefing e tente novamente.")}</div>
                </div>
              ) : null}
              {success ? <div className="creator-feedback-note">{success}</div> : null}
              {copyMsg ? <div className="creator-feedback-note">{copyMsg}</div> : null}
            </div>
          ) : null}
        </div>

        {inlinePromptOpen && promptEnabled && !autoApply ? (
          <div className="creator-inline-panel">
            <div className="creator-inline-panel-header">
              <strong>Prompt gerado</strong>
              <p>Revise e aplique o prompt antes de consolidar a estrutura final do produto.</p>
            </div>
            <textarea
              className="field-ea creator-prompt-textarea"
              value={generatedPrompt}
              onChange={(e) => setGeneratedPrompt(e.target.value)}
              rows={8}
            />
            <div className="creator-inline-actions">
              <button className="btn-ea btn-ghost btn-sm creator-inline-action-soft" onClick={() => copyText(generatedPrompt, "Prompt")}>
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
            </div>
          </div>
        ) : null}

        {lastPromptUsed ? (
          <div className="creator-inline-panel">
            <button className="btn-ea btn-ghost btn-sm creator-inline-action-soft" onClick={() => setShowPromptUsed((value) => !value)}>
              {showPromptUsed ? "Ocultar prompt usado (avançado)" : "Mostrar prompt usado (avançado)"}
            </button>
            {showPromptUsed ? (
              <div className="creator-result-stack">
                <textarea
                  className="field-ea creator-prompt-textarea"
                  value={lastPromptUsed}
                  onChange={(e) => setLastPromptUsed(e.target.value)}
                  rows={8}
                />
                <div className="creator-inline-actions">
                  <button className="btn-ea btn-ghost btn-sm creator-inline-action-soft" onClick={() => copyText(lastPromptUsed, "Prompt usado")}>
                    Copiar prompt usado
                  </button>
                  <button
                    className="btn-ea btn-secondary btn-sm creator-inline-action-muted"
                    onClick={async () => {
                      if (!lastPromptUsed.trim()) return;
                      await applyFinalPrompt(lastPromptUsed);
                    }}
                    disabled={loadingApply || !lastPromptUsed.trim()}
                  >
                    {loadingApply ? "Gerando..." : "Editar e gerar novamente"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!(resultStructured || resultText) && !isBusy ? (
          <div className="state-ea creator-empty-state">
            <p className="state-ea-title">Nenhuma estrutura gerada ainda</p>
            <div className="state-ea-text">
              Gere o blueprint inicial e salve em projetos para continuar a execução no editor.
            </div>
            <div className="state-ea-actions">
              <button
                className="btn-ea btn-primary btn-sm"
                onClick={onGenerateFlow}
                disabled={isBusy || !projectName.trim() || !objective.trim() || !mainFeatures.trim() || !hasCredits}
              >
                Gerar estrutura inicial
              </button>
              <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
                Ver projetos
              </Link>
            </div>
          </div>
        ) : null}

        {(resultStructured || resultText) ? (
          <div className="creator-result-stack">
            <div className="creator-result-header">
              <p className="section-kicker">Resultado</p>
              <div className="creator-result-title">Blueprint inicial pronto para revisar</div>
              <p className="creator-result-copy">
                Revise visão, stack, módulos e roadmap antes de salvar o projeto e seguir para o editor.
              </p>
            </div>

            <div className="creator-output-grid">
              <div className="creator-output-card creator-output-card--wide">
                <p className="creator-output-card-title">Visão geral</p>
                <div className="result-copy-prewrap">{resultStructured?.product_overview || resultText}</div>
              </div>

              <div className="creator-output-card">
                <p className="creator-output-card-title">Stack sugerida</p>
                <div className="creator-output-card-list">
                  <div className="creator-output-card-list-item"><strong>Frontend:</strong> {resultStructured?.suggested_stack?.frontend || "—"}</div>
                  <div className="creator-output-card-list-item"><strong>Backend:</strong> {resultStructured?.suggested_stack?.backend || "—"}</div>
                  <div className="creator-output-card-list-item"><strong>Database:</strong> {resultStructured?.suggested_stack?.database || "—"}</div>
                  <div className="creator-output-card-list-item"><strong>Infra:</strong> {resultStructured?.suggested_stack?.infra || "—"}</div>
                </div>
              </div>

              <div className="creator-output-card">
                <p className="creator-output-card-title">Módulos principais</p>
                <div className="creator-output-card-list">
                  {listOrPlaceholder(resultStructured?.core_modules).map((item, index) => (
                    <div key={`module-${index}`} className="creator-output-card-list-item">{item}</div>
                  ))}
                </div>
              </div>

              <div className="creator-output-card">
                <p className="creator-output-card-title">Páginas e telas</p>
                <div className="creator-output-card-list">
                  {listOrPlaceholder(resultStructured?.pages).map((item, index) => (
                    <div key={`page-${index}`} className="creator-output-card-list-item">{item}</div>
                  ))}
                </div>
              </div>

              <div className="creator-output-card creator-output-card--wide">
                <p className="creator-output-card-title">Entidades de dados</p>
                {Array.isArray(resultStructured?.data_entities) && resultStructured.data_entities.length > 0 ? (
                  <div className="creator-output-card-list">
                    {resultStructured.data_entities.map((entity, index) => (
                      <div key={`entity-${index}`} className="creator-output-card-list-item">
                        <strong>{entity.name || `Entidade ${index + 1}`}</strong>: {(entity.fields || []).join(", ") || "sem campos"}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="creator-output-card-meta">—</div>
                )}
              </div>

              <div className="creator-output-card">
                <p className="creator-output-card-title">Integrações sugeridas</p>
                <div className="creator-output-card-list">
                  {listOrPlaceholder(resultStructured?.integrations).map((item, index) => (
                    <div key={`integration-${index}`} className="creator-output-card-list-item">{item}</div>
                  ))}
                </div>
              </div>

              <div className="creator-output-card">
                <p className="creator-output-card-title">Roadmap inicial</p>
                <div className="creator-output-card-list">
                  {listOrPlaceholder(resultStructured?.roadmap).map((item, index) => (
                    <div key={`roadmap-${index}`} className="creator-output-card-list-item">{item}</div>
                  ))}
                </div>
              </div>

              <div className="creator-output-card">
                <p className="creator-output-card-title">Primeiros marcos</p>
                <div className="creator-output-card-list">
                  {listOrPlaceholder(resultStructured?.first_milestones).map((item, index) => (
                    <div key={`milestone-${index}`} className="creator-output-card-list-item">{item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="postgen-panel creator-next-step-panel">
              <div className="postgen-title">Próximos passos</div>
              <div className="creator-next-step-copy">
                Fluxo recomendado: gerar, revisar a estrutura, salvar o projeto e continuar no editor com o contexto já organizado.
              </div>
              <div className="postgen-actions">
                <button className="btn-ea btn-ghost btn-sm" onClick={() => copyText(structuredExportText, "Estrutura")}>
                  Copiar estrutura
                </button>
                <button
                  className="btn-ea btn-secondary btn-sm"
                  onClick={onSaveProject}
                  disabled={savingProject || (!resultText && !resultStructured)}
                >
                  {savingProject ? "Salvando..." : "Salvar estrutura no projeto"}
                </button>
                <button
                  className="btn-ea btn-ghost btn-sm"
                  onClick={onGenerateFlow}
                  disabled={isBusy || !projectName.trim() || !objective.trim() || !mainFeatures.trim() || !hasCredits}
                >
                  Gerar novamente
                </button>
                <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
                  Ver em Projetos
                </Link>
                {savedProjectId ? (
                  <Link href={`/editor/${savedProjectId}`} className="btn-link-ea btn-primary btn-sm">
                    Continuar no Editor
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
