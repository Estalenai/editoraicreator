import { AIProviderError, ProviderNotConfiguredError } from "./providerBase.js";
import { requestJsonWithCircuitBreaker } from "../../utils/httpClient.js";

const OPENAI_API_BASE = String(process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_MODEL_TEXT = String(process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini");

function getApiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) throw new ProviderNotConfiguredError("openai");
  return key;
}

function buildHeaders({ apiKey, idempotencyKey }) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey);
  return headers;
}

function parseTextResponse(data) {
  const usage = data?.usage || {};
  return {
    text: String(data?.output_text || "").trim(),
    model: data?.model || OPENAI_MODEL_TEXT,
    usage: {
      input_tokens: Number(usage.input_tokens || 0),
      output_tokens: Number(usage.output_tokens || 0),
    },
  };
}

async function callResponses({ input, temperature, maxTokens, idempotencyKey }) {
  const apiKey = getApiKey();
  const data = await requestJsonWithCircuitBreaker({
    service: "openai",
    operation: "responses",
    url: `${OPENAI_API_BASE}/responses`,
    method: "POST",
    headers: buildHeaders({ apiKey, idempotencyKey }),
    body: {
      model: OPENAI_MODEL_TEXT,
      input,
      temperature,
      max_output_tokens: Number(maxTokens || 500),
    },
    timeoutMs: 10_000,
    retries: 2,
  });
  return parseTextResponse(data);
}

export async function generateTextReal({ prompt, language = "pt-BR", maxTokens = 500, idempotencyKey }) {
  const userPrompt = String(prompt || "").trim();
  if (!userPrompt) throw new AIProviderError("invalid_prompt");
  const lang = String(language || "pt-BR").trim() || "pt-BR";

  const response = await callResponses({
    input: [
      { role: "system", content: `You are a concise writing assistant. Reply in ${lang}.` },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.35,
    maxTokens,
    idempotencyKey,
  });

  return {
    output: { text: response.text },
    provider: "openai",
    model: response.model,
    meta: { usage: response.usage },
  };
}

export async function factCheckReal({ text, query = "", language = "pt-BR", idempotencyKey }) {
  const claim = String(text || "").trim();
  if (!claim) throw new AIProviderError("invalid_claim");
  const lang = String(language || "pt-BR").trim() || "pt-BR";
  const extraQuery = String(query || "").trim();

  const prompt = [
    `Fact-check the claim in ${lang}.`,
    "Respond in strict JSON with fields: verdict, confidence, summary, citations.",
    `Claim: ${claim}`,
    extraQuery ? `Context query: ${extraQuery}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await callResponses({
    input: [{ role: "user", content: prompt }],
    temperature: 0.1,
    maxTokens: 800,
    idempotencyKey,
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
}

