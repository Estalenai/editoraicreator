"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { api } from "../../lib/api";
import { clearServerSession } from "../../lib/clientSessionSync";
import { PremiumSelect } from "../../components/ui/PremiumSelect";
import { toUserFacingError } from "../../lib/uiFeedback";

type SupportStatus = "open" | "in_review" | "resolved";
type BetaAccessStatus = "pending" | "approved" | "rejected";
type SupportRequestItem = {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  message: string;
  status: SupportStatus;
  admin_note?: string | null;
  created_at: string;
  updated_at?: string;
  metadata?: Record<string, any> | null;
};

type BetaAccessItem = {
  id: string;
  email: string;
  user_id?: string | null;
  status: BetaAccessStatus;
  admin_note?: string | null;
  created_at: string;
  updated_at?: string;
  approved_at?: string | null;
  approved_by?: string | null;
  metadata?: Record<string, any> | null;
};

type AdminNotice = {
  tone: "success" | "warning" | "info";
  message: string;
};

type HealthReadySnapshot = {
  ok?: boolean;
  status?: number;
  deps?: {
    db?: boolean;
    supabaseAdmin?: boolean;
  };
};

type AdminStatusSnapshot = {
  ok?: boolean;
  uptime_seconds?: number;
  routing_defaults?: {
    default_mode?: string;
    recommended_mode?: string;
  };
  metrics_snapshot?: {
    total_usage_samples?: number;
    total_metrics_logged?: number;
  };
  internal_cost_totals?: {
    global?: {
      total_cost_score?: number;
    };
  };
};

type AdminErrorSnapshot = {
  items?: Array<{ error: string; count: number }>;
};

type AdminRoutingSnapshot = {
  modes?: Record<string, number>;
  providers?: Array<{ provider: string; count: number }>;
};

type RecentOperationalEvent = {
  event: string;
  userId?: string | null;
  plan?: string | null;
  timestamp: string;
  additional?: Record<string, unknown>;
};

type AdminActionDraft =
  | {
      kind: "support";
      item: SupportRequestItem;
      nextStatus: SupportStatus;
      note: string;
      resolutionSummary: string;
      nextStep: string;
      ownerLabel: string;
      queueLabel: string;
    }
  | {
      kind: "beta";
      item: BetaAccessItem;
      nextStatus: BetaAccessStatus;
      note: string;
      decisionReason: string;
      ownerLabel: string;
    }
  | {
      kind: "support-batch";
      ids: string[];
      nextStatus: SupportStatus;
      note: string;
      resolutionSummary: string;
      nextStep: string;
      ownerLabel: string;
      queueLabel: string;
    }
  | {
      kind: "beta-batch";
      ids: string[];
      nextStatus: BetaAccessStatus;
      note: string;
      decisionReason: string;
      ownerLabel: string;
    };

type AdminSavedView = {
  days: number;
  supportStatusFilter: "" | SupportStatus;
  supportCategoryFilter: string;
  betaAccessFilter: "" | BetaAccessStatus;
  savedAt: string;
};

const ADMIN_VIEW_STORAGE_KEY = "editor_ai_admin_saved_view_v1";

function supportStatusLabel(status: SupportStatus): string {
  if (status === "in_review") return "Em análise";
  if (status === "resolved") return "Resolvido";
  return "Em aberto";
}

function supportCategoryLabel(category: string): string {
  if (category === "problema_tecnico") return "Problema técnico";
  if (category === "pedido_financeiro") return "Pedido financeiro";
  if (category === "duvida") return "Dúvida";
  if (category === "outro") return "Outro";
  return category || "—";
}

function betaAccessStatusLabel(status: BetaAccessStatus): string {
  if (status === "approved") return "Aprovado";
  if (status === "rejected") return "Rejeitado";
  return "Pendente";
}

function supportStatusPillStyle(status: SupportStatus) {
  if (status === "resolved") {
    return {
      border: "1px solid rgba(88, 255, 170, 0.5)",
      background: "rgba(88, 255, 170, 0.16)",
      color: "#b9ffd7",
      borderRadius: 999,
      padding: "2px 8px",
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.4,
    };
  }
  if (status === "in_review") {
    return {
      border: "1px solid rgba(255, 214, 10, 0.45)",
      background: "rgba(255, 214, 10, 0.15)",
      color: "#ffe7a2",
      borderRadius: 999,
      padding: "2px 8px",
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.4,
    };
  }
  return {
    border: "1px solid rgba(255, 140, 140, 0.45)",
    background: "rgba(255, 140, 140, 0.16)",
    color: "#ffc9c9",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
  };
}

function betaStatusPillStyle(status: BetaAccessStatus) {
  if (status === "approved") {
    return {
      border: "1px solid rgba(88, 255, 170, 0.5)",
      background: "rgba(88, 255, 170, 0.16)",
      color: "#b9ffd7",
      borderRadius: 999,
      padding: "2px 8px",
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.4,
    };
  }
  if (status === "rejected") {
    return {
      border: "1px solid rgba(255, 140, 140, 0.45)",
      background: "rgba(255, 140, 140, 0.16)",
      color: "#ffc9c9",
      borderRadius: 999,
      padding: "2px 8px",
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.4,
    };
  }
  return {
    border: "1px solid rgba(255, 214, 10, 0.45)",
    background: "rgba(255, 214, 10, 0.15)",
    color: "#ffe7a2",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.4,
  };
}

