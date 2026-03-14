import { AIProviderError, ProviderNotConfiguredError } from "./providerBase.js";
import { requestJsonWithCircuitBreaker } from "../../utils/httpClient.js";

const OPENAI_API_BASE = String(process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_MODEL_IMAGE = String(process.env.OPENAI_MODEL_IMAGE || "gpt-image-1");

function getApiKey() {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (!key) throw new ProviderNotConfiguredError("openai_image");
  return key;
}

function mapAspectToSize(aspectRatio) {
  switch (String(aspectRatio || "1:1").trim()) {
    case "16:9":
      return "1536x1024";
    case "9:16":
      return "1024x1536";
    case "1:1":
    default:
      return "1024x1024";
  }
}

function mapQuality(quality) {
  const q = String(quality || "medium").trim().toLowerCase();
  if (q === "high") return "high";
  if (q === "low") return "low";
  return "medium";
}

function normalizeImageUrls(data) {
  const items = Array.isArray(data?.data) ? data.data : [];
  const urls = items
    .map((item) => {
      if (typeof item?.url === "string" && item.url) return item.url;
      if (typeof item?.b64_json === "string" && item.b64_json) return `data:image/png;base64,${item.b64_json}`;
      return null;
    })
    .filter(Boolean);
  return urls;
}

async function callOpenAIImages({ body, idempotencyKey, operation }) {
  const apiKey = getApiKey();
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = String(idempotencyKey);

  const data = await requestJsonWithCircuitBreaker({
    service: "openai_image",
    operation,
    url: `${OPENAI_API_BASE}/images/generations`,
    method: "POST",
    headers,
    body,
    timeoutMs: 15_000,
    retries: 2,
  });

  const urls = normalizeImageUrls(data);
  if (!urls.length) throw new AIProviderError("openai_image_empty_response");
  return urls;
}

export async function generateImageReal({
  prompt,
  style = "default",
  aspectRatio = "1:1",
  quality = "medium",
  count = 1,
  idempotencyKey,
}) {
  const safePrompt = String(prompt || "").trim();
  if (!safePrompt) throw new AIProviderError("invalid_image_prompt");

  const urls = await callOpenAIImages({
    operation: "image_generate",
    idempotencyKey,
    body: {
      model: OPENAI_MODEL_IMAGE,
      prompt: `${safePrompt}\nStyle: ${String(style || "default").slice(0, 120)}`,
      size: mapAspectToSize(aspectRatio),
      quality: mapQuality(quality),
      n: Number(count || 1),
    },
  });

  return {
    images: urls.map((url) => ({ url, aspect_ratio: aspectRatio, quality })),
    provider: "openai",
    model: OPENAI_MODEL_IMAGE,
  };
}

export async function generateVariationReal({ imageUrl, prompt, strength = 0.35, idempotencyKey }) {
  const safeImageUrl = String(imageUrl || "").trim();
  const safePrompt = String(prompt || "").trim();
  if (!safeImageUrl || !safePrompt) throw new AIProviderError("invalid_image_variation_input");

  const urls = await callOpenAIImages({
    operation: "image_variation",
    idempotencyKey,
    body: {
      model: OPENAI_MODEL_IMAGE,
      prompt: [
        "Create a variation from this reference image URL.",
        `Reference: ${safeImageUrl}`,
        `Instruction: ${safePrompt}`,
        `Variation strength: ${Number(strength || 0.35)}`,
      ].join("\n"),
      size: "1024x1024",
      quality: "medium",
      n: 1,
    },
  });

  return {
    images: urls.map((url) => ({ url, source_image: safeImageUrl, strength: Number(strength || 0.35) })),
    provider: "openai",
    model: OPENAI_MODEL_IMAGE,
  };
}

