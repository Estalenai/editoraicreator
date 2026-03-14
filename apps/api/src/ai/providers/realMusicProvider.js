import { AIProviderError, ProviderNotConfiguredError } from "./providerBase.js";
import { requestJsonWithCircuitBreaker } from "../../utils/httpClient.js";

const SUNO_API_BASE = String(process.env.SUNO_API_BASE_URL || "https://api.suno.ai").replace(/\/+$/, "");
const SUNO_MODEL = String(process.env.SUNO_MODEL || "suno-v4");

function getApiKey() {
  const key = String(process.env.SUNO_API_KEY || "").trim();
  if (!key) throw new ProviderNotConfiguredError("suno");
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
  const jobId = data?.id || data?.task_id || data?.job_id || data?.jobId;
  if (!jobId) throw new AIProviderError("suno_invalid_generate_response");
  return {
    ok: true,
    jobId: String(jobId),
    status: mapStatus(data?.status),
    provider: "suno",
    model: data?.model || SUNO_MODEL,
    estimated_seconds: Number(data?.eta_seconds || data?.estimated_seconds || 20),
    assets: {
      preview_url: data?.preview_url || data?.assets?.preview_url || "https://example.com/mock-preview.mp3",
    },
  };
}

function parseStatus(jobId, data) {
  return {
    ok: true,
    jobId: String(data?.id || data?.task_id || data?.job_id || data?.jobId || jobId),
    status: mapStatus(data?.status),
    provider: "suno",
    model: data?.model || SUNO_MODEL,
    output: {
      audio_url: data?.output?.audio_url || data?.result?.audio_url || data?.audio_url || null,
      waveform_url: data?.output?.waveform_url || data?.result?.waveform_url || null,
    },
  };
}

export async function generateMusicReal({
  prompt,
  lyrics = "",
  style = "",
  durationSec = 30,
  quality = "medium",
  idempotencyKey,
}) {
  const apiKey = getApiKey();
  const data = await requestJsonWithCircuitBreaker({
    service: "suno",
    operation: "music_generate",
    url: `${SUNO_API_BASE}/v1/generate`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
    },
    body: {
      model: SUNO_MODEL,
      prompt: String(prompt || "").trim(),
      lyrics: String(lyrics || "").trim() || undefined,
      style: String(style || "").trim() || undefined,
      duration_sec: Number(durationSec || 30),
      quality: String(quality || "medium"),
    },
    timeoutMs: 15_000,
    retries: 2,
  });

  return parseGenerate(data);
}

export async function getMusicStatusReal({ jobId, idempotencyKey }) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) throw new AIProviderError("invalid_music_job_id");
  const apiKey = getApiKey();
  const data = await requestJsonWithCircuitBreaker({
    service: "suno",
    operation: "music_status",
    url: `${SUNO_API_BASE}/v1/generate/${encodeURIComponent(safeJobId)}`,
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
    },
    timeoutMs: 10_000,
    retries: 1,
  });

  return parseStatus(safeJobId, data);
}