function ratioPercent(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

function toDayKey(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-CA");
}

function emailReasonLabel(reason: unknown): string {
  const code = String(reason || "").trim();
  if (!code) return "motivo não informado";
  if (code === "provider_not_configured") return "provider de e-mail não configurado";
  if (code === "missing_from_email") return "remetente não configurado";
  if (code === "send_exception") return "falha de envio";
  return code;
}

function eventLabel(event: string): string {
  return String(event || "evento").replace(/\./g, " -> ");
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function relativeAgeLabel(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.max(1, Math.round(diffMs / 60000));
  if (diffMin < 60) return `${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 48) return `${diffHours} h`;
  return `${Math.round(diffHours / 24)} d`;
}

function supportRef(item: SupportRequestItem): string {
  return String(item.metadata?.support_ref || item.id || "SUPORTE");
}

function supportLifecycle(item: SupportRequestItem): Array<Record<string, any>> {
  const lifecycle = Array.isArray(item.metadata?.lifecycle) ? item.metadata.lifecycle : [];
  return lifecycle.filter((entry) => entry && typeof entry === "object");
}

function latestSupportLifecycle(item: SupportRequestItem): Record<string, any> | null {
  const lifecycle = supportLifecycle(item);
  return lifecycle.length > 0 ? lifecycle[lifecycle.length - 1] : null;
}

function supportQueue(item: SupportRequestItem): string {
  return String(item.metadata?.queue_label || "Atendimento");
}

function supportOwner(item: SupportRequestItem): string {
  return String(item.metadata?.owner_label || "Sem responsável");
}

function betaAccessRef(item: BetaAccessItem): string {
  return String(item.metadata?.access_ref || item.id || "ACESSO");
}

function betaDecisionHistory(item: BetaAccessItem): Array<Record<string, any>> {
  const history = Array.isArray(item.metadata?.decision_history) ? item.metadata.decision_history : [];
  return history.filter((entry) => entry && typeof entry === "object");
}

function latestBetaDecision(item: BetaAccessItem): Record<string, any> | null {
  const history = betaDecisionHistory(item);
  return history.length > 0 ? history[history.length - 1] : null;
}

function readSavedAdminView(): AdminSavedView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      days: Math.min(Math.max(Number(parsed.days || 7), 1), 30),
      supportStatusFilter: parsed.supportStatusFilter || "",
      supportCategoryFilter: String(parsed.supportCategoryFilter || ""),
      betaAccessFilter: parsed.betaAccessFilter || "",
      savedAt: String(parsed.savedAt || ""),
    };
  } catch {
    return null;
  }
}

const panelStyle = {
  padding: 0,
} as const;

const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "14", label: "14 dias" },
  { value: "30", label: "30 dias" },
];

const SUPPORT_STATUS_FILTER_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "open", label: "Em aberto" },
  { value: "in_review", label: "Em análise" },
  { value: "resolved", label: "Resolvido" },
];

const SUPPORT_CATEGORY_FILTER_OPTIONS = [
  { value: "", label: "Todas categorias" },
  { value: "duvida", label: "Dúvida" },
  { value: "problema_tecnico", label: "Problema técnico" },
  { value: "pedido_financeiro", label: "Pedido financeiro" },
  { value: "outro", label: "Outro" },
];

const BETA_STATUS_FILTER_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "pending", label: "Pendente" },
  { value: "approved", label: "Aprovado" },
  { value: "rejected", label: "Rejeitado" },
];

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [supportStatusFilter, setSupportStatusFilter] = useState<"" | SupportStatus>("");
  const [supportCategoryFilter, setSupportCategoryFilter] = useState("");
  const [supportItems, setSupportItems] = useState<SupportRequestItem[]>([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportUpdatingId, setSupportUpdatingId] = useState<string | null>(null);
  const [betaAccessFilter, setBetaAccessFilter] = useState<"" | BetaAccessStatus>("");
  const [betaAccessItems, setBetaAccessItems] = useState<BetaAccessItem[]>([]);
  const [betaAccessLoading, setBetaAccessLoading] = useState(false);
  const [betaAccessUpdatingId, setBetaAccessUpdatingId] = useState<string | null>(null);
  const [betaAccessError, setBetaAccessError] = useState<string | null>(null);
  const [betaAccessLastSync, setBetaAccessLastSync] = useState<string | null>(null);
  const [healthReady, setHealthReady] = useState<HealthReadySnapshot | null>(null);
  const [statusSnapshot, setStatusSnapshot] = useState<AdminStatusSnapshot | null>(null);
  const [routingSnapshot, setRoutingSnapshot] = useState<AdminRoutingSnapshot | null>(null);
  const [errorSnapshot, setErrorSnapshot] = useState<AdminErrorSnapshot | null>(null);
  const [recentEvents, setRecentEvents] = useState<RecentOperationalEvent[]>([]);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsLastSync, setOpsLastSync] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<AdminNotice | null>(null);
  const [actionDraft, setActionDraft] = useState<AdminActionDraft | null>(null);
  const [savedView, setSavedView] = useState<AdminSavedView | null>(null);
  const [selectedSupportIds, setSelectedSupportIds] = useState<string[]>([]);
  const [selectedBetaIds, setSelectedBetaIds] = useState<string[]>([]);

  async function loadOverview(nextDays = days) {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      setSessionEmail(session.user?.email || "");
      const data = await api.adminOverview(nextDays);
      setOverview(data);
    } catch (e: any) {
      if (String(e?.message || "").includes("admin_forbidden")) {
        setForbidden(true);
      } else {
        setError(toUserFacingError(e?.message, "Falha ao carregar o admin."));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadOperationalTelemetry() {
    setOpsLoading(true);
    try {
      const [readyResult, statusResult, errorsResult, routingResult, eventsResult] = await Promise.allSettled([
        api.healthReady(),
        api.adminStatus(),
        api.adminDashboardErrors(),
        api.adminDashboardRouting(),
        api.adminRecentEvents(12),
      ]);

      if (readyResult.status === "fulfilled") setHealthReady(readyResult.value || null);
      if (statusResult.status === "fulfilled") setStatusSnapshot(statusResult.value || null);
      if (errorsResult.status === "fulfilled") setErrorSnapshot(errorsResult.value || null);
      if (routingResult.status === "fulfilled") setRoutingSnapshot(routingResult.value || null);
      if (eventsResult.status === "fulfilled") {
        setRecentEvents(Array.isArray(eventsResult.value?.items) ? eventsResult.value.items : []);
      }

      const failedResults = [statusResult, errorsResult, routingResult, eventsResult].filter((item) => item.status === "rejected");
      if (failedResults.length > 0) {
        setAdminNotice({
          tone: "warning",
          message: "Parte do rastreamento operacional nao respondeu agora. Os demais painéis seguem disponíveis.",
        });
      }
      setOpsLastSync(new Date().toISOString());
    } catch (e: any) {
      setError(toUserFacingError(e?.message, "Falha ao carregar sinais operacionais."));
    } finally {
      setOpsLoading(false);
    }
  }

  async function onLogoutToRelogin() {
    await supabase.auth.signOut();
    await clearServerSession().catch(() => null);
    router.push("/login");
  }

  async function onSearch() {
    if (!query.trim()) return;
    try {
      const data = await api.adminSearchUsers(query.trim());
      setUsers(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(toUserFacingError(e?.message, "Falha na busca de usuários."));
    }
  }

  async function onOpenTimeline(userId: string) {
    try {
      setSelectedUserId(userId);
      const data = await api.adminUserTimeline(userId, days, 200);
      setTimeline(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(toUserFacingError(e?.message, "Falha ao carregar timeline."));
    }
  }

  async function loadSupportRequests(
    nextStatus: "" | SupportStatus = supportStatusFilter,
    nextCategory = supportCategoryFilter
  ) {
    setSupportLoading(true);
    try {
      const data = await api.adminSupportRequests({
        status: nextStatus || undefined,
        category: nextCategory || undefined,
        limit: 100,
      });
      setSupportItems(Array.isArray(data?.items) ? data.items : []);
      setSelectedSupportIds([]);
    } catch (e: any) {
      setError(toUserFacingError(e?.message, "Falha ao carregar suporte."));
    } finally {
      setSupportLoading(false);
    }
  }

  async function onUpdateSupportStatus(item: SupportRequestItem, nextStatus: SupportStatus, noteInput = "") {
    const lifecycle = latestSupportLifecycle(item);
    try {
      setSupportUpdatingId(item.id);
      await api.adminSupportUpdateStatus(item.id, {
        status: nextStatus,
        admin_note: noteInput.trim() || undefined,
        resolution_summary:
          nextStatus === "resolved"
            ? String(item.metadata?.resolution_summary || lifecycle?.resolution_summary || "").trim() || undefined
            : undefined,
        next_step: String(item.metadata?.next_step || lifecycle?.next_step || "").trim() || undefined,
        owner_label: String(item.metadata?.owner_label || lifecycle?.owner_label || "").trim() || undefined,
        queue_label: String(item.metadata?.queue_label || lifecycle?.queue_label || "").trim() || undefined,
      });
      setAdminNotice({
        tone: "info",
        message: `Ticket atualizado para "${supportStatusLabel(nextStatus)}".`,
      });
      await loadSupportRequests();
    } catch (e: any) {
      setError(toUserFacingError(e?.message, "Falha ao atualizar status de suporte."));
    } finally {
      setSupportUpdatingId(null);
    }
  }

  async function loadBetaAccessRequests(nextFilter: "" | BetaAccessStatus = betaAccessFilter) {
    setBetaAccessLoading(true);
    setBetaAccessError(null);
    try {
      const data = await api.adminBetaAccessRequests({
        status: nextFilter || undefined,
        limit: 200,
      });
      setBetaAccessItems(Array.isArray(data?.items) ? data.items : []);
      setSelectedBetaIds([]);
      setBetaAccessLastSync(new Date().toISOString());
    } catch (e: any) {
      setBetaAccessError(toUserFacingError(e?.message, "Falha ao carregar fila de espera."));
      setError(toUserFacingError(e?.message, "Falha ao carregar fila de espera."));
    } finally {
      setBetaAccessLoading(false);
    }
  }

  async function onUpdateBetaAccessStatus(item: BetaAccessItem, status: BetaAccessStatus, noteInput = "") {
    const latestDecision = latestBetaDecision(item);
    try {
      setBetaAccessUpdatingId(item.id);
      const response = await api.adminBetaAccessUpdate(item.id, {
        status,
        admin_note: noteInput.trim() || undefined,
        decision_reason: String(item.metadata?.decision_reason || latestDecision?.decision_reason || "").trim() || undefined,
        owner_label: String(item.metadata?.owner_label || latestDecision?.owner_label || "").trim() || undefined,
      });

      const emailNotification = response?.email_notification || null;
      if (status === "approved") {
        if (emailNotification?.sent) {
          setAdminNotice({
            tone: "success",
            message: "Acesso aprovado e e-mail de liberação enviado com sucesso.",
          });
        } else {
          setAdminNotice({
            tone: "warning",
            message: `Acesso aprovado. E-mail não enviado (${emailReasonLabel(emailNotification?.reason)}).`,
          });
        }
      } else {
        setAdminNotice({
          tone: "info",
          message: `Solicitação marcada como "${betaAccessStatusLabel(status)}".`,
        });
      }
      await loadBetaAccessRequests();
    } catch (e: any) {
      setError(toUserFacingError(e?.message, "Falha ao atualizar fila de espera."));
    } finally {
      setBetaAccessUpdatingId(null);
    }
  }

  function openSupportActionDraft(item: SupportRequestItem, nextStatus: SupportStatus) {
    const latestLifecycle = latestSupportLifecycle(item);
    setActionDraft({
      kind: "support",
      item,
      nextStatus,
      note: String(item.admin_note || ""),
      resolutionSummary: String(item.metadata?.resolution_summary || latestLifecycle?.resolution_summary || ""),
      nextStep: String(item.metadata?.next_step || latestLifecycle?.next_step || ""),
      ownerLabel: String(item.metadata?.owner_label || latestLifecycle?.owner_label || ""),
      queueLabel: String(item.metadata?.queue_label || latestLifecycle?.queue_label || ""),
    });
  }

  function openBetaActionDraft(item: BetaAccessItem, nextStatus: BetaAccessStatus) {
    const latestDecision = latestBetaDecision(item);
    setActionDraft({
      kind: "beta",
      item,
      nextStatus,
      note: String(item.admin_note || ""),
      decisionReason: String(item.metadata?.decision_reason || latestDecision?.decision_reason || ""),
      ownerLabel: String(item.metadata?.owner_label || latestDecision?.owner_label || ""),
    });
  }

  function openSupportBatchDraft(nextStatus: SupportStatus) {
    if (selectedSupportIds.length === 0) return;
    setActionDraft({
      kind: "support-batch",
      ids: selectedSupportIds,
      nextStatus,
      note: "",
      resolutionSummary: "",
      nextStep: "",
      ownerLabel: "",
      queueLabel: "",
    });
  }

  function openBetaBatchDraft(nextStatus: BetaAccessStatus) {
    if (selectedBetaIds.length === 0) return;
    setActionDraft({
      kind: "beta-batch",
      ids: selectedBetaIds,
      nextStatus,
      note: "",
      decisionReason: "",
      ownerLabel: "",
    });
  }

  async function submitActionDraft() {
    if (!actionDraft) return;
    if (actionDraft.kind === "support") {
      try {
        setSupportUpdatingId(actionDraft.item.id);
        await api.adminSupportUpdateStatus(actionDraft.item.id, {
          status: actionDraft.nextStatus,
          admin_note: actionDraft.note.trim() || undefined,
          resolution_summary: actionDraft.resolutionSummary.trim() || undefined,
          next_step: actionDraft.nextStep.trim() || undefined,
          owner_label: actionDraft.ownerLabel.trim() || undefined,
          queue_label: actionDraft.queueLabel.trim() || undefined,
        });
        setAdminNotice({
          tone: "info",
          message: `Ticket ${supportRef(actionDraft.item)} atualizado para "${supportStatusLabel(actionDraft.nextStatus)}".`,
        });
        await loadSupportRequests();
      } catch (e: any) {
        setError(toUserFacingError(e?.message, "Falha ao atualizar status de suporte."));
      } finally {
        setSupportUpdatingId(null);
      }
    } else if (actionDraft.kind === "beta") {
      try {
        setBetaAccessUpdatingId(actionDraft.item.id);
        const response = await api.adminBetaAccessUpdate(actionDraft.item.id, {
          status: actionDraft.nextStatus,
          admin_note: actionDraft.note.trim() || undefined,
          decision_reason: actionDraft.decisionReason.trim() || undefined,
          owner_label: actionDraft.ownerLabel.trim() || undefined,
        });
        const emailNotification = response?.email_notification || null;
        setAdminNotice({
          tone:
            actionDraft.nextStatus === "approved" && !emailNotification?.sent
              ? "warning"
              : actionDraft.nextStatus === "approved"
                ? "success"
                : "info",
          message:
            actionDraft.nextStatus === "approved"
              ? emailNotification?.sent
                ? "Acesso aprovado e comunicado enviado."
                : `Acesso aprovado. E-mail não enviado (${emailReasonLabel(emailNotification?.reason)}).`
              : `Solicitação marcada como "${betaAccessStatusLabel(actionDraft.nextStatus)}".`,
        });
        await loadBetaAccessRequests();
      } catch (e: any) {
        setError(toUserFacingError(e?.message, "Falha ao atualizar fila de espera."));
      } finally {
        setBetaAccessUpdatingId(null);
      }
    } else if (actionDraft.kind === "support-batch") {
      try {
        setSupportUpdatingId("batch");
        await Promise.all(
          actionDraft.ids.map((id) =>
            api.adminSupportUpdateStatus(id, {
              status: actionDraft.nextStatus,
              admin_note: actionDraft.note.trim() || undefined,
              resolution_summary: actionDraft.resolutionSummary.trim() || undefined,
              next_step: actionDraft.nextStep.trim() || undefined,
              owner_label: actionDraft.ownerLabel.trim() || undefined,
              queue_label: actionDraft.queueLabel.trim() || undefined,
            })
          )
        );
        setAdminNotice({
          tone: "info",
          message: `${actionDraft.ids.length} ticket(s) atualizados para "${supportStatusLabel(actionDraft.nextStatus)}".`,
        });
        setSelectedSupportIds([]);
        await loadSupportRequests();
      } catch (e: any) {
        setError(toUserFacingError(e?.message, "Falha ao atualizar o lote de suporte."));
      } finally {
        setSupportUpdatingId(null);
      }
    } else {
      try {
        setBetaAccessUpdatingId("batch");
        await Promise.all(
          actionDraft.ids.map((id) =>
            api.adminBetaAccessUpdate(id, {
              status: actionDraft.nextStatus,
              admin_note: actionDraft.note.trim() || undefined,
              decision_reason: actionDraft.decisionReason.trim() || undefined,
              owner_label: actionDraft.ownerLabel.trim() || undefined,
            })
          )
        );
        setAdminNotice({
          tone: actionDraft.nextStatus === "approved" ? "success" : "info",
          message: `${actionDraft.ids.length} solicitação(ões) marcadas como "${betaAccessStatusLabel(actionDraft.nextStatus)}".`,
        });
        setSelectedBetaIds([]);
        await loadBetaAccessRequests();
      } catch (e: any) {
        setError(toUserFacingError(e?.message, "Falha ao atualizar o lote da fila beta."));
      } finally {
        setBetaAccessUpdatingId(null);
      }
    }
    setActionDraft(null);
  }

  async function refreshAdminScreen(nextDays = days) {
    await Promise.all([
      loadOverview(nextDays),
      loadOperationalTelemetry(),
      loadSupportRequests(supportStatusFilter, supportCategoryFilter),
      loadBetaAccessRequests(betaAccessFilter),
    ]);
  }

  const supportStats = useMemo(() => {
    const total = supportItems.length;
    const open = supportItems.filter((item) => item.status === "open").length;
    const inReview = supportItems.filter((item) => item.status === "in_review").length;
    const resolved = supportItems.filter((item) => item.status === "resolved").length;
    return {
      total,
      open,
      inReview,
      resolved,
      unresolved: open + inReview,
      resolutionRate: ratioPercent(resolved, total),
    };
  }, [supportItems]);

  const betaAccessStats = useMemo(() => {
    const total = betaAccessItems.length;
    const pending = betaAccessItems.filter((item) => item.status === "pending").length;
    const approved = betaAccessItems.filter((item) => item.status === "approved").length;
    const rejected = betaAccessItems.filter((item) => item.status === "rejected").length;
    const decided = approved + rejected;
    return {
      total,
      pending,
      approved,
      rejected,
      decided,
      approvalRate: ratioPercent(approved, decided),
      rejectionRate: ratioPercent(rejected, decided),
      pendingRate: ratioPercent(pending, total),
    };
  }, [betaAccessItems]);

  const supportNeedsAttention = useMemo(
    () => supportItems.filter((item) => item.status !== "resolved").slice(0, 5),
    [supportItems]
  );

  const betaNeedsAttention = useMemo(
    () => betaAccessItems.filter((item) => item.status === "pending").slice(0, 5),
    [betaAccessItems]
  );

  const todayStats = useMemo(() => {
    const today = toDayKey(new Date().toISOString());
    const betaApprovedToday = betaAccessItems.filter(
      (item) => item.status === "approved" && toDayKey(item.approved_at || item.updated_at || item.created_at) === today
    ).length;
    const betaRejectedToday = betaAccessItems.filter(
      (item) => item.status === "rejected" && toDayKey(item.updated_at || item.created_at) === today
    ).length;
    const betaPendingToday = betaAccessItems.filter(
      (item) => item.status === "pending" && toDayKey(item.created_at) === today
    ).length;
    const supportCreatedToday = supportItems.filter((item) => toDayKey(item.created_at) === today).length;
    return {
      betaApprovedToday,
      betaRejectedToday,
      betaPendingToday,
      supportCreatedToday,
    };
  }, [betaAccessItems, supportItems]);

  const topOperationalErrors = useMemo(
    () => (Array.isArray(errorSnapshot?.items) ? errorSnapshot.items.slice(0, 5) : []),
    [errorSnapshot]
  );

  const topOperationalProviders = useMemo(
    () => (Array.isArray(routingSnapshot?.providers) ? routingSnapshot.providers.slice(0, 5) : []),
    [routingSnapshot]
  );

  const actionDraftLabel = useMemo(() => {
    if (!actionDraft) return "";
    if (actionDraft.kind === "support" || actionDraft.kind === "support-batch") {
      return supportStatusLabel(actionDraft.nextStatus);
    }
    return betaAccessStatusLabel(actionDraft.nextStatus);
  }, [actionDraft]);

  useEffect(() => {
    const nextSavedView = readSavedAdminView();
    if (nextSavedView) {
      setSavedView(nextSavedView);
      setDays(nextSavedView.days);
      setSupportStatusFilter(nextSavedView.supportStatusFilter);
      setSupportCategoryFilter(nextSavedView.supportCategoryFilter);
      setBetaAccessFilter(nextSavedView.betaAccessFilter);
      void Promise.all([
        loadOverview(nextSavedView.days),
        loadOperationalTelemetry(),
        loadSupportRequests(nextSavedView.supportStatusFilter, nextSavedView.supportCategoryFilter),
        loadBetaAccessRequests(nextSavedView.betaAccessFilter),
      ]);
      return;
    }
    refreshAdminScreen(7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!forbidden) {
        loadBetaAccessRequests();
      }
    }, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forbidden, betaAccessFilter]);

  function toggleSupportSelection(id: string) {
    setSelectedSupportIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleBetaSelection(id: string) {
    setSelectedBetaIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function saveCurrentView() {
    const view: AdminSavedView = {
      days,
      supportStatusFilter,
      supportCategoryFilter,
      betaAccessFilter,
      savedAt: new Date().toISOString(),
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ADMIN_VIEW_STORAGE_KEY, JSON.stringify(view));
    }
    setSavedView(view);
    setAdminNotice({
      tone: "info",
      message: "Visão operacional salva neste navegador.",
    });
  }

  async function restoreSavedView() {
    const nextSavedView = readSavedAdminView();
    if (!nextSavedView) {
      setAdminNotice({
        tone: "warning",
        message: "Nenhuma visão salva neste navegador.",
      });
      return;
    }
    setSavedView(nextSavedView);
    setDays(nextSavedView.days);
    setSupportStatusFilter(nextSavedView.supportStatusFilter);
    setSupportCategoryFilter(nextSavedView.supportCategoryFilter);
    setBetaAccessFilter(nextSavedView.betaAccessFilter);
    await Promise.all([
      loadOverview(nextSavedView.days),
      loadOperationalTelemetry(),
      loadSupportRequests(nextSavedView.supportStatusFilter, nextSavedView.supportCategoryFilter),
      loadBetaAccessRequests(nextSavedView.betaAccessFilter),
    ]);
    setAdminNotice({
      tone: "info",
      message: "Visão operacional restaurada.",
    });
  }

  if (forbidden) {
    return (
      <div className="page-shell admin-page admin-page-restricted">
        <h1>Acesso restrito</h1>
        <div className="state-ea state-ea-warning">
          <p className="state-ea-title">Sua conta não tem permissão de administrador</p>
          <div className="state-ea-text">
            Sessão atual: {sessionEmail || "não identificada"}. Faça login com uma conta allowlisted.
          </div>
          <div className="state-ea-actions">
            <button onClick={() => loadOverview(days)} className="btn-ea btn-secondary">Tentar novamente</button>
            <button onClick={onLogoutToRelogin} className="btn-ea btn-ghost">Sair e entrar de novo</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell admin-page">
      <div className="admin-page-canvas">
        <div className="admin-hero-open">
          <div className="section-stack-tight">
            <p className="section-kicker">Console operacional</p>
            <h1 style={{ marginTop: 4, marginBottom: 0 }}>Admin</h1>
          </div>
          <div className="surface-toolbar admin-hero-toolbar">
            <div className="admin-hero-period">
              <label className="toolbar-label">Período</label>
              <PremiumSelect
                className="field-inline"
                value={String(days)}
                options={PERIOD_OPTIONS}
                ariaLabel="Período do painel"
                onChange={(nextValue) => {
                  const next = Number(nextValue || 7);
                  setDays(next);
                  refreshAdminScreen(next);
                }}
              />
            </div>
            <div className="admin-hero-actions">
              <button onClick={() => refreshAdminScreen(days)} className="btn-ea btn-secondary">Atualizar</button>
              <button onClick={saveCurrentView} className="btn-ea btn-ghost btn-sm">Salvar visão</button>
              <button onClick={() => void restoreSavedView()} className="btn-ea btn-ghost btn-sm">Restaurar visão</button>
              <button onClick={() => api.adminExportUsageCsv(days)} className="btn-ea btn-ghost btn-sm">Exportar CSV de uso</button>
              <button onClick={() => api.adminExportCoinsCsv(days)} className="btn-ea btn-ghost btn-sm">Exportar CSV de créditos</button>
            </div>
          </div>
        </div>

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Falha operacional</p>
          <div className="state-ea-text">{error}</div>
          <div className="state-ea-actions">
            <button onClick={() => refreshAdminScreen(days)} className="btn-ea btn-secondary btn-sm">Atualizar admin</button>
            <Link href="/support" className="btn-link-ea btn-ghost btn-sm">Abrir suporte</Link>
          </div>
        </div>
      ) : null}
      {adminNotice ? (
        <div
          className="premium-card-soft admin-inline-notice"
          style={{
            padding: 10,
            borderRadius: 8,
            border:
              adminNotice.tone === "success"
                ? "1px solid rgba(88,255,170,0.45)"
                : adminNotice.tone === "warning"
                  ? "1px solid rgba(255,214,10,0.45)"
                  : "1px solid rgba(120,180,255,0.45)",
            background:
              adminNotice.tone === "success"
                ? "rgba(88,255,170,0.12)"
                : adminNotice.tone === "warning"
                  ? "rgba(255,214,10,0.12)"
                  : "rgba(120,180,255,0.12)",
          }}
        >
          {adminNotice.message}
        </div>
      ) : null}
      {loading && (
        <div className="admin-loading-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`admin-skeleton-${index}`} className="premium-skeleton premium-skeleton-card" />
          ))}
        </div>
      )}

      {!loading && overview && (
        <div className="admin-overview-strip">
          <div className="admin-overview-item">
            <strong>Uso</strong>
            <div>Total: {overview?.usage?.total ?? 0}</div>
            <div>Erros: {overview?.usage?.errors ?? 0}</div>
            <div>Replays: {overview?.usage?.replays ?? 0}</div>
          </div>
          <div className="admin-overview-item">
            <strong>Créditos</strong>
            <div>
              Débito Comum/Pro/Ultra: {overview?.coins?.debit?.common ?? 0}/{overview?.coins?.debit?.pro ?? 0}/
              {overview?.coins?.debit?.ultra ?? 0}
            </div>
            <div>
              Crédito Comum/Pro/Ultra: {overview?.coins?.credit?.common ?? 0}/{overview?.coins?.credit?.pro ?? 0}/
              {overview?.coins?.credit?.ultra ?? 0}
            </div>
          </div>
          <div className="admin-overview-item">
            <strong>Assinaturas</strong>
            <div>
              ativas {overview?.subs?.active ?? 0} | trialing {overview?.subs?.trialing ?? 0} | past_due{" "}
              {overview?.subs?.past_due ?? 0} | canceladas {overview?.subs?.canceled ?? 0}
            </div>
          </div>
          <div className="admin-overview-item">
            <strong>Stripe</strong>
            <div>
              processados {overview?.stripe?.processed ?? 0} | ignorados {overview?.stripe?.ignored ?? 0} | falhas{" "}
              {overview?.stripe?.failed ?? 0}
            </div>
          </div>
        </div>
      )}

      <div className="admin-workspace-grid">
        <div className="admin-workspace-main">
          <div className="premium-card admin-console-section admin-control-region" style={panelStyle}>
            <div className="section-head admin-section-head-split">
              <div>
                <p className="section-kicker">Saude do produto</p>
                <h3 style={{ margin: "4px 0 0" }}>Observabilidade essencial</h3>
              </div>
              <div style={{ opacity: 0.76, fontSize: 12 }}>
                {opsLastSync ? `Atualizado em ${new Date(opsLastSync).toLocaleTimeString("pt-BR")}` : "Sem sincronização recente"}
              </div>
            </div>

            {opsLoading ? (
              <div className="empty-ea">Sincronizando sinais operacionais...</div>
            ) : (
              <div className="admin-control-body">
                <div className="admin-control-primary">
                  <div className="admin-observability-grid">
                    <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                      <div style={{ opacity: 0.76, fontSize: 12 }}>Readiness da API</div>
                      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }}>
                        {healthReady?.ok ? "OK" : healthReady ? "Degradado" : "Sem resposta"}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                        DB: {healthReady?.deps?.db ? "ok" : "falha"} • Supabase admin: {healthReady?.deps?.supabaseAdmin ? "ok" : "falha"}
                      </div>
                    </div>

                    <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                      <div style={{ opacity: 0.76, fontSize: 12 }}>Uptime e trilha</div>
                      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
                        {statusSnapshot?.uptime_seconds ? `${Math.round(statusSnapshot.uptime_seconds)}s` : "n/d"}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                        Samples de uso: {statusSnapshot?.metrics_snapshot?.total_usage_samples ?? 0} • Métricas: {statusSnapshot?.metrics_snapshot?.total_metrics_logged ?? 0}
                      </div>
                    </div>

                    <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                      <div style={{ opacity: 0.76, fontSize: 12 }}>Routing de IA</div>
                      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
                        Default: {statusSnapshot?.routing_defaults?.default_mode || "n/d"}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                        Quality: {routingSnapshot?.modes?.quality ?? 0} • Economy: {routingSnapshot?.modes?.economy ?? 0} • Manual: {routingSnapshot?.modes?.manual ?? 0}
                      </div>
                    </div>

                    <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                      <div style={{ opacity: 0.76, fontSize: 12 }}>Custo interno agregado</div>
                      <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
                        {statusSnapshot?.internal_cost_totals?.global?.total_cost_score?.toFixed?.(2) ?? "0.00"}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                        Visão curta para identificar picos operacionais no período atual.
                      </div>
                    </div>
                  </div>

                  <div className="admin-observability-detail-grid">
                    <div className="premium-card-soft admin-subpanel admin-subpanel-list">
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Top erros recentes</div>
                      {topOperationalErrors.length === 0 ? (
                        <div style={{ opacity: 0.78, fontSize: 13 }}>Sem erros agregados no buffer atual.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 6 }}>
                          {topOperationalErrors.map((item) => (
                            <div key={`ops-error-${item.error}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                              <span style={{ opacity: 0.86, wordBreak: "break-word" }}>{item.error}</span>
                              <strong>{item.count}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="premium-card-soft admin-subpanel admin-subpanel-list">
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Providers e roteamento</div>
                      {topOperationalProviders.length === 0 ? (
                        <div style={{ opacity: 0.78, fontSize: 13 }}>Sem providers amostrados no buffer atual.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 6 }}>
                          {topOperationalProviders.map((item) => (
                            <div key={`ops-provider-${item.provider}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                              <span style={{ opacity: 0.86 }}>{item.provider}</span>
                              <strong>{item.count}</strong>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="premium-card-soft admin-subpanel admin-subpanel-list">
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Eventos recentes do produto</div>
                      {recentEvents.length === 0 ? (
                        <div style={{ opacity: 0.78, fontSize: 13 }}>Sem eventos recentes no buffer atual.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 8 }}>
                          {recentEvents.map((item, index) => (
                            <div key={`ops-event-${item.timestamp}-${index}`} style={{ fontSize: 13 }}>
                              <div style={{ fontWeight: 600 }}>{eventLabel(item.event)}</div>
                              <div style={{ opacity: 0.78 }}>
                                {new Date(item.timestamp).toLocaleString("pt-BR")}
                                {item.plan ? ` • ${item.plan}` : ""}
                                {item.additional?.status ? ` • ${String(item.additional.status)}` : ""}
                                {item.additional?.source ? ` • ${String(item.additional.source)}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="admin-control-rail">
                  <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                    <div style={{ opacity: 0.76, fontSize: 12 }}>Movimento hoje</div>
                    <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700 }}>
                      +{todayStats.betaApprovedToday} aprovados • {todayStats.betaRejectedToday} reprovados
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                      Pendentes novos: {todayStats.betaPendingToday} • Tickets criados: {todayStats.supportCreatedToday}
                    </div>
                  </div>

                  <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                    <div style={{ opacity: 0.76, fontSize: 12 }}>Fila ativa</div>
                    <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
                      {betaAccessStats.pending} pendentes • {supportStats.unresolved} tickets
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                      Aprovação: {betaAccessStats.approvalRate} • Resolução: {supportStats.resolutionRate}
                    </div>
                  </div>

                  <div className="premium-card-soft admin-subpanel admin-subpanel-list">
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Janela do turno</div>
                    <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <div>Período atual: {days} dias</div>
                      <div>Sessão ativa: {sessionEmail || "não identificada"}</div>
                      <div>Última fila beta: {betaAccessLastSync ? new Date(betaAccessLastSync).toLocaleTimeString("pt-BR") : "sem sincronização"}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="premium-card admin-console-section admin-user-ops-region" style={panelStyle}>
            <div className="section-head">
              <div>
                <p className="section-kicker">Consulta operacional</p>
                <h3 style={{ margin: "4px 0 0" }}>Usuário e trilha</h3>
              </div>
            </div>

            <div className={`admin-user-ops-grid${selectedUserId ? " is-timeline-open" : ""}`}>
              <div className="premium-card-soft admin-subpanel admin-user-search-panel">
                <div className="section-stack-tight" style={{ marginBottom: 10 }}>
                  <strong>Buscar usuário</strong>
                  <div style={{ opacity: 0.78, fontSize: 13 }}>
                    Procure por e-mail parcial ou <code>user_id</code> e abra a trilha sem sair da região principal.
                  </div>
                </div>
                <div className="surface-toolbar">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="email parcial ou user_id"
                    className="field-ea"
                    style={{ flex: 1, minWidth: 240 }}
                  />
                  <button onClick={onSearch} className="btn-ea btn-secondary">Buscar</button>
                </div>
                <ul className="admin-search-results">
                  {users.map((u) => (
                    <li key={u.user_id} className="premium-card-soft admin-search-result">
                      <div className="admin-search-result-row">
                        <div className="admin-search-result-copy">
                          <strong>{u.email || "sem-email"}</strong>
                          <div style={{ opacity: 0.82, fontSize: 13, marginTop: 4 }}>
                            {u.user_id} • {u.plan_code} • créditos {u.coins?.common ?? 0}/{u.coins?.pro ?? 0}/{u.coins?.ultra ?? 0}
                          </div>
                        </div>
                        <button onClick={() => onOpenTimeline(u.user_id)} className="btn-ea btn-ghost btn-sm">Timeline</button>
                      </div>
                    </li>
                  ))}
                </ul>
                {query.trim() && users.length === 0 ? (
                  <div className="empty-ea" style={{ marginTop: 10 }}>
                    Nenhum usuário encontrado para essa busca.
                  </div>
                ) : null}
              </div>

              <div className="premium-card-soft admin-subpanel admin-user-timeline-panel">
                <div className="section-stack-tight" style={{ marginBottom: 10 }}>
                  <strong>Timeline do usuário</strong>
                  <div style={{ opacity: 0.78, fontSize: 13 }}>
                    {selectedUserId ? `Leitura aberta para ${selectedUserId}.` : "Selecione um usuário para abrir a trilha contextual."}
                  </div>
                </div>
                {selectedUserId ? (
                  <ul className="admin-timeline-list">
                    {timeline.map((item, index) => (
                      <li key={`${item.type}-${item.created_at}-${index}`} className="admin-timeline-item">
                        <div style={{ fontWeight: 600 }}>
                          {eventLabel(item.type || item.event_type || "evento")}
                        </div>
                        <div style={{ marginTop: 4, opacity: 0.78, fontSize: 13 }}>
                          {item.created_at}
                          {item.feature || item.event_type || item.plan_code ? ` • ${item.feature || item.event_type || item.plan_code}` : ""}
                          {item.status ? ` • ${item.status}` : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-ea">Abra uma timeline para acompanhar uso, plano e eventos do usuário.</div>
                )}
              </div>
            </div>
          </div>

          <div className="premium-card admin-console-section admin-queue-region" style={panelStyle}>
            <div className="section-head">
              <div>
                <p className="section-kicker">Filas operacionais</p>
                <h3 style={{ margin: "4px 0 0" }}>Atendimento e acesso</h3>
              </div>
            </div>

            <div className="admin-queue-grid">
              <section className="premium-card-soft admin-subpanel admin-queue-surface">
                <div className="section-head" style={{ marginBottom: 8 }}>
                  <div>
                    <p className="section-kicker">Atendimento</p>
                    <h4 style={{ margin: "4px 0 0" }}>Fila de suporte</h4>
                  </div>
                </div>
                <div className="admin-inline-stats">
                  <span>Em aberto: {supportStats.open}</span>
                  <span>Em análise: {supportStats.inReview}</span>
                  <span>Resolvidos: {supportStats.resolved}</span>
                </div>
                <div style={{ opacity: 0.78, marginBottom: 8, fontSize: 12 }}>
                  Caso ativo: {supportNeedsAttention[0] ? supportRef(supportNeedsAttention[0]) : "sem prioridade aberta"} • Resolução: {supportStats.resolutionRate}
                </div>
                <div className="surface-toolbar" style={{ marginBottom: 10 }}>
                  <PremiumSelect
                    className="field-inline"
                    value={supportStatusFilter}
                    options={SUPPORT_STATUS_FILTER_OPTIONS}
                    ariaLabel="Filtro de status do suporte"
                    onChange={(nextValue) => {
                      const nextStatus = nextValue as "" | SupportStatus;
                      setSupportStatusFilter(nextStatus);
                      void loadSupportRequests(nextStatus, supportCategoryFilter);
                    }}
                  />
                  <PremiumSelect
                    className="field-inline"
                    value={supportCategoryFilter}
                    options={SUPPORT_CATEGORY_FILTER_OPTIONS}
                    ariaLabel="Filtro de categoria do suporte"
                    onChange={(nextValue) => {
                      const nextCategory = String(nextValue || "");
                      setSupportCategoryFilter(nextCategory);
                      void loadSupportRequests(supportStatusFilter, nextCategory);
                    }}
                  />
                  <button onClick={() => loadSupportRequests()} disabled={supportLoading} className="btn-ea btn-secondary">
                    {supportLoading ? "Atualizando..." : "Atualizar suporte"}
                  </button>
                </div>
                {selectedSupportIds.length > 0 ? (
                  <div className="surface-toolbar" style={{ marginBottom: 10 }}>
                    <span className="support-proof-chip">{selectedSupportIds.length} ticket(s) selecionados</span>
                    <button className="btn-ea btn-ghost btn-sm" onClick={() => openSupportBatchDraft("open")}>
                      Reabrir lote
                    </button>
                    <button className="btn-ea btn-secondary btn-sm" onClick={() => openSupportBatchDraft("in_review")}>
                      Colocar em análise
                    </button>
                    <button className="btn-ea btn-success btn-sm" onClick={() => openSupportBatchDraft("resolved")}>
                      Resolver lote
                    </button>
                  </div>
                ) : null}

                {supportLoading ? (
                  <div className="empty-ea">Carregando solicitações...</div>
                ) : supportItems.length === 0 ? (
                  <div className="state-ea">
                    <p className="state-ea-title">Nenhuma solicitação encontrada</p>
                    <div className="state-ea-text">
                      Ajuste os filtros ou atualize a lista para buscar novos tickets.
                    </div>
                    <div className="state-ea-actions">
                      <button onClick={() => loadSupportRequests()} className="btn-ea btn-secondary btn-sm">
                        Atualizar suporte
                      </button>
                      {(supportStatusFilter || supportCategoryFilter) ? (
                        <button
                          onClick={async () => {
                            setSupportStatusFilter("");
                            setSupportCategoryFilter("");
                            await loadSupportRequests("", "");
                          }}
                          className="btn-ea btn-ghost btn-sm"
                        >
                          Limpar filtros
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="admin-record-list">
                    {supportItems.map((item) => (
                      <div key={item.id} className="premium-card-soft admin-record-item">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ticket ${supportRef(item)}`}
                              checked={selectedSupportIds.includes(item.id)}
                              onChange={() => toggleSupportSelection(item.id)}
                              style={{ marginTop: 3 }}
                            />
                            <div style={{ display: "grid", gap: 4 }}>
                              <strong>{item.subject}</strong>
                              <div className="support-history-proof-row">
                                <span className="support-proof-chip">{supportRef(item)}</span>
                                <span className="support-proof-chip">Fila: {supportQueue(item)}</span>
                                <span className="support-proof-chip">Responsável: {supportOwner(item)}</span>
                              </div>
                            </div>
                          </div>
                          <span style={supportStatusPillStyle(item.status)}>{supportStatusLabel(item.status)}</span>
                        </div>
                        <div style={{ marginTop: 4, opacity: 0.82, fontSize: 13 }}>
                          Usuário: {item.user_id} • {supportCategoryLabel(item.category)} • aberto em {formatDateTime(item.created_at)} • idade {relativeAgeLabel(item.created_at)}
                        </div>
                        {item.updated_at ? (
                          <div style={{ marginTop: 2, opacity: 0.72, fontSize: 12 }}>
                            Atualizado em: {formatDateTime(item.updated_at)}
                          </div>
                        ) : null}
                        <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{item.message}</div>
                        {item.metadata?.resolution_summary ? (
                          <div className="admin-record-note">
                            Resolução: {String(item.metadata.resolution_summary)}
                          </div>
                        ) : null}
                        {item.metadata?.next_step ? (
                          <div className="admin-record-note">
                            Próximo passo: {String(item.metadata.next_step)}
                          </div>
                        ) : null}
                        {item.admin_note ? (
                          <div className="admin-record-note">
                            Nota interna: {item.admin_note}
                          </div>
                        ) : null}
                        {latestSupportLifecycle(item) ? (
                          <div style={{ marginTop: 6, opacity: 0.78, fontSize: 12 }}>
                            Última ação: {String(latestSupportLifecycle(item)?.summary || "sem trilha")} • {formatDateTime(latestSupportLifecycle(item)?.at)}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <button className="btn-ea btn-ghost btn-sm" disabled={supportUpdatingId === item.id} onClick={() => openSupportActionDraft(item, "open")}>
                            Marcar em aberto
                          </button>
                          <button className="btn-ea btn-secondary btn-sm" disabled={supportUpdatingId === item.id} onClick={() => openSupportActionDraft(item, "in_review")}>
                            Marcar em análise
                          </button>
                          <button className="btn-ea btn-success btn-sm" disabled={supportUpdatingId === item.id} onClick={() => openSupportActionDraft(item, "resolved")}>
                            Marcar resolvido
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="premium-card-soft admin-subpanel admin-queue-surface">
                <div className="section-head" style={{ marginBottom: 8 }}>
                  <div>
                    <p className="section-kicker">Controle de acesso</p>
                    <h4 style={{ margin: "4px 0 0" }}>Acesso e aprovação</h4>
                  </div>
                </div>
                <div className="admin-inline-stats">
                  <span>Pendentes: {betaAccessStats.pending}</span>
                  <span>Aprovados: {betaAccessStats.approved}</span>
                  <span>Reprovados: {betaAccessStats.rejected}</span>
                  <span>Taxa de aprovação: {betaAccessStats.approvalRate}</span>
                </div>
                <div style={{ opacity: 0.78, marginBottom: 8, fontSize: 12 }}>
                  Hoje: +{todayStats.betaApprovedToday} aprovados • {todayStats.betaRejectedToday} reprovados • {todayStats.betaPendingToday} novos pendentes
                </div>
                <div style={{ opacity: 0.8, marginBottom: 8, fontSize: 13 }}>
                  {betaAccessItems.length} solicitação(ões)
                  {betaAccessFilter ? ` • filtro: ${betaAccessStatusLabel(betaAccessFilter)}` : ""}
                  {betaAccessLastSync ? ` • atualizado em ${new Date(betaAccessLastSync).toLocaleTimeString("pt-BR")}` : ""}
                </div>
                <div className="surface-toolbar" style={{ marginBottom: 10 }}>
                  <PremiumSelect
                    className="field-inline"
                    value={betaAccessFilter}
                    options={BETA_STATUS_FILTER_OPTIONS}
                    ariaLabel="Filtro de status da fila beta"
                    onChange={(nextValue) => {
                      const next = nextValue as "" | BetaAccessStatus;
                      setBetaAccessFilter(next);
                      void loadBetaAccessRequests(next);
                    }}
                  />
                  <button onClick={() => loadBetaAccessRequests()} disabled={betaAccessLoading} className="btn-ea btn-secondary">
                    {betaAccessLoading ? "Atualizando..." : "Atualizar fila"}
                  </button>
                  {betaAccessFilter ? (
                    <button
                      className="btn-ea btn-ghost btn-sm"
                      onClick={async () => {
                        setBetaAccessFilter("");
                        await loadBetaAccessRequests("");
                      }}
                      disabled={betaAccessLoading}
                    >
                      Limpar filtro
                    </button>
                  ) : null}
                </div>
                {selectedBetaIds.length > 0 ? (
                  <div className="surface-toolbar" style={{ marginBottom: 10 }}>
                    <span className="support-proof-chip">{selectedBetaIds.length} solicitação(ões) selecionadas</span>
                    <button className="btn-ea btn-ghost btn-sm" onClick={() => openBetaBatchDraft("pending")}>
                      Voltar para pendente
                    </button>
                    <button className="btn-ea btn-success btn-sm" onClick={() => openBetaBatchDraft("approved")}>
                      Aprovar lote
                    </button>
                    <button className="btn-ea btn-danger btn-sm" onClick={() => openBetaBatchDraft("rejected")}>
                      Rejeitar lote
                    </button>
                  </div>
                ) : null}

                {betaAccessError ? (
                  <div className="state-ea state-ea-error" style={{ marginBottom: 8 }}>
                    <p className="state-ea-title">Fila de acesso indisponível no momento</p>
                    <div className="state-ea-text">{betaAccessError}</div>
                  </div>
                ) : null}

                {betaAccessLoading ? (
                  <div className="empty-ea">Carregando solicitações...</div>
                ) : betaAccessItems.length === 0 ? (
                  <div className="state-ea">
                    <p className="state-ea-title">Nenhuma solicitação encontrada</p>
                    <div className="state-ea-text">
                      Ajuste o filtro ou atualize a fila para buscar novos pedidos de acesso.
                    </div>
                    <div className="state-ea-actions">
                      <button onClick={() => loadBetaAccessRequests()} className="btn-ea btn-secondary btn-sm">
                        Atualizar fila
                      </button>
                      {betaAccessFilter ? (
                        <button
                          onClick={async () => {
                            setBetaAccessFilter("");
                            await loadBetaAccessRequests("");
                          }}
                          className="btn-ea btn-ghost btn-sm"
                        >
                          Limpar filtro
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="admin-record-list">
                    {betaAccessItems.map((item) => (
                      <div key={item.id} className="premium-card-soft admin-record-item">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                            <input
                              type="checkbox"
                              aria-label={`Selecionar acesso ${betaAccessRef(item)}`}
                              checked={selectedBetaIds.includes(item.id)}
                              onChange={() => toggleBetaSelection(item.id)}
                              style={{ marginTop: 3 }}
                            />
                            <div style={{ display: "grid", gap: 4 }}>
                              <strong>{item.email}</strong>
                              <div className="support-history-proof-row">
                                <span className="support-proof-chip">{betaAccessRef(item)}</span>
                                <span className="support-proof-chip">
                                  Responsável: {String(item.metadata?.owner_label || "Sem responsável")}
                                </span>
                              </div>
                            </div>
                          </div>
                          <span style={betaStatusPillStyle(item.status)}>{betaAccessStatusLabel(item.status)}</span>
                        </div>
                        <div style={{ marginTop: 4, opacity: 0.82, fontSize: 13 }}>
                          {item.user_id ? `Usuário: ${item.user_id} • ` : ""}
                          Solicitado em: {formatDateTime(item.created_at)} • idade {relativeAgeLabel(item.created_at)}
                        </div>
                        {item.updated_at ? (
                          <div style={{ marginTop: 2, opacity: 0.72, fontSize: 12 }}>
                            Atualizado em: {formatDateTime(item.updated_at)}
                          </div>
                        ) : null}
                        {item.metadata?.decision_reason ? (
                          <div className="admin-record-note">
                            Motivo da decisão: {String(item.metadata.decision_reason)}
                          </div>
                        ) : null}
                        {item.admin_note ? (
                          <div className="admin-record-note">
                            Nota interna: {item.admin_note}
                          </div>
                        ) : null}
                        {item.approved_at ? (
                          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
                            Liberado em: {new Date(item.approved_at).toLocaleString("pt-BR")}
                          </div>
                        ) : null}
                        {item.approved_by ? (
                          <div style={{ marginTop: 6, opacity: 0.8, fontSize: 13 }}>
                            Decidido por: {item.approved_by}
                          </div>
                        ) : null}
                        {latestBetaDecision(item) ? (
                          <div style={{ marginTop: 6, opacity: 0.78, fontSize: 12 }}>
                            Última ação: {String(latestBetaDecision(item)?.summary || "sem trilha")} • {formatDateTime(latestBetaDecision(item)?.at)}
                          </div>
                        ) : null}
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <button
                            className="btn-ea btn-ghost btn-sm"
                            disabled={betaAccessUpdatingId === item.id}
                            onClick={() => openBetaActionDraft(item, "pending")}
                          >
                            Marcar pendente
                          </button>
                          <button
                            className="btn-ea btn-success btn-sm"
                            disabled={betaAccessUpdatingId === item.id}
                            onClick={() => openBetaActionDraft(item, "approved")}
                          >
                            Aprovar acesso
                          </button>
                          <button
                            className="btn-ea btn-danger btn-sm"
                            disabled={betaAccessUpdatingId === item.id}
                            onClick={() => openBetaActionDraft(item, "rejected")}
                          >
                            Rejeitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>

        <div className="admin-workspace-rail">
          <div className="premium-card admin-console-section admin-radar-region" style={panelStyle}>
            <div className="section-head">
              <div>
                <p className="section-kicker">Visão persistida</p>
                <h3 style={{ margin: "4px 0 0" }}>Workspace do turno</h3>
              </div>
            </div>
            <div className="premium-card-soft admin-subpanel admin-subpanel-list">
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Visão salva neste navegador</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <div>Período: {savedView?.days ?? days} dias</div>
                <div>Status suporte: {savedView?.supportStatusFilter ? supportStatusLabel(savedView.supportStatusFilter) : "Todos"}</div>
                <div>Categoria suporte: {savedView?.supportCategoryFilter ? supportCategoryLabel(savedView.supportCategoryFilter) : "Todas"}</div>
                <div>Fila beta: {savedView?.betaAccessFilter ? betaAccessStatusLabel(savedView.betaAccessFilter) : "Todas"}</div>
                <div>Salva em: {savedView?.savedAt ? formatDateTime(savedView.savedAt) : "Ainda não salva"}</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn-ea btn-secondary btn-sm" onClick={saveCurrentView}>
                  Salvar visão atual
                </button>
                <button className="btn-ea btn-ghost btn-sm" onClick={() => void restoreSavedView()}>
                  Restaurar visão
                </button>
              </div>
            </div>
          </div>

          <div className="premium-card admin-console-section admin-attention-region" style={panelStyle}>
            <div className="section-head">
              <div>
                <p className="section-kicker">Prioridade do turno</p>
                <h3 style={{ margin: "4px 0 0" }}>Foco imediato</h3>
              </div>
            </div>
            {supportNeedsAttention.length === 0 && betaNeedsAttention.length === 0 ? (
              <div className="premium-card-soft admin-subpanel">
                Nenhuma pendência crítica no momento.
              </div>
            ) : (
              <div className="admin-attention-grid">
                <div className="premium-card-soft admin-subpanel admin-attention-item">
                  <div style={{ fontWeight: 700 }}>Acesso pendente</div>
                  <div style={{ marginTop: 4, opacity: 0.82, fontSize: 13 }}>
                    {betaAccessStats.pending} solicitação(ões) aguardando decisão.
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {betaNeedsAttention.length === 0 ? (
                      <div style={{ opacity: 0.8, fontSize: 13 }}>Sem itens pendentes.</div>
                    ) : (
                      betaNeedsAttention.map((item) => (
                        <div key={`att-beta-${item.id}`} style={{ fontSize: 13, opacity: 0.9 }}>
                          {item.email} • {new Date(item.created_at).toLocaleDateString("pt-BR")}
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    className="btn-ea btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={async () => {
                      setBetaAccessFilter("pending");
                      await loadBetaAccessRequests("pending");
                    }}
                  >
                    Abrir pendências
                  </button>
                </div>

                <div className="premium-card-soft admin-subpanel admin-attention-item">
                  <div style={{ fontWeight: 700 }}>Tickets de suporte ativos</div>
                  <div style={{ marginTop: 4, opacity: 0.82, fontSize: 13 }}>
                    {supportStats.unresolved} ticket(s) sem resolução.
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {supportNeedsAttention.length === 0 ? (
                      <div style={{ opacity: 0.8, fontSize: 13 }}>Sem tickets ativos.</div>
                    ) : (
                      supportNeedsAttention.map((item) => (
                        <div key={`att-support-${item.id}`} style={{ fontSize: 13, opacity: 0.9 }}>
                          {item.subject} • {supportStatusLabel(item.status)}
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    className="btn-ea btn-secondary btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={async () => {
                      setSupportStatusFilter("open");
                      await loadSupportRequests("open", supportCategoryFilter);
                    }}
                  >
                    Ver tickets em aberto
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="premium-card admin-console-section admin-radar-region" style={panelStyle}>
            <div className="section-head">
              <div>
                <p className="section-kicker">Pulso operacional</p>
                <h3 style={{ margin: "4px 0 0" }}>Sinais principais</h3>
              </div>
            </div>
            <div style={{ opacity: 0.8, marginBottom: 2, fontSize: 13 }}>
              Indicadores baseados na lista atual.
            </div>
            <div className="admin-radar-grid">
              <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                <div style={{ opacity: 0.76, fontSize: 12 }}>Acesso • pendentes</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }}>{betaAccessStats.pending}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>Taxa pendente: {betaAccessStats.pendingRate}</div>
              </div>

              <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                <div style={{ opacity: 0.76, fontSize: 12 }}>Acesso • aprovados / reprovados</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
                  {betaAccessStats.approved} / {betaAccessStats.rejected}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                  Aprovação: {betaAccessStats.approvalRate} • Reprovação: {betaAccessStats.rejectionRate}
                </div>
              </div>

              <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                <div style={{ opacity: 0.76, fontSize: 12 }}>Suporte • em aberto / em análise</div>
                <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
                  {supportStats.open} / {supportStats.inReview}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                  Tickets ativos: {supportStats.unresolved}
                </div>
              </div>

              <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                <div style={{ opacity: 0.76, fontSize: 12 }}>Suporte • resolvidos</div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }}>{supportStats.resolved}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                  Taxa de resolução: {supportStats.resolutionRate}
                </div>
              </div>

              <div className="premium-card-soft admin-subpanel admin-subpanel-stat">
                <div style={{ opacity: 0.76, fontSize: 12 }}>Movimento hoje</div>
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>
                  +{todayStats.betaApprovedToday} aprovados • {todayStats.betaRejectedToday} reprovados
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82 }}>
                  Pendentes novos: {todayStats.betaPendingToday} • Tickets criados: {todayStats.supportCreatedToday}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {actionDraft ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(2,6,23,0.58)",
            backdropFilter: "blur(2px)",
            display: "grid",
            placeItems: "center",
            padding: 14,
          }}
          onClick={() => {
            if (supportUpdatingId || betaAccessUpdatingId) return;
            setActionDraft(null);
          }}
        >
          <div
            className="premium-card admin-modal-card"
            style={{ width: "min(520px, 100%)", padding: 14, display: "grid", gap: 10 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <p className="section-kicker" style={{ marginBottom: 6 }}>
                Nota operacional
              </p>
              <h3 style={{ margin: 0 }}>
                {actionDraft.kind === "support" ? "Atualizar ticket de suporte" : "Atualizar solicitação da fila beta"}
              </h3>
              <div style={{ marginTop: 6, opacity: 0.82, fontSize: 13 }}>
                Novo status: <strong>{actionDraftLabel}</strong>
              </div>
            </div>

            {"ownerLabel" in actionDraft ? (
              <label className="field-label-ea">
                <span>Responsável operacional</span>
                <input
                  className="field-ea"
                  value={actionDraft.ownerLabel}
                  onChange={(event) =>
                    setActionDraft((current) => (current && "ownerLabel" in current ? { ...current, ownerLabel: event.target.value } : current))
                  }
                  placeholder="Ex.: Financeiro, Turno manhã, Operação"
                  disabled={
                    supportUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch") ||
                    betaAccessUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")
                  }
                />
              </label>
            ) : null}

            {"queueLabel" in actionDraft ? (
              <label className="field-label-ea">
                <span>Fila operacional</span>
                <input
                  className="field-ea"
                  value={actionDraft.queueLabel}
                  onChange={(event) =>
                    setActionDraft((current) => (current && "queueLabel" in current ? { ...current, queueLabel: event.target.value } : current))
                  }
                  placeholder="Ex.: Atendimento, Financeiro, Operação"
                  disabled={
                    supportUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch") ||
                    betaAccessUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")
                  }
                />
              </label>
            ) : null}

            <label className="field-label-ea">
              <span>Nota interna (opcional)</span>
              <textarea
                className="field-ea"
                rows={4}
                value={actionDraft.note}
                onChange={(event) =>
                  setActionDraft((current) => (current ? { ...current, note: event.target.value } : current))
                }
                placeholder="Adicione contexto para o time (opcional)"
                disabled={
                  supportUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch") ||
                  betaAccessUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")
                }
              />
            </label>

            {"resolutionSummary" in actionDraft ? (
              <label className="field-label-ea">
                <span>Resumo de resolução</span>
                <textarea
                  className="field-ea"
                  rows={3}
                  value={actionDraft.resolutionSummary}
                  onChange={(event) =>
                    setActionDraft((current) =>
                      current && "resolutionSummary" in current ? { ...current, resolutionSummary: event.target.value } : current
                    )
                  }
                  placeholder="O que foi validado ou resolvido neste ticket"
                  disabled={supportUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")}
                />
              </label>
            ) : null}

            {"nextStep" in actionDraft ? (
              <label className="field-label-ea">
                <span>Próximo passo orientado</span>
                <input
                  className="field-ea"
                  value={actionDraft.nextStep}
                  onChange={(event) =>
                    setActionDraft((current) =>
                      current && "nextStep" in current ? { ...current, nextStep: event.target.value } : current
                    )
                  }
                  placeholder="O que o usuário ou o time deve fazer depois"
                  disabled={supportUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")}
                />
              </label>
            ) : null}

            {"decisionReason" in actionDraft ? (
              <label className="field-label-ea">
                <span>Motivo da decisão</span>
                <textarea
                  className="field-ea"
                  rows={3}
                  value={actionDraft.decisionReason}
                  onChange={(event) =>
                    setActionDraft((current) =>
                      current && "decisionReason" in current ? { ...current, decisionReason: event.target.value } : current
                    )
                  }
                  placeholder="Justifique aprovação, rejeição ou retorno para a fila"
                  disabled={betaAccessUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")}
                />
              </label>
            ) : null}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                className="btn-ea btn-ghost btn-sm"
                onClick={() => setActionDraft(null)}
                disabled={
                  supportUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch") ||
                  betaAccessUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")
                }
              >
                Cancelar
              </button>
              <button
                className="btn-ea btn-primary btn-sm"
                onClick={submitActionDraft}
                disabled={
                  supportUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch") ||
                  betaAccessUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")
                }
              >
                {supportUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch") ||
                betaAccessUpdatingId === ("item" in actionDraft ? actionDraft.item.id : "batch")
                  ? "Salvando..."
                  : "Confirmar atualização"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
