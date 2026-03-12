import { ProviderNotConfiguredError, AIProviderError } from "./providerBase.js";

const ANTHROPIC_API_BASE = process.env.ANTHROPIC_API_BASE_URL || "https://api.anthropic.com";
const ANTHROPIC_MODEL_TEXT = process.env.ANTHROPIC_MODEL_TEXT || "claude-3-5-sonnet-20240620";

/**
 * Adapter mínimo do Anthropic Messages API.
 */
export async function anthropicGenerateText({ prompt, system, maxTokens = 512 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ProviderNotConfiguredError("anthropic");

  const url = `${ANTHROPIC_API_BASE.replace(/\/$/, "")}/v1/messages`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL_TEXT,
      max_tokens: maxTokens,
      system: system || undefined,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AIProviderError("Anthropic request failed", { status: resp.status, body: text });
  }

  const data = await resp.json();
  const text = data?.content?.map(c => c.text).filter(Boolean).join("\n") || "";
  return { text, model: ANTHROPIC_MODEL_TEXT, usage: data.usage || null, raw: data };
}
