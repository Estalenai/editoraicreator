export type UnifiedAsyncState =
  | "queued"
  | "running"
  | "needs_attention"
  | "retrying"
  | "partially_failed"
  | "confirmed"
  | "manually_resolved";

export type UnifiedAsyncTone = "info" | "warning" | "danger" | "success";

export type UnifiedAsyncPresentation = {
  code: UnifiedAsyncState;
  label: string;
  detail: string;
  tone: UnifiedAsyncTone;
};

const PRESENTATION: Record<UnifiedAsyncState, UnifiedAsyncPresentation> = {
  queued: {
    code: "queued",
    label: "Queued",
    detail: "Registrado e aguardando processamento.",
    tone: "warning",
  },
  running: {
    code: "running",
    label: "Running",
    detail: "Em andamento com retorno ainda pendente.",
    tone: "warning",
  },
  needs_attention: {
    code: "needs_attention",
    label: "Needs attention",
    detail: "Exige revisão manual antes de seguir.",
    tone: "danger",
  },
  retrying: {
    code: "retrying",
    label: "Retrying",
    detail: "Tentando novamente com a mesma trilha rastreável.",
    tone: "warning",
  },
  partially_failed: {
    code: "partially_failed",
    label: "Partially failed",
    detail: "Parte do fluxo concluiu, mas ainda há exceção pendente.",
    tone: "danger",
  },
  confirmed: {
    code: "confirmed",
    label: "Confirmed",
    detail: "Concluído e confirmado pela trilha operacional.",
    tone: "success",
  },
  manually_resolved: {
    code: "manually_resolved",
    label: "Manually resolved",
    detail: "Fechado manualmente com trilha registrada.",
    tone: "success",
  },
};

export function normalizeUnifiedAsyncState(value: unknown): UnifiedAsyncState {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized in PRESENTATION) return normalized as UnifiedAsyncState;
  if (normalized.includes("queue") || normalized.includes("pend")) return "queued";
  if (normalized.includes("run") || normalized.includes("progress") || normalized.includes("review")) return "running";
  if (normalized.includes("retry")) return "retrying";
  if (normalized.includes("partial")) return "partially_failed";
  if (normalized.includes("attention") || normalized.includes("fail") || normalized.includes("disput")) return "needs_attention";
  if (normalized.includes("manual") || normalized.includes("resolve")) return "manually_resolved";
  return "confirmed";
}

export function describeUnifiedAsyncState(value: unknown): UnifiedAsyncPresentation {
  return PRESENTATION[normalizeUnifiedAsyncState(value)];
}
