import { ProviderNotConfiguredError, AIProviderError } from "./providerBase.js";

const OPENAI_API_BASE = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL_TEXT = process.env.OPENAI_MODEL_TEXT || "gpt-4.1-mini";

/**
 * Implementação minimalista via fetch (sem dependência extra).
 * Usa Responses API quando disponível no endpoint /responses.
 */
export async function openaiGenerateText({ prompt, system, temperature = 0.7, maxOutputTokens = 512 }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ProviderNotConfiguredError("openai");

  const url = `${OPENAI_API_BASE.replace(/\/$/, "")}/responses`;
  const input = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt }
  ];

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL_TEXT,
      input,
      temperature,
      max_output_tokens: maxOutputTokens
    })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AIProviderError("OpenAI request failed", { status: resp.status, body: text });
  }

  const data = await resp.json();
  // Responses API pode retornar output_text (conveniente)
  const outputText = data.output_text || extractOutputText(data);
  const usage = data.usage || {};
  return {
    text: outputText || "",
    model: data.model || OPENAI_MODEL_TEXT,
    usage: {
      input_tokens: usage.input_tokens ?? null,
      output_tokens: usage.output_tokens ?? null
    },
    raw: data
  };
}

function extractOutputText(data) {
  try {
    // fallback para diferentes shapes
    const out = data?.output?.[0]?.content?.map(c => c?.text).filter(Boolean).join("\n");
    return out;
  } catch {
    return "";
  }
}
