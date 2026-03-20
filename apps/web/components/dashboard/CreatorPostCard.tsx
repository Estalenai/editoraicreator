"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { api, apiFetch } from "../../lib/api";
import { createIdempotencyKey } from "../../lib/idempotencyKey";
import { runAutoPromptFlow } from "../../lib/autoPromptFlow";
import { usePromptPreferences } from "../../hooks/usePromptPreferences";
import { PremiumSelect } from "../ui/PremiumSelect";
import { CreatorPlannerPanel } from "./CreatorPlannerPanel";
import { extractApiErrorMessage, toUserFacingError, toUserFacingGenerationSuccess } from "../../lib/uiFeedback";
import { createCreatorPostProjectData } from "../../lib/projectModel";

type CreatorPostResult = {
  caption: string;
  hashtags: string[];
  cta: string;
  mediaSuggestion: string;
  variations: string[];
  platformChecklist: string[];
};

type CreatorPostApiResult = Partial<CreatorPostResult> & {
  variants?: Array<string | { text?: string }>;
  platform?: string;
  type?: string;
};

type Props = {
  walletCommon: number;
  onRefetch: () => Promise<void>;
};

const PLATFORM_CHECKLISTS: Record<string, string[]> = {
  Instagram: [
    "Legenda com limite de caracteres adequado (ideal <= 2200).",
    "Hashtags no final da legenda.",
    "Primeira linha com gancho forte.",
  ],
  TikTok: [
    "Comece com hook direto nos primeiros 2 segundos.",
    "Texto curto e objetivo.",
    "Hashtags focadas em nicho + tendencia.",
  ],
  YouTube: [
    "Titulo curto e chamativo.",
    "Descrição curta com CTA.",
    "Hashtags no final da descrição.",
  ],
  "X (Twitter)": [
    "Texto enxuto e direto.",
    "Hashtags moderadas (1-3).",
    "CTA com pergunta para engajamento.",
  ],
  LinkedIn: [
    "Quebras de linha para leitura.",
    "Storytelling e valor pratico.",
    "CTA convidando comentarios.",
  ],
};

const POST_PLATFORM_OPTIONS = ["Instagram", "TikTok", "YouTube", "X (Twitter)", "LinkedIn"];
const POST_CONTENT_TYPE_OPTIONS = ["Post", "Story", "Reels / Shorts"];
const POST_TONE_OPTIONS = ["Profissional", "Casual", "Engraçado", "Educacional", "Vendas"];
const POST_OBJECTIVE_OPTIONS = ["Engajamento", "Conversão", "Autoridade", "Viralização"];

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

function buildFinalPrompt({
  platform,
  contentType,
  theme,
  tone,
  objective,
  language,
}: {
  platform: string;
  contentType: string;
  theme: string;
  tone: string;
  objective: string;
  language: string;
}) {
  const checklist = PLATFORM_CHECKLISTS[platform] || [];
  return [
    "Voce e um especialista em social media.",
    `Plataforma: ${platform}`,
    `Tipo de conteúdo: ${contentType}`,
    `Tema do post: ${theme}`,
    `Tom de voz: ${tone}`,
    `Objetivo: ${objective}`,
    `Idioma: ${language}`,
    "",
    "Gere:",
    "- Legenda otimizada para a plataforma",
    "- Hashtags relevantes (quantidade adequada para a plataforma)",
    "- CTA (Call To Action)",
    "- Sugestão de imagem ou vídeo",
    "- 2 variações alternativas de legenda",
    "- Checklist técnico da plataforma",
    "",
    "Checklist técnico da plataforma (use estes pontos):",
    ...checklist.map((item) => `- ${item}`),
    "",
    "Responda em JSON estrito no formato:",
    JSON.stringify(
      {
        caption: "...",
        hashtags: ["#tag1", "#tag2"],
        cta: "...",
        mediaSuggestion: "...",
        variations: ["...", "..."],
        platformChecklist: ["...", "..."],
      },
      null,
      2
    ),
  ].join("\n");
}

