import { AIProviderError, ProviderNotConfiguredError } from "./providerBase.js";
import { requestJsonWithCircuitBreaker } from "../../utils/httpClient.js";

const ELEVENLABS_API_BASE = String(process.env.ELEVENLABS_API_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
const ELEVENLABS_MODEL = String(process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2");

function getApiKey() {
  const key = String(process.env.ELEVENLABS_API_KEY || "").trim();
  if (!key) throw new ProviderNotConfiguredError("elevenlabs");
  return key;
}

function mapStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (["completed", "succeeded", "success"].includes(normalized)) return "succeeded";
  if (["failed", "error", "canceled"].includes(normalized)) return "failed";
  if (["queued", "pending", "running", "processing", "in_progress"].includes(normalized)) return "queued";
  return normalized || "queued";
}

function parseGenerate(data) {
  const jobId = data?.id || data?.job_id || data?.jobId || data?.request_id;
  if (!jobId) throw new AIProviderError("elevenlabs_invalid_generate_response");
  return {
    ok: true,
    jobId: String(jobId),
    status: mapStatus(data?.status),
    provider: "elevenlabs",
    model: data?.model || ELEVENLABS_MODEL,
    estimated_seconds: Number(data?.eta_seconds || data?.estimated_seconds || 5),
    assets: {
      preview_url: data?.preview_url || data?.assets?.preview_url || "https://example.com/mock-preview.mp3",
    },
  };
}

function parseStatus(jobId, data) {
  return {
    ok: true,
    jobId: String(data?.id || data?.job_id || data?.jobId || jobId),
    status: mapStatus(data?.status),
    provider: "elevenlabs",
    model: data?.model || ELEVENLABS_MODEL,
    output: {
      audio_url: data?.output?.audio_url || data?.audio_url || null,
      transcript: data?.output?.transcript || data?.transcript || null,
    },
  };
}

export async function generateVoiceReal({
  text,
  language = "pt-BR",
  voiceId = "default",
  stability = 0.5,
  similarityBoost = 0.75,
  style = 0.2,
  format = "mp3",
  quality = "medium",
  idempotencyKey,
}) {
  const apiKey = getApiKey();
  const data = await requestJsonWithCircuitBreaker({
    service: "elevenlabs",
    operation: "voice_generate",
    url: `${ELEVENLABS_API_BASE}/v1/speech/generate`,
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
    },
    body: {
      model: ELEVENLABS_MODEL,
      text: String(text || "").trim(),
      language: String(language || "pt-BR"),
      voice_id: String(voiceId || "default"),
      voice_settings: {
        stability: Number(stability),
        similarity_boost: Number(similarityBoost),
        style: Number(style),
      },
      format: String(format || "mp3"),
      quality: String(quality || "medium"),
    },
    timeoutMs: 15_000,
    retries: 2,
  });

  return parseGenerate(data);
}

export async function getVoiceStatusReal({ jobId, idempotencyKey }) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) throw new AIProviderError("invalid_voice_job_id");
  const apiKey = getApiKey();

  const data = await requestJsonWithCircuitBreaker({
    service: "elevenlabs",
    operation: "voice_status",
    url: `${ELEVENLABS_API_BASE}/v1/speech/generate/${encodeURIComponent(safeJobId)}`,
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
    },
    timeoutMs: 10_000,
    retries: 1,
  });

  return parseStatus(safeJobId, data);
}

