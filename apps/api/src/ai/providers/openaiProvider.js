import { AIProviderError, ProviderNotConfiguredError } from "./providerBase.js";

const OPENAI_API_BASE = String(process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_MODEL_TEXT = String(process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini");

function getOpenAIKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) throw new ProviderNotConfiguredError("openai");
  return key;
}

async function callResponsesApi({ input, maxOutputTokens = 500, temperature = 0.3 }) {
  const apiKey = getOpenAIKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${OPENAI_API_BASE}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL_TEXT,
        input,
        temperature,
        max_output_tokens: maxOutputTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new AIProviderError("openai_request_failed", {
        status: response.status,
        body: bodyText || null,
      });
    }

    const data = await response.json();
    const usage = data?.usage || {};
    return {
      text: data?.output_text || "",
      model: data?.model || OPENAI_MODEL_TEXT,
      usage: {
        input_tokens: Number(usage.input_tokens || 0),
        output_tokens: Number(usage.output_tokens || 0),
      },
      raw: data,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new AIProviderError("openai_timeout", { status: 504 });
    }
    if (error instanceof AIProviderError || error instanceof ProviderNotConfiguredError) throw error;
    throw new AIProviderError("openai_unknown_error", { message: error?.message || "unknown_error" });
  } finally {
    clearTimeout(timeout);
  }
}

export const openaiProvider = {
  async generateText({ prompt, language = "pt-BR", maxTokens = 500 }) {
    const userPrompt = String(prompt || "").trim();
    const lang = String(language || "pt-BR").trim();
    const input = [
      {
        role: "system",
        content: `You are an assistant for Creator Studio. Reply in ${lang}.`,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ];

    const response = await callResponsesApi({
      input,
      maxOutputTokens: Number(maxTokens || 500),
      temperature: 0.35,
    });

    return {
      output: { text: response.text },
      provider: "openai",
      model: response.model,
      meta: { usage: response.usage },
    };
  },

  async factCheck({ text, language = "pt-BR" }) {
    const claim = String(text || "").trim();
    const lang = String(language || "pt-BR").trim();
    const instruction = [
      `Fact-check the following claim in ${lang}.`,
      "Return concise JSON with fields: verdict, confidence (0-100), summary, citations (array of short strings).",
      `Claim: ${claim}`,
    ].join("\n");

    const response = await callResponsesApi({
      input: [{ role: "user", content: instruction }],
      maxOutputTokens: 800,
      temperature: 0.1,
    });

    let parsed = null;
    try {
      parsed = JSON.parse(response.text);
    } catch {
      parsed = null;
    }

    return {
      output: {
        verdict: parsed?.verdict || "INSUFFICIENT",
        confidence: Number(parsed?.confidence || 60),
        summary: parsed?.summary || response.text || "No summary",
        citations: Array.isArray(parsed?.citations) ? parsed.citations : [],
        sources: [],
      },
      provider: "openai",
      model: response.model,
      meta: {
        usage: response.usage,
        search_provider: "none",
      },
    };
  },
};
