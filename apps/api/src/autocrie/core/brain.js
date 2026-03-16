// apps/api/src/autocrie/core/brain.js
// Núcleo do Autocrie – inteligência interna (PASSO 10)
// Orquestra múltiplos provedores e ferramentas (busca web, checagem, geração etc.)
// Fonte de verdade de IA: ../../ai/index.js (dispatcher)

import { generateText } from "../../aiProviders/index.js";
import { webSearch } from "../../ai/search/index.js";

function isMockEnabled() {
  const v = String(process.env.AI_MOCK || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function mockUsage() {
  return {
    prompt_tokens: 5,
    completion_tokens: 20,
    total_tokens: 25,
  };
}

export class AutocrieBrain {
  /**
   * Execução padronizada para features de IA.
   * Retorna { output, provider, model, meta }
   */
  static async execute({ feature, input, user, plan, context = {} }) {
    switch (feature) {
      case "text_generate":
        return this.textGenerate({ input, user, plan, context });
      case "fact_check":
        return this.factCheck({ input, user, plan, context });
      default:
        throw new Error(`Unsupported feature: ${feature}`);
    }
  }

  static async textGenerate({ input, user, plan, context = {} }) {
    if (isMockEnabled()) {
      const promptText = String(input?.prompt || "");
      const lowerPrompt = promptText.toLowerCase();
      const isPromptBuilder =
        lowerPrompt.includes("finalprompt") || lowerPrompt.includes("promptbuilder");
      const isCreatorPost =
        promptText.includes("\"caption\"") ||
        promptText.includes("platformChecklist") ||
        promptText.includes("hashtags");

      if (isPromptBuilder) {
        const payload = {
          finalPrompt:
            "Gere um post completo seguindo o checklist da plataforma e responda em JSON estrito.",
          notes: ["Inclua CTA claro.", "Use hashtags adequadas a plataforma."],
          estimatedOutput: "caption|hashtags|cta|checklist",
        };

        return {
          output: { text: JSON.stringify(payload) },
          provider: "mock",
          model: "mock-model",
          meta: { usage: mockUsage() },
        };
      }

      if (isCreatorPost) {
        const payload = {
          caption: "Legenda mock para Creator Post.",
          hashtags: ["#autocrie", "#creator", "#socialmedia"],
          cta: "Comente o que achou e compartilhe com um amigo.",
          mediaSuggestion: "Sugestao de imagem mock relacionada ao tema.",
          variations: [
            "Variacao 1: legenda alternativa para teste.",
            "Variacao 2: outra alternativa de legenda.",
          ],
          platformChecklist: ["Hook inicial forte.", "Hashtags no final.", "CTA claro."],
        };

        return {
          output: { text: JSON.stringify(payload) },
          provider: "mock",
          model: "mock-model",
          meta: { usage: mockUsage() },
        };
      }

      return {
        output: { text: "Resposta mock: geracao de texto simulada." },
        provider: "mock",
        model: "mock-model",
        meta: { usage: mockUsage() },
      };
    }

    const system = "Você é a Autocrie.ai (Editor AI Creator). Gere uma resposta direta e útil.";
    const prompt = String(input?.prompt || "").trim();

    if (!prompt) {
      return {
        output: { text: "" },
        provider: "none",
        model: "none",
        meta: { error: "prompt é obrigatório" },
      };
    }

    // Como o dispatcher pode não aceitar "system" separado, embutimos no prompt.
    const combinedPrompt = `${system}\n\n${prompt}`;

    const r = await generateText({
      input: {
        prompt: combinedPrompt,
        language: input?.language || "pt-BR",
        maxTokens: 700,
        idempotencyKey: input?.idempotencyKey || context?.idempotencyKey || undefined,
      },
      user,
      plan,
      routing: context?.routing || null,
    });

    // Normalização defensiva (caso o dispatcher mude o shape do retorno)
    const text =
      typeof r?.text === "string"
        ? r.text
        : typeof r?.output?.text === "string"
          ? r.output.text
          : "";

    return {
      output: { text },
      provider: r?.provider || "unknown",
      model: r?.model || "unknown",
      meta: { usage: r?.usage || null },
    };
  }

  /**
   * Anti Fake News / Fact-check
   * - Busca em fontes diversas via provedor de pesquisa
   * - Pede ao LLM para classificar e justificar citando as fontes (URLs)
   */
  static async factCheck({ input, user, plan, context = {} }) {
    if (isMockEnabled()) {
      const claim = String(input?.claim || "").trim();
      const summary = claim
        ? "Resumo mock: verificacao simulada sem fontes."
        : "claim e obrigatorio";

      return {
        output: {
          verdict: "INSUFFICIENT",
          confidence: 0,
          summary,
          sources: [],
          citations: [],
        },
        provider: "mock",
        model: "mock-model",
        meta: { usage: mockUsage(), search_provider: "mock" },
      };
    }

    const claim = String(input?.claim || "").trim();
    if (!claim) {
      return {
        output: { verdict: "INSUFFICIENT", confidence: 0, summary: "claim é obrigatório", sources: [], citations: [] },
        provider: "none",
        model: "none",
        meta: {},
      };
    }

    const searchQuery = input?.query || claim;
    const limit = clampInt(input?.sources_limit ?? 6, 1, 12);
    const disallowDomains = Array.isArray(input?.disallow_domains) ? input.disallow_domains : [];

    const search = await webSearch({ q: searchQuery, limit: Math.max(6, limit) });

    const sources = (search.items || [])
      .filter((s) => isAllowedUrl(s.url, disallowDomains))
      .slice(0, limit)
      .map((s) => ({
        title: s.title,
        url: s.url,
        snippet: s.snippet,
        source: s.source,
      }));

    const system = [
      "Você é a Autocrie.ai. Sua tarefa é checar veracidade de afirmações.",
      "Regras:",
      "- Não invente fatos.",
      "- Use APENAS as fontes fornecidas (URLs e snippets) para justificar.",
      "- Se as fontes não forem suficientes, responda 'INSUFFICIENT'.",
      "- Retorne JSON estrito com campos: verdict (TRUE|FALSE|MIXED|INSUFFICIENT), confidence (0-100), summary, citations (array de urls).",
    ].join("\n");

    const prompt = [
      `AFIRMAÇÃO: ${claim}`,
      "",
      "FONTES (use como evidência):",
      ...sources.map((s, i) => `${i + 1}. ${s.title}\n${s.url}\n${s.snippet}`),
      "",
      "Responda somente com JSON.",
    ].join("\n");

    const combinedPrompt = `${system}\n\n${prompt}`;

    const r = await generateText({
      input: {
        prompt: combinedPrompt,
        language: input?.language || "pt-BR",
        maxTokens: 550,
        idempotencyKey: input?.idempotencyKey || context?.idempotencyKey || undefined,
      },
      user,
      plan,
      routing: context?.routing || null,
    });

    const rawText =
      typeof r?.text === "string"
        ? r.text
        : typeof r?.output?.text === "string"
          ? r.output.text
          : "";

    const parsed = safeJsonParse(rawText);
    const verdict = normalizeVerdict(parsed?.verdict);
    const confidence = clampInt(parsed?.confidence, 0, 100);
    const summary = typeof parsed?.summary === "string" ? parsed.summary : rawText;

    const citations = Array.isArray(parsed?.citations)
      ? parsed.citations.filter((u) => typeof u === "string")
      : [];

    return {
      output: {
        verdict,
        confidence,
        summary,
        sources,
        citations,
      },
      provider: r?.provider || "unknown",
      model: r?.model || "unknown",
      meta: { usage: r?.usage || null, search_provider: process.env.SEARCH_PROVIDER || "serper" },
    };
  }
}

function safeJsonParse(text) {
  try {
    const t = String(text || "").trim();
    const m = t.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function normalizeVerdict(v) {
  const s = String(v || "").toUpperCase().trim();
  if (["TRUE", "FALSE", "MIXED", "INSUFFICIENT"].includes(s)) return s;
  if (s === "INSUFFICIENTE") return "INSUFFICIENT";
  return "INSUFFICIENT";
}

function clampInt(n, min, max) {
  const x = Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0;
  return Math.max(min, Math.min(max, x));
}

function isAllowedUrl(url, disallowDomains) {
  try {
    const u = new URL(String(url));
    const host = u.hostname.toLowerCase();
    return !disallowDomains.some((d) => {
      const dd = String(d).toLowerCase();
      return host === dd || host.endsWith(`.${dd}`);
    });
  } catch {
    return false;
  }
}