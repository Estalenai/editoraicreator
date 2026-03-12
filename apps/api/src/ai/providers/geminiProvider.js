import { ProviderNotConfiguredError, AIProviderError } from "./providerBase.js";

const GEMINI_API_BASE = process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com";
const GEMINI_MODEL_TEXT = process.env.GEMINI_MODEL_TEXT || "gemini-1.5-flash";

/**
 * Adapter simples do Gemini via REST.
 * Docs variam; mantemos interface estável e erro claro se não configurado.
 */
export async function geminiGenerateText({ prompt, system }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new ProviderNotConfiguredError("gemini");

  const url = `${GEMINI_API_BASE.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(GEMINI_MODEL_TEXT)}:generateContent?key=${encodeURIComponent(key)}`;

  const contents = [];
  if (system) contents.push({ role: "user", parts: [{ text: `SYSTEM: ${system}` }] });
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents })
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AIProviderError("Gemini request failed", { status: resp.status, body: text });
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join("\n") || "";
  return { text, model: GEMINI_MODEL_TEXT, usage: null, raw: data };
}
