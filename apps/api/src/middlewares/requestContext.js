import crypto from "node:crypto";

import { logger } from "../utils/logger.js";

const REQUEST_ID_HEADER = "x-request-id";
const CLIENT_ROUTE_HEADER = "x-client-route";
const CLIENT_SESSION_HEADER = "x-client-session-id";

function sanitizeRequestId(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.length > 120) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(normalized)) return null;
  return normalized;
}

function createRequestId() {
  return `req_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function getRouteLabel(req) {
  return String(req.originalUrl || req.url || req.path || "/");
}

export function requestContext(req, res, next) {
  const startedAt = Date.now();
  const requestId = sanitizeRequestId(req.get(REQUEST_ID_HEADER)) || createRequestId();
  const clientRoute = String(req.get(CLIENT_ROUTE_HEADER) || "").trim() || null;
  const clientSessionId = sanitizeRequestId(req.get(CLIENT_SESSION_HEADER)) || null;

  req.requestId = requestId;
  req.requestStartedAt = startedAt;
  req.clientRoute = clientRoute;
  req.clientSessionId = clientSessionId;

  res.setHeader("X-Request-Id", requestId);

  logger.info("request_started", {
    requestId,
    method: req.method,
    path: getRouteLabel(req),
    clientRoute,
    clientSessionId,
    ip: req.ip || null,
  });

  res.on("finish", () => {
    logger.info("request_finished", {
      requestId,
      method: req.method,
      path: getRouteLabel(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.id || null,
      clientRoute,
      clientSessionId,
    });
  });

  next();
}
