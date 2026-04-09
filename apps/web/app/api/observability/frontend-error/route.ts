import { NextRequest, NextResponse } from "next/server";
import { logWebEvent } from "../../../../lib/serverObservability";

export const dynamic = "force-dynamic";

function toSafeString(value: unknown, fallback = "") {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 400);
}

export async function POST(request: NextRequest) {
  const payload = await request.json().catch(() => null);
  const requestId = toSafeString(request.headers.get("x-request-id") || payload?.requestId, "frontend_event");

  logWebEvent("error", "frontend_error_captured", {
    requestId,
    event: toSafeString(payload?.event, "frontend_unknown_event"),
    route: toSafeString(payload?.route, request.nextUrl.pathname),
    sessionId: toSafeString(payload?.sessionId, "unknown_session"),
    message: toSafeString(payload?.message || payload?.reason || "frontend_error"),
    errorName: toSafeString(payload?.name, "Error"),
    source: toSafeString(payload?.source),
    line: Number(payload?.line || 0) || null,
    column: Number(payload?.column || 0) || null,
    stack: toSafeString(payload?.stack),
  });

  return NextResponse.json({ ok: true, requestId }, { status: 202 });
}