function estimateCreatorPostCost({
  platform,
  contentType,
  theme,
  maxTokens,
  promptEnabled,
}: {
  platform: string;
  contentType: string;
  theme: string;
  maxTokens: number;
  promptEnabled: boolean;
}) {
  const lengthUnits = Math.max(1, Math.ceil(theme.trim().length / 160));
  const tokenUnits = Math.max(1, Math.ceil(maxTokens / 200));
  const platformUnits = platform === "LinkedIn" || platform === "YouTube" ? 1 : 0;
  const typeUnits = contentType === "Reels / Shorts" ? 1 : 0;
  const baseCommon = lengthUnits + tokenUnits + platformUnits + typeUnits;
  const promptCommon = promptEnabled ? Math.max(1, Math.ceil(baseCommon / 2)) : 0;
  const common = baseCommon + promptCommon;
  const pro = Math.floor(common / 4);
  const ultra = Math.floor(common / 8);
  return { common, pro, ultra };
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export function CreatorPostCard({ walletCommon, onRefetch }: Props) {
  const router = useRouter();
  const [platform, setPlatform] = useState("Instagram");
  const [contentType, setContentType] = useState("Post");
  const [theme, setTheme] = useState("");
  const [tone, setTone] = useState("Profissional");
  const [objective, setObjective] = useState("Engajamento");
  const [language, setLanguage] = useState("pt-BR");

  const { promptEnabled, autoApply, updatePromptEnabled, updateAutoApply } = usePromptPreferences();

  const [loadingPrompt, setLoadingPrompt] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [result, setResult] = useState<CreatorPostResult | null>(null);
  const [rawText, setRawText] = useState("");
  const [resultProvider, setResultProvider] = useState<string | null>(null);
  const [resultModel, setResultModel] = useState<string | null>(null);
  const [resultReplay, setResultReplay] = useState(false);

  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [resultDirty, setResultDirty] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);

  // 🔥 NOVO: etapa inline (sem modal)
  const [inlinePromptOpen, setInlinePromptOpen] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");

  // 🔥 NOVO: transparência (ver prompt usado)
  const [showPromptUsed, setShowPromptUsed] = useState(false);
  const [lastPromptUsed, setLastPromptUsed] = useState<string | null>(null);

  const creditsEstimate = useMemo(
    () =>
      estimateCreatorPostCost({
        platform,
        contentType,
        theme,
        maxTokens: 400,
        promptEnabled,
      }),
    [platform, contentType, theme, promptEnabled]
  );

  const hasCredits = walletCommon >= creditsEstimate.common;
  const hasSavedProject = Boolean(savedProjectId);
  const needsProjectSync = Boolean(savedProjectId && resultDirty);

  const plannerSteps = useMemo(
    () => [
      promptEnabled
        ? autoApply
          ? "Montar prompt otimizado e aplicar automaticamente ao briefing atual."
          : "Montar prompt otimizado e abrir revisão manual antes da execução."
        : "Usar o briefing atual como base direta para a geração.",
      "Gerar legenda principal, CTA e hashtags alinhadas à plataforma.",
      "Entregar variações e checklist técnico para revisão final.",
      "Salvar no projeto e seguir para o editor com a base pronta para checkpoint e exportação.",
    ],
    [promptEnabled, autoApply]
  );

  const plannerSettings = useMemo(
    () => [
      { label: "Plataforma", value: platform },
      { label: "Formato", value: contentType },
      { label: "Tom", value: tone },
      { label: "Idioma", value: language },
    ],
    [platform, contentType, tone, language]
  );

  const plannerParameters = useMemo(
    () => [
      { label: "Tema", value: theme.trim() || "A definir" },
      { label: "Objetivo", value: objective },
      { label: "Prompt automático", value: promptEnabled ? "Ligado" : "Direto" },
      { label: "Aplicação", value: promptEnabled ? (autoApply ? "Automática" : "Manual") : "Briefing direto" },
      { label: "Estimativa", value: `${creditsEstimate.common} Comum • ${creditsEstimate.pro} Pro • ${creditsEstimate.ultra} Ultra` },
    ],
    [theme, objective, promptEnabled, autoApply, creditsEstimate]
  );

  function openPlanner() {
    if (!theme.trim() || loadingPrompt || loadingApply || !hasCredits) return;
    setPlannerOpen(true);
    setError(null);
    setSuccess(null);
    window.requestAnimationFrame(() => {
      document.getElementById("creator-post-planner")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function editPlanner() {
    setPlannerOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("creator-post-config")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const idempotencyKey = createIdempotencyKey("creator_post_prompt");

    const token = await getAccessToken();
    if (!token) throw new Error("Sessão expirada. Faça login novamente.");

    const res = await apiFetch("/api/creator-post/prompt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        platform,
        contentType,
        tone,
        objective,
        language,
        theme,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(extractApiErrorMessage(payload, "Falha ao gerar prompt."));
    }

    const payload = await res.json().catch(() => null);
    const promptText = String(payload?.prompt || "");
    if (!promptText) throw new Error("Não foi possível gerar o prompt. Tente novamente.");
    return promptText;
  }

  async function applyFinalPrompt(finalPrompt: string) {
    setLoadingApply(true);
    setError(null);
    setSuccess(null);
    setCopyMsg(null);
    setSaveMsg(null);
    setSavedProjectId(null);
    setResult(null);
    setRawText("");
    setResultProvider(null);
    setResultModel(null);
    setResultReplay(false);
    setResultDirty(false);

    try {
      const idempotencyKey = createIdempotencyKey("creator_post_generate");

      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await apiFetch("/api/creator-post/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          platform,
          contentType,
          tone,
          objective,
          language,
          theme,
          prompt: finalPrompt,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(extractApiErrorMessage(payload, "Falha ao gerar post."));
      }

      const payload = await res.json().catch(() => null);
      const resultPayload = payload?.result as CreatorPostApiResult | undefined;
      const text = String(payload?.text || "");
      const parsed = safeJsonParse(text) as CreatorPostApiResult | null;
      const normalized = normalizeCreatorPostResult(resultPayload || parsed, text, platform);
      if (!normalized) {
        throw new Error("Resposta de geração inválida. Tente novamente.");
      }
      setResult(normalized);
      setRawText(normalized?.caption || text);
      setResultProvider(typeof payload?.provider === "string" ? payload.provider : null);
      setResultModel(typeof payload?.model === "string" ? payload.model : null);
      setResultReplay(Boolean(payload?.replay));
      setSuccess(
        toUserFacingGenerationSuccess({
          provider: typeof payload?.provider === "string" ? payload.provider : null,
          model: typeof payload?.model === "string" ? payload.model : null,
          replay: Boolean(payload?.replay),
          defaultMessage: "Post gerado e pronto para revisão.",
          mockMessage: "Resposta entregue em modo beta manual. Revise antes de tratar este retorno como saída final.",
        })
      );

      setLastPromptUsed(
        typeof payload?.used_prompt === "string" && payload.used_prompt.trim()
          ? payload.used_prompt.trim()
          : finalPrompt
      );

      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar post.");
    } finally {
      setLoadingApply(false);
    }
  }

  async function applyWithBackendPromptless() {
    // Mantemos este caminho quando o backend gera prompt e aplica (se existir)
    // — mas aqui seu fluxo atual de "promptEnabled + skipConfirm" antes já chamava isto.
    setLoadingApply(true);
    setError(null);
    setSuccess(null);
    setCopyMsg(null);
    setSaveMsg(null);
    setSavedProjectId(null);
    setResult(null);
    setRawText("");
    setResultProvider(null);
    setResultModel(null);
    setResultReplay(false);
    setResultDirty(false);

    try {
      const idempotencyKey = createIdempotencyKey("creator_post_generate");

      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await apiFetch("/api/creator-post/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          platform,
          contentType,
          tone,
          objective,
          language,
          theme,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(extractApiErrorMessage(payload, "Falha ao gerar post."));
      }

      const payload = await res.json().catch(() => null);
      const resultPayload = payload?.result as CreatorPostApiResult | undefined;
      const text = String(payload?.text || "");
      const parsed = safeJsonParse(text) as CreatorPostApiResult | null;
      const normalized = normalizeCreatorPostResult(resultPayload || parsed, text, platform);
      if (!normalized) {
        throw new Error("Resposta de geração inválida. Tente novamente.");
      }
      setResult(normalized);
      setRawText(normalized?.caption || text);
      setResultProvider(typeof payload?.provider === "string" ? payload.provider : null);
      setResultModel(typeof payload?.model === "string" ? payload.model : null);
      setResultReplay(Boolean(payload?.replay));
      setSuccess(
        toUserFacingGenerationSuccess({
          provider: typeof payload?.provider === "string" ? payload.provider : null,
          model: typeof payload?.model === "string" ? payload.model : null,
          replay: Boolean(payload?.replay),
          defaultMessage: "Post gerado e pronto para revisão.",
          mockMessage: "Resposta entregue em modo beta manual. Revise antes de tratar este retorno como saída final.",
        })
      );

      setLastPromptUsed(
        typeof payload?.used_prompt === "string" && payload.used_prompt.trim()
          ? payload.used_prompt.trim()
          : null
      );

      await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao gerar post.");
    } finally {
      setLoadingApply(false);
    }
  }

  async function onGenerateFlow() {
    if (!theme.trim() || loadingPrompt || loadingApply) return;
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
        buildFinalPrompt({
          platform,
          contentType,
          theme,
          tone,
          objective,
          language,
        }),
      setLoadingPrompt,
      setError,
      onStart: () => {
        setInlinePromptOpen(false);
        setGeneratedPrompt("");
        setShowPromptUsed(false);
        setLastPromptUsed(null);
        setResultReplay(false);
        setResultDirty(false);
        setSuccess(null);
        setSaveMsg(null);
        setSavedProjectId(null);
        setPlannerOpen(false);
      },
    });
  }

  function applyVariationAsPrimary(variation: string) {
    if (!variation.trim()) return;
    setResult((current) => {
      if (!current) return current;
      return {
        ...current,
        caption: variation,
      };
    });
    setRawText(variation);
    setSuccess("Variação aplicada como legenda principal. Revise a peça e sincronize o projeto antes de seguir.");
    if (savedProjectId) {
      setResultDirty(true);
      setSaveMsg("A legenda principal mudou depois do último salvamento. Atualize o projeto antes de abrir o editor.");
    }
  }

  async function persistProject(openEditorAfterSave = false) {
    if (!result || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    setSaveMsg(null);

    const themeSnippet = theme.trim().slice(0, 60) || "sem tema";
    const title = `${platform} ${contentType} - ${themeSnippet}`;
    const dataPayload = createCreatorPostProjectData({
      platform,
      contentType,
      tone,
      objective,
      language,
      theme,
      result,
    });

    try {
      const body = savedProjectId
        ? await api.updateProject(savedProjectId, {
            title,
            kind: "post",
            data: dataPayload,
          })
        : await api.createProject({
            title,
            kind: "post",
            data: dataPayload,
          });

      const projectId = String(body?.item?.id || body?.id || savedProjectId || "").trim();
      setSavedProjectId(projectId || null);
      setResultDirty(false);
      setSaveMsg(
        openEditorAfterSave
          ? "Projeto sincronizado. Abrindo o editor com a base do Creator Post pronta para continuidade."
          : savedProjectId
            ? "Projeto atualizado com segurança. O editor vai receber a versão mais recente desta peça."
            : "Projeto salvo com segurança. A base do Creator Post já está pronta para abrir no editor."
      );
      await onRefetch();
      if (openEditorAfterSave && projectId) {
        router.push(`/editor/${projectId}?source=creator_post&handoff=saved`);
      }
    } catch (e: any) {
      setError(extractApiErrorMessage(e, "Falha ao salvar projeto. Verifique os dados e tente novamente."));
    } finally {
      setSaving(false);
    }
  }

  const displayResult = result || null;
  const caption = displayResult?.caption || rawText;
  const hashtags = displayResult?.hashtags || [];
  const resultSourceNote = useMemo(() => {
    if (resultReplay) {
      return {
        tone: "warning" as const,
        text: "Esta saída reaproveitou uma tentativa recente com segurança. Revise a peça e salve no projeto antes de seguir.",
      };
    }
    if (resultProvider === "mock") {
      return {
        tone: "warning" as const,
        text: "Resposta entregue em modo beta manual. Revise antes de tratar esta peça como publicação final.",
      };
    }
    if (resultProvider) {
      return {
        tone: "success" as const,
        text: `Gerado via ${resultProvider}${resultModel ? ` · ${resultModel}` : ""}.`,
      };
    }
    return null;
  }, [resultModel, resultProvider, resultReplay]);

  const isBusy = loadingPrompt || loadingApply;
  const platformSelectOptions = useMemo(
    () => POST_PLATFORM_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const contentTypeSelectOptions = useMemo(
    () => POST_CONTENT_TYPE_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const toneSelectOptions = useMemo(
    () => POST_TONE_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );
  const objectiveSelectOptions = useMemo(
    () => POST_OBJECTIVE_OPTIONS.map((item) => ({ value: item, label: item })),
    []
  );

  return (
    <div
      className="creator-workspace-card creator-workspace-card-modular creator-workspace-module"
    >
      <div className="creator-workspace-header">
        <div className="hero-title-stack section-stack-tight">
          <p className="section-kicker">Briefing da geração</p>
          <h3 className="heading-reset">Creator Post</h3>
        </div>
        <p className="creator-workspace-subtitle">
          Estruture o briefing, gere a saída e siga para o editor com o contexto salvo.
        </p>
      </div>

      <div className="creator-workspace-zones">
      <div id="creator-post-config" className="creator-form-zone">
        <p className="creator-zone-title">Como deseja gerar</p>
        <p className="creator-zone-copy">Defina plataforma, formato, objetivo e idioma antes de detalhar o tema.</p>
        <div className="form-grid-2 creator-field-grid">
        <label className="field-label-ea">
          <span>Plataforma</span>
          <PremiumSelect
            value={platform}
            onChange={setPlatform}
            options={platformSelectOptions}
            ariaLabel="Plataforma do post"
          />
        </label>

        <label className="field-label-ea">
          <span>Tipo</span>
          <PremiumSelect
            value={contentType}
            onChange={setContentType}
            options={contentTypeSelectOptions}
            ariaLabel="Tipo de conteúdo"
          />
        </label>

        <label className="field-label-ea">
          <span>Tom</span>
          <PremiumSelect
            value={tone}
            onChange={setTone}
            options={toneSelectOptions}
            ariaLabel="Tom do conteúdo"
          />
        </label>

        <label className="field-label-ea">
          <span>Objetivo</span>
          <PremiumSelect
            value={objective}
            onChange={setObjective}
            options={objectiveSelectOptions}
            ariaLabel="Objetivo do post"
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
        <p className="creator-zone-title">Contexto e briefing</p>
        <p className="creator-zone-copy">Descreva o assunto central. A qualidade do briefing melhora legenda, CTA e variações.</p>
        <label className="field-label-ea">
          <span>Tema do post</span>
          <textarea
            className="field-ea"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="Descreva a ideia do post..."
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
        <p className="creator-zone-copy">Revise o consumo previsto e escolha entre autoaplicar o prompt ou revisar manualmente.</p>
        <div className="creator-section-label">Prompt Automático</div>

        <div className="creator-toggle-stack">
          <label className="toggle-row" data-active={promptEnabled}>
            <input
              type="checkbox"
              checked={promptEnabled}
              onChange={async (e) => {
                const value = e.target.checked;
                await updatePromptEnabled(value);
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
                const value = e.target.checked;
                await updateAutoApply(value);
              }}
            />
            <span>Auto aplicar prompt</span>
          </label>
        </div>

        <div className="helper-note-inline">Quando ativo, a IA cria um prompt otimizado antes de gerar.</div>
      </div>

      <div className="creator-estimate-row">
        <div className="helper-note-inline">
          Estimativa de consumo: ~{creditsEstimate.common} Comum • {creditsEstimate.pro} Pro • {creditsEstimate.ultra} Ultra
        </div>
        <div className="helper-note-subtle">
          Estimativa prévia. O consumo real aparece em Créditos {'>'} Histórico.
        </div>
        {!hasCredits && <div className="inline-alert inline-alert-error">Saldo insuficiente para gerar. Compre créditos avulsos para continuar.</div>}
      </div>

      <div className="creator-planner-field-grid creator-post-journey-grid">
        <div className="creator-planner-field">
          <span>Saída esperada</span>
          <strong>Legenda principal, CTA, hashtags, mídia sugerida e variações.</strong>
        </div>
        <div className="creator-planner-field">
          <span>Encerramento do fluxo</span>
          <strong>Salvar no projeto, abrir o editor e registrar exported quando a peça sair.</strong>
        </div>
      </div>

      <div className="creator-actions-row">
        {!plannerOpen ? (
        <div className="creator-action-buttons">
          <button
            onClick={openPlanner}
            disabled={isBusy || !theme.trim() || !hasCredits}
            className={`btn-ea btn-primary ${isBusy || !theme.trim() || !hasCredits ? "creator-button-busy" : ""}`}
          >
            {isBusy ? "Gerando..." : displayResult ? "Gerar nova versão" : "Revisar plano e gerar"}
          </button>

          {displayResult ? (
            <button
              onClick={openPlanner}
              disabled={isBusy || !theme.trim() || !hasCredits}
              className={`btn-ea btn-secondary ${isBusy || !theme.trim() || !hasCredits ? "creator-button-busy-soft" : ""}`}
            >
              Ajustar plano
            </button>
          ) : null}
        </div>
        ) : (
          <div className="helper-note-inline">Revise o plano abaixo antes de executar a geração.</div>
        )}

        {(error || success || copyMsg || saveMsg) ? (
          <div className="creator-feedback-stack">
            {error ? (
              <div className="state-ea state-ea-error">
                <p className="state-ea-title">Falha na geração</p>
                <div className="state-ea-text">{toUserFacingError(error, "Ajuste o briefing e tente novamente.")}</div>
              </div>
            ) : null}
            {success ? (
              <div className={`state-ea ${resultProvider === "mock" || resultReplay ? "state-ea-warning" : "state-ea-success"}`}>
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
        <div id="creator-post-planner">
          <CreatorPlannerPanel
            title="Plano pronto para o Creator Post"
            objective={`Gerar ${contentType.toLowerCase()} para ${platform} com foco em ${objective.toLowerCase()}.`}
            summary="Antes da execução, você revisa o que a IA vai montar com base no briefing atual."
            steps={plannerSteps}
            settings={plannerSettings}
            parameters={plannerParameters}
            note="Se o prompt automático estiver em modo manual, você ainda revisa o texto antes da geração final."
            continueLabel="Continuar com o post"
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
        <div className="creator-loading-panel creator-workspace-note">
          <div className="helper-note-inline">EditexAI está estruturando o conteúdo...</div>
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "42%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "86%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "73%" }} />
        </div>
      )}

      {/* ✅ NOVO: etapa inline para prompt (sem modal) */}
      {inlinePromptOpen && promptEnabled && !autoApply && (
        <div className="creator-inline-panel">
          <div className="creator-inline-panel-header">
            <strong>Prompt gerado</strong>
            <p>Revise o texto antes de aplicar. Esse passo deixa a geração mais previsível sem sair do workspace.</p>
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

      {/* ✅ NOVO: transparência “ver prompt usado” */}
      {lastPromptUsed && (
        <div className="creator-inline-panel">
          <button
            onClick={() => setShowPromptUsed((v) => !v)}
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

              <div className="creator-zone-copy">
                Ajustes de prompt continuam disponíveis para refinar tom, tamanho, emojis e gerar uma nova versão.
              </div>
            </div>
          )}
        </div>
      )}

      {!displayResult && !isBusy && !plannerOpen ? (
        <div className="state-ea creator-empty-state">
          <p className="state-ea-title">Nenhum post gerado ainda</p>
          <div className="state-ea-text">
            Preencha o briefing, revise o planner e gere a primeira versão. Depois, salve no projeto e continue no editor com a base do post já preservada.
          </div>
          <div className="state-ea-actions">
            <button
              className="btn-ea btn-primary btn-sm"
              onClick={openPlanner}
              disabled={isBusy || !theme.trim() || !hasCredits}
            >
              Revisar plano e gerar
            </button>
            <Link href="/projects" className="btn-link-ea btn-ghost btn-sm">
              Ver projetos
            </Link>
          </div>
        </div>
      ) : null}

      {displayResult && (
        <div className="creator-result-stack">
          <div className="creator-result-header">
            <p className="section-kicker">Resultado</p>
            <div className="creator-result-title">Post pronto para revisar e salvar</div>
            <p className="creator-result-copy">
              Revise legenda, variações e próximos passos antes de salvar no projeto e levar a peça para o editor.
            </p>
            {resultSourceNote ? (
              <div className={resultSourceNote.tone === "warning" ? "inline-alert inline-alert-warning" : "helper-note-inline"}>
                {resultSourceNote.text}
              </div>
            ) : null}
          </div>

          <div className="creator-planner-field-grid creator-post-result-summary-grid">
            <div className="creator-planner-field">
              <span>Legenda principal</span>
              <strong>{caption.trim().length} caracteres prontos para revisão</strong>
            </div>
            <div className="creator-planner-field">
              <span>Hashtags</span>
              <strong>{hashtags.length} conectadas ao post</strong>
            </div>
            <div className="creator-planner-field">
              <span>Variações</span>
              <strong>{displayResult.variations.length} opções para iteração</strong>
            </div>
            <div className="creator-planner-field">
              <span>Próxima ação</span>
              <strong>{hasSavedProject && !needsProjectSync ? "Abrir no editor" : "Salvar no projeto"}</strong>
            </div>
          </div>

          <div className="creator-output-grid">
          <div className="creator-output-card creator-output-card--wide">
            <div className="creator-output-card-title">Legenda</div>
            <div className="result-copy-prewrap">{caption}</div>
            <div className="creator-output-card-actions">
              <button className="btn-ea btn-ghost btn-sm" onClick={() => copyText(caption, "Legenda")}>
                Copiar legenda
              </button>
            </div>
          </div>

          <div className="creator-output-card">
            <div className="creator-output-card-title">Hashtags</div>
            <div className="result-copy-prewrap">{hashtags.join(" ")}</div>
            <button
              className="btn-ea btn-ghost btn-sm"
              onClick={() => copyText(hashtags.join(" "), "Hashtags")}
            >
              Copiar hashtags
            </button>
          </div>

          <div className="creator-output-card">
            <div className="creator-output-card-title">CTA</div>
            <div>{displayResult.cta}</div>
          </div>

          <div className="creator-output-card">
            <div className="creator-output-card-title">Sugestão de mídia</div>
            <div>{displayResult.mediaSuggestion}</div>
          </div>

          <div className="creator-output-card creator-output-card--wide">
            <div className="creator-output-card-title">Variações</div>
            <div className="creator-output-card-list">
              {displayResult.variations.map((variation, idx) => (
                <div
                  key={`${variation}-${idx}`}
                  className="creator-output-card-list-item"
                >
                  <div className="result-copy-prewrap">{variation}</div>
                  <button
                    className="btn-ea btn-ghost btn-sm"
                    onClick={() => applyVariationAsPrimary(variation)}
                  >
                    Usar esta
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="creator-output-card creator-output-card--wide">
            <div className="creator-output-card-title">Checklist da plataforma</div>
            <ul>
              {displayResult.platformChecklist.map((item, idx) => (
                <li key={`${item}-${idx}`}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="postgen-panel creator-next-step-panel">
            <div className="postgen-title">Próximos passos</div>
            <div className="creator-next-step-copy">
              Fluxo recomendado: revisar a peça → salvar no projeto → continuar no editor → salvar checkpoint → registrar exported.
            </div>
            {hasSavedProject && !needsProjectSync ? (
              <div className="creator-feedback-note creator-feedback-note-muted">
                Projeto sincronizado. O editor vai receber legenda, CTA e hashtags preservados neste fluxo hero.
              </div>
            ) : null}
            <div className="postgen-actions">
              <button
                className="btn-ea btn-primary"
                onClick={() => {
                  if (savedProjectId && !needsProjectSync) {
                    router.push(`/editor/${savedProjectId}?source=creator_post&handoff=saved`);
                    return;
                  }
                  void persistProject(true);
                }}
                disabled={saving}
              >
                {saving
                  ? "Sincronizando..."
                  : !savedProjectId
                    ? "Salvar e abrir no Editor"
                    : needsProjectSync
                      ? "Atualizar projeto e abrir no Editor"
                      : "Abrir no Editor"}
              </button>
              {!hasSavedProject || needsProjectSync ? (
                <button className="btn-ea btn-secondary" onClick={() => void persistProject(false)} disabled={saving}>
                  {saving ? "Salvando..." : savedProjectId ? "Atualizar projeto salvo" : "Salvar projeto"}
                </button>
              ) : null}
              <button
                className="btn-ea btn-ghost"
                onClick={openPlanner}
                disabled={isBusy || !theme.trim() || !hasCredits}
              >
                Gerar novamente
              </button>
              <a href="/projects" className="btn-link-ea btn-ghost">
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

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeHashtags(value: unknown) {
  return normalizeStringArray(value)
    .map((item) => item.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((item) => `#${item.replace(/\s+/g, "")}`);
}

function normalizeLegacyVariants(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && typeof (item as any).text === "string") {
        return String((item as any).text).trim();
      }
      return "";
    })
    .filter(Boolean);
}

function normalizeCreatorPostResult(
  input: CreatorPostApiResult | null | undefined,
  fallbackRawText: string,
  platform: string
): CreatorPostResult | null {
  const source = input || {};
  const caption =
    (typeof source.caption === "string" && source.caption.trim()) ||
    (typeof fallbackRawText === "string" && fallbackRawText.trim()) ||
    "";
  if (!caption) return null;

  const hashtags = normalizeHashtags(source.hashtags);
  const variationsFromMain = normalizeStringArray(source.variations);
  const variationsFromLegacy = normalizeLegacyVariants(source.variants);
  const variations = (variationsFromMain.length ? variationsFromMain : variationsFromLegacy).slice(0, 4);

  const checklistFromPayload = normalizeStringArray(source.platformChecklist);
  const fallbackChecklist = PLATFORM_CHECKLISTS[platform] || [
    "Comece com um gancho claro na primeira linha.",
    "Mantenha o texto objetivo para leitura mobile.",
    "Finalize com CTA direto para a próxima ação.",
  ];
  const platformChecklist = checklistFromPayload.length > 0 ? checklistFromPayload : fallbackChecklist;

  return {
    caption,
    hashtags,
    cta:
      (typeof source.cta === "string" && source.cta.trim()) ||
      "Comente sua opinião e compartilhe com quem precisa ver este conteúdo.",
    mediaSuggestion:
      (typeof source.mediaSuggestion === "string" && source.mediaSuggestion.trim()) ||
      "Use imagem ou vídeo alinhado ao tema para reforçar a mensagem.",
    variations: variations.length > 0 ? variations : [caption, `${caption} (variação alternativa)`],
    platformChecklist,
  };
}




