import { AIProviderError } from "../ai/providers/providerBase.js";
import { logger } from "./logger.js";

const circuitState = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value, max = 400) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function toProviderError(error, fallbackMessage) {
  if (error instanceof AIProviderError) return error;
  return new AIProviderError(fallbackMessage, {
    message: error?.message || fallbackMessage,
  });
}

function isRetriableError(error) {
  if (!error) return false;
  if (error?.name === "AbortError") return true;
  const status = Number(error?.details?.status || error?.status || 0);
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("network") || msg.includes("fetch failed") || msg.includes("timeout");
}

function getCircuit(key) {
  const current = circuitState.get(key) || { failures: 0, openedUntil: 0 };
  circuitState.set(key, current);
  return current;
}

function openCircuit({ key, openMs }) {
  const current = getCircuit(key);
  current.failures = 0;
  current.openedUntil = Date.now() + openMs;
  circuitState.set(key, current);
}

function resetCircuit(key) {
  circuitState.set(key, { failures: 0, openedUntil: 0 });
}

async function parseResponseBody(response) {
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  const bodyText = await response.text().catch(() => "");
  if (!bodyText) return null;
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(bodyText);
    } catch {
      return bodyText;
    }
  }
  return bodyText;
}

export async function requestJsonWithCircuitBreaker({
  service,
  operation,
  url,
  method = "GET",
  headers = {},
  body = undefined,
  timeoutMs = 10_000,
  retries = 2,
  retryBackoffMs = 250,
  circuitFailureThreshold = 3,
  circuitOpenMs = 30_000,
  fetchImpl = globalThis.fetch,
}) {
  if (!fetchImpl) {
    throw new AIProviderError("fetch_unavailable", { service, operation });
  }

  const safeService = String(service || "unknown");
  const safeOperation = String(operation || "request");
  const safeMethod = String(method || "GET").toUpperCase();
  const circuitKey = `${safeService}:${safeOperation}`;
  const circuit = getCircuit(circuitKey);

  if (circuit.openedUntil > Date.now()) {
    logger.warn("ai.http.circuit_open", {
      service: safeService,
      operation: safeOperation,
      opened_until: new Date(circuit.openedUntil).toISOString(),
    });
    throw new AIProviderError("circuit_open", {
      service: safeService,
      operation: safeOperation,
      opened_until: circuit.openedUntil,
    });
  }

  let lastError = null;
  const maxAttempts = Math.max(1, Number(retries || 0) + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    try {
      logger.debug("ai.http.request_attempt", {
        service: safeService,
        operation: safeOperation,
        method: safeMethod,
        attempt,
        max_attempts: maxAttempts,
        timeout_ms: timeoutMs,
      });

      const response = await fetchImpl(url, {
        method: safeMethod,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const parsedBody = await parseResponseBody(response);

      if (!response.ok) {
        throw new AIProviderError("upstream_http_error", {
          service: safeService,
          operation: safeOperation,
          status: response.status,
          body: truncate(typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)),
        });
      }

      resetCircuit(circuitKey);
      logger.info("ai.http.request_success", {
        service: safeService,
        operation: safeOperation,
        method: safeMethod,
        attempt,
        status: response.status,
      });
      return parsedBody;
    } catch (error) {
      const normalized =
        error?.name === "AbortError"
          ? new AIProviderError("upstream_timeout", {
              service: safeService,
              operation: safeOperation,
              status: 504,
            })
          : toProviderError(error, "upstream_request_failed");

      lastError = normalized;
      const retriable = isRetriableError(normalized);
      logger.warn("ai.http.request_failed", {
        service: safeService,
        operation: safeOperation,
        method: safeMethod,
        attempt,
        max_attempts: maxAttempts,
        retriable,
        code: normalized?.message || "upstream_request_failed",
        status: normalized?.details?.status || null,
      });

      if (!retriable || attempt >= maxAttempts) break;
      const backoffMs = retryBackoffMs * Math.pow(2, attempt - 1);
      await sleep(backoffMs);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  const current = getCircuit(circuitKey);
  const failures = Number(current.failures || 0) + 1;
  current.failures = failures;
  if (failures >= circuitFailureThreshold) {
    openCircuit({ key: circuitKey, openMs: circuitOpenMs });
    logger.error("ai.http.circuit_opened", {
      service: safeService,
      operation: safeOperation,
      failures,
      open_ms: circuitOpenMs,
    });
  } else {
    circuitState.set(circuitKey, current);
  }

  throw toProviderError(lastError, "upstream_request_failed");
}
