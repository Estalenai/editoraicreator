// Núcleo do Autocrie – inteligência interna (PASSO 10)
// Orquestra múltiplos provedores e ferramentas (busca web, checagem, geração etc.)

import { openaiGenerateText } from "../../ai/providers/openaiProvider.js";
import { geminiGenerateText } from "../../ai/providers/geminiProvider.js";
import { anthropicGenerateText } from "../../ai/providers/anthropicProvider.js";
import { webSearch } from "../../ai/search/index.js";

function pickLLM() {
  const p = (process.env.AI_DEFAULT_PROVIDER || "openai").toLowerCase();
  if (p === "openai") return "openai";
  if (p === "gemini") return "gemini";
  if (p === "anthropic") return "anthropic";
  return "openai";
}

async function callLLM(provider, args) {
  if (provider === "openai") return openaiGenerateText(args);
  if (provider === "gemini") return geminiGenerateText(args);
  if (provider === "anthropic") return anthropicGenerateText(args);
  return openaiGenerateText(args);
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

  static async textGenerate({ input }) {
    const provider = pickLLM();
    const system = "Você é a Autocrie.ai (Editor AI Creator). Gere uma resposta direta e útil.";
    const prompt = input?.prompt || "";

    const r = await callLLM(provider, { prompt, system, temperature: 0.7, maxOutputTokens: 700 });
    return {
      output: { text: r.text },
      provider,
      model: r.model,
      meta: { usage: r.usage || null }
    };
  }

  /**
   * Anti Fake News / Fact-check
   * - Busca em fontes diversas via provedor de pesquisa
   * - Pede ao LLM para classificar e justificar citando as fontes (URLs)
   */
  static async factCheck({ input }) {
    const claim = String(input?.claim || "").trim();
    if (!claim) {
      return { output: { verdict: "unknown", confidence: 0, summary: "claim é obrigatório", sources: [] }, provider: "none", model: "none", meta: {} };
    }

    const searchQuery = input?.query || claim;
    const limit = clampInt(input?.sources_limit ?? 6, 1, 12);
    const disallowDomains = Array.isArray(input?.disallow_domains) ? input.disallow_domains : [];

    const search = await webSearch({ q: searchQuery, limit: Math.max(6, limit) });

    const sources = (search.items || [])
      .filter(s => isAllowedUrl(s.url, disallowDomains))
      .slice(0, limit)
      .map(s => ({
      title: s.title,
      url: s.url,
      snippet: s.snippet,
      source: s.source
    }));

    const provider = pickLLM();
    const system = [
      "Você é a Autocrie.ai. Sua tarefa é checar veracidade de afirmações.",
      "Regras:",
      "- Não invente fatos.",
      "- Use APENAS as fontes fornecidas (URLs e snippets) para justificar.",
      "- Se as fontes não forem suficientes, responda 'INSUFFICIENT'.",
      "- Retorne JSON estrito com campos: verdict (TRUE|FALSE|MIXED|INSUFFICIENT), confidence (0-100), summary, citations (array de urls)."
    ].join("\n");

    const prompt = [
      `AFIRMAÇÃO: ${claim}`,
      "",
      "FONTES (use como evidência):",
      ...sources.map((s, i) => `${i + 1}. ${s.title}\n${s.url}\n${s.snippet}`),
      "",
      "Responda somente com JSON."
    ].join("\n");

    const r = await callLLM(provider, { prompt, system, temperature: 0.2, maxOutputTokens: 550 });

    const parsed = safeJsonParse(r.text);
    const verdict = normalizeVerdict(parsed?.verdict);
    const confidence = clampInt(parsed?.confidence, 0, 100);
    const summary = typeof parsed?.summary === "string" ? parsed.summary : r.text;

    const citations = Array.isArray(parsed?.citations) ? parsed.citations.filter(u => typeof u === "string") : [];

    return {
      output: {
        verdict,
        confidence,
        summary,
        sources,
        citations
      },
      provider,
      model: r.model,
      meta: { usage: r.usage || null, search_provider: process.env.SEARCH_PROVIDER || "serper" }
    };
  }
}

function safeJsonParse(text) {
  try {
    const t = String(text || "").trim();
    // tenta extrair primeiro bloco JSON
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
    return !disallowDomains.some(d => host === String(d).toLowerCase() || host.endsWith(`.${String(d).toLowerCase()}`));
  } catch {
    return false;
  }
}
