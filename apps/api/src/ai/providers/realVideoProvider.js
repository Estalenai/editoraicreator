import { AIProviderError, ProviderNotConfiguredError } from "./providerBase.js";
import { requestJsonWithCircuitBreaker } from "../../utils/httpClient.js";

const RUNWAY_API_BASE = String(process.env.RUNWAY_API_BASE_URL || "https://api.runwayml.com").replace(/\/+$/, "");
const RUNWAY_MODEL = String(process.env.RUNWAY_MODEL || "runway-gen3");

function getApiKey() {
  const key = String(process.env.RUNWAY_API_KEY || "").trim();
  if (!key) throw new ProviderNotConfiguredError("runway");
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
  if (!jobId) throw new AIProviderError("runway_invalid_generate_response");
  return {
    ok: true,
    jobId: String(jobId),
    status: mapStatus(data?.status),
    provider: "runway",
    model: data?.model || RUNWAY_MODEL,
    estimated_seconds: Number(data?.eta_seconds || data?.estimated_seconds || 30),
    assets: {
      preview_url: data?.preview_url || data?.assets?.preview_url || "https://example.com/mock-preview.mp4",
    },
  };
}

function parseStatus(jobId, data) {
  const normalizedStatus = mapStatus(data?.status);
  return {
    ok: true,
    jobId: String(data?.id || data?.task_id || data?.job_id || data?.jobId || jobId),
    status: normalizedStatus,
    provider: "runway",
    model: data?.model || RUNWAY_MODEL,
    output: {
      video_url:
        data?.output?.video_url ||
        data?.output?.url ||
        data?.result?.video_url ||
        data?.assets?.video_url ||
        null,
      thumbnail_url: data?.output?.thumbnail_url || data?.assets?.thumbnail_url || null,
    },
  };
}

export async function generateVideoReal({
  prompt,
  imageUrl = null,
  durationSec = 8,
  aspectRatio = "16:9",
  quality = "medium",
  idempotencyKey,
}) {
  const apiKey = getApiKey();
  const data = await requestJsonWithCircuitBreaker({
    service: "runway",
    operation: "video_generate",
    url: `${RUNWAY_API_BASE}/v1/tasks`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
    },
    body: {
      taskType: "generate_video",
      model: RUNWAY_MODEL,
      input: {
        promptText: String(prompt || "").trim(),
        promptImage: imageUrl || undefined,
        duration: Number(durationSec || 8),
        ratio: String(aspectRatio || "16:9"),
        quality: String(quality || "medium"),
      },
    },
    timeoutMs: 15_000,
    retries: 2,
  });

  return parseGenerate(data);
}

export async function getVideoStatusReal({ jobId, idempotencyKey }) {
  const safeJobId = String(jobId || "").trim();
  if (!safeJobId) throw new AIProviderError("invalid_video_job_id");
  const apiKey = getApiKey();

  const data = await requestJsonWithCircuitBreaker({
    service: "runway",
    operation: "video_status",
    url: `${RUNWAY_API_BASE}/v1/tasks/${encodeURIComponent(safeJobId)}`,
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

