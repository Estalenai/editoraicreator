import { NextRequest, NextResponse } from "next/server";
import { AUTH_ACCESS_COOKIE, AUTH_BETA_STATUS_COOKIE, validateSupabaseAccessToken } from "../../../../lib/authGate";
import { buildUpstreamUrl, resolveUpstreamBaseUrl } from "../../../../lib/upstreamApi";

export const dynamic = "force-dynamic";

const DEFAULT_PREFERENCES = {
  prompt_auto_enabled: true,
  prompt_auto_apply: false,
  prompt_auto_dont_ask_again: false,
  ai_execution_mode_preference: "automatic_quality",
  language: "pt-BR",
  notification_inbox_enabled: true,
  notification_toasts_enabled: true,
  notification_support_updates: true,
  notification_financial_updates: true,
  notification_async_updates: true,
};

type NotificationItem = {
  id: string;
  source: string;
  title: string;
  message: string;
  created_at: string;
  status_code: string;
  href: string;
  meta?: Record<string, unknown>;
};

function mergeUserPreferences(stored: unknown) {
  const safeStored = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  return { ...DEFAULT_PREFERENCES, ...safeStored };
}

function toIsoOrNull(value: unknown) {
  const raw = String(value || "").trim();
  return raw || null;
}

function normalizeFinancialState(value: unknown) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "unknown";
  if (text.includes("reconc")) return "reconciled";
  if (text.includes("disput")) return "disputed";
  if (text.includes("refund")) return "refunded";
  if (text.includes("fail") || text.includes("cancel") || text.includes("declin")) return "failed";
  if (text.includes("pend") || text.includes("process") || text.includes("await")) return "pending";
  if (text.includes("settl") || text.includes("paid") || text.includes("confirm")) return "settled";
  if (text.includes("post")) return "posted";
  return "unknown";
}

function mapFinancialAsyncState(transaction: any) {
  const meta = transaction?.meta && typeof transaction.meta === "object" ? transaction.meta : {};
  const state = normalizeFinancialState(
    meta.financial_state ||
      meta.settlement_status ||
      meta.reconciliation_status ||
      meta.processing_state
  );

  if (state === "pending") return "queued";
  if (state === "failed" || state === "disputed") return "needs_attention";
  if (state === "refunded") return "manually_resolved";
  if (state === "settled" || state === "reconciled" || state === "posted") return "confirmed";
  return "confirmed";
}

function mapSupportAsyncState(status: unknown) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "in_review") return "running";
  if (normalized === "resolved") return "manually_resolved";
  return "queued";
}

function mapBetaAsyncState(status: unknown) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved") return "confirmed";
  if (normalized === "rejected") return "needs_attention";
  return "queued";
}

function mapPublishAsyncState(rawValue: unknown) {
  const normalized = String(rawValue || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("retry")) return "retrying";
  if (normalized.includes("partial")) return "partially_failed";
  if (
    normalized.includes("queued") ||
    normalized.includes("pending") ||
    normalized.includes("requested") ||
    normalized.includes("building") ||
    normalized.includes("running") ||
    normalized.includes("processing") ||
    normalized.includes("syncing")
  ) {
    return "running";
  }
  if (
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("canceled") ||
    normalized.includes("attention")
  ) {
    return "needs_attention";
  }
  if (
    normalized.includes("published") ||
    normalized.includes("ready") ||
    normalized.includes("synced") ||
    normalized.includes("confirmed") ||
    normalized.includes("pr_open")
  ) {
    return "confirmed";
  }
  return null;
}

function buildNotification({
  id,
  source,
  title,
  message,
  createdAt,
  statusCode,
  href,
  meta = {},
}: {
  id: string;
  source: string;
  title: string;
  message: string;
  createdAt: string;
  statusCode: string;
  href: string;
  meta?: Record<string, unknown>;
}): NotificationItem {
  return {
    id,
    source,
    title,
    message,
    created_at: createdAt,
    status_code: statusCode,
    href,
    meta,
  };
}

function buildProjectNotifications(projects: any[]) {
  const notifications: NotificationItem[] = [];

  for (const project of projects) {
    const data = project?.data && typeof project.data === "object" ? project.data : {};
    const title = String(project?.title || project?.name || project?.id || "Projeto").trim() || "Projeto";
    const href = project?.id ? `/editor/${project.id}` : "/projects";

    const githubExport = Array.isArray(data?.integrations?.github?.exports)
      ? data.integrations.github.exports[0]
      : null;
    const githubState = mapPublishAsyncState(githubExport?.status || data?.publish?.commit?.status);
    if (githubState) {
      notifications.push(
        buildNotification({
          id: `project:github:${project.id}:${githubExport?.id || githubExport?.status || "latest"}`,
          source: "projects",
          title: `${title} • GitHub`,
          message:
            githubState === "needs_attention"
              ? "A trilha GitHub do projeto exige revisão."
              : githubState === "running"
                ? "O projeto ainda está avançando na trilha GitHub."
                : "O projeto já tem etapa confirmada na trilha GitHub.",
          createdAt: toIsoOrNull(githubExport?.exportedAt || project?.updated_at || project?.created_at) || new Date().toISOString(),
          statusCode: githubState,
          href,
          meta: {
            channel: "github",
            raw_status: githubExport?.status || null,
          },
        })
      );
    }

    const vercelStateRaw =
      data?.integrations?.vercel?.binding?.lastDeployState ||
      data?.publish?.deployment?.status ||
      data?.publish?.deployment?.readyState;
    const vercelState = mapPublishAsyncState(vercelStateRaw);
    if (vercelState) {
      notifications.push(
        buildNotification({
          id: `project:vercel:${project.id}:${String(vercelStateRaw || "latest")}`,
          source: "projects",
          title: `${title} • Deploy`,
          message:
            vercelState === "needs_attention"
              ? "O deployment mais recente precisa de atenção."
              : vercelState === "running"
                ? "O deployment do projeto continua em andamento."
                : "O deployment já foi confirmado para este projeto.",
          createdAt:
            toIsoOrNull(
              data?.integrations?.vercel?.binding?.lastDeployReadyAt ||
                data?.integrations?.vercel?.binding?.lastDeployRequestedAt ||
                project?.updated_at ||
                project?.created_at
            ) || new Date().toISOString(),
          statusCode: vercelState,
          href,
          meta: {
            channel: "vercel",
            raw_status: vercelStateRaw || null,
          },
        })
      );
    }
  }

  return notifications;
}

function countAsyncStates(notifications: NotificationItem[]) {
  return notifications.reduce<Record<string, number>>((acc, item) => {
    const key = String(item?.status_code || "confirmed").trim() || "confirmed";
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getSupabaseAuthUserUrl() {
  const baseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/auth/v1/user`;
}

function getSupabaseAnonKey() {
  return String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
}

async function resolveSupabaseProfile(accessToken: string) {
  const authUserUrl = getSupabaseAuthUserUrl();
  const anonKey = getSupabaseAnonKey();
  if (!authUserUrl || !anonKey) return null;

  const response = await fetch(authUserUrl, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

async function fetchUpstreamJson(
  request: NextRequest,
  accessToken: string,
  pathSegments: string[],
  search?: Record<string, string>,
) {
  const upstreamBaseUrl = resolveUpstreamBaseUrl(request.url);
  if (!upstreamBaseUrl) {
    return { ok: false, status: 500, payload: { error: "api_base_url_missing" } };
  }

  const upstreamUrl = new URL(buildUpstreamUrl(upstreamBaseUrl, pathSegments, request.url));
  Object.entries(search || {}).forEach(([key, value]) => {
    upstreamUrl.searchParams.set(key, value);
  });

  const response = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!response) {
    return { ok: false, status: 502, payload: { error: "upstream_unreachable" } };
  }

  const payload = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
}

export async function GET(request: NextRequest) {
  const accessToken = String(request.cookies.get(AUTH_ACCESS_COOKIE)?.value || "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const user = await validateSupabaseAccessToken(accessToken);
  if (!user?.id) {
    return NextResponse.json({ error: "invalid_session_token" }, { status: 401 });
  }

  const [
    profileResult,
    preferencesResult,
    subscriptionResult,
    walletResult,
    supportResult,
    transactionsResult,
    projectsResult,
    betaAccessResult,
  ] = await Promise.all([
    resolveSupabaseProfile(accessToken),
    fetchUpstreamJson(request, accessToken, ["preferences"]),
    fetchUpstreamJson(request, accessToken, ["subscriptions", "me"]),
    fetchUpstreamJson(request, accessToken, ["coins", "balance"]),
    fetchUpstreamJson(request, accessToken, ["support", "requests", "me"], { limit: "6" }),
    fetchUpstreamJson(request, accessToken, ["coins", "transactions"], { limit: "8" }),
    fetchUpstreamJson(request, accessToken, ["projects"]),
    fetchUpstreamJson(request, accessToken, ["beta-access", "me"]),
  ]);

  const preferences = mergeUserPreferences(preferencesResult.payload?.prefs);
  const walletRow = walletResult.payload?.wallet || null;
  const wallet = {
    common: Number(walletRow?.common ?? 0),
    pro: Number(walletRow?.pro ?? 0),
    ultra: Number(walletRow?.ultra ?? 0),
    updated_at: walletRow?.updated_at || null,
    total:
      Number(walletRow?.common ?? 0) +
      Number(walletRow?.pro ?? 0) +
      Number(walletRow?.ultra ?? 0),
  };

  const supportItems = Array.isArray(supportResult.payload?.items) ? supportResult.payload.items.slice(0, 6) : [];
  const transactions = Array.isArray(transactionsResult.payload?.transactions)
    ? transactionsResult.payload.transactions.slice(0, 8)
    : [];
  const projects = Array.isArray(projectsResult.payload?.items) ? projectsResult.payload.items.slice(0, 8) : [];

  const subscriptionPayload = subscriptionResult.payload || {};
  const betaAccessPayload = betaAccessResult.payload?.access || {};
  const fallbackBetaStatus = String(request.cookies.get(AUTH_BETA_STATUS_COOKIE)?.value || "approved").trim().toLowerCase() || "approved";
  const betaStatus = String(betaAccessPayload.status || fallbackBetaStatus || "approved").trim().toLowerCase();

  const notifications: NotificationItem[] = [];

  notifications.push(
    ...supportItems.map((item: any) =>
      buildNotification({
        id: `support:${item.id}:${item.status}:${item.updated_at || item.created_at}`,
        source: "support",
        title: `${String(item.metadata?.support_ref || item.id || "SUP").trim()} • ${String(item.subject || "Suporte").trim()}`,
        message:
          item.status === "resolved"
            ? String(item.metadata?.resolution_summary || item.admin_note || "Seu caso foi resolvido e já pode ser consultado no histórico.")
            : item.status === "in_review"
              ? "Seu caso está em análise pela equipe."
              : "Seu caso foi aberto e aguarda triagem operacional.",
        createdAt: toIsoOrNull(item.updated_at || item.created_at) || new Date().toISOString(),
        statusCode: mapSupportAsyncState(item.status),
        href: "/support",
        meta: {
          category: item.category,
          queue_label: item.metadata?.queue_label || null,
        },
      })
    )
  );

  notifications.push(
    buildNotification({
      id: `beta:${user.id}:${betaStatus}:${betaAccessPayload.approved_at || "latest"}`,
      source: "beta_access",
      title: "Acesso da conta",
      message:
        betaStatus === "approved"
          ? "Seu acesso está confirmado para continuar usando a plataforma."
          : betaStatus === "rejected"
            ? "Seu acesso exige revisão manual antes de continuar."
            : "Seu acesso continua na fila de aprovação.",
      createdAt: toIsoOrNull(betaAccessPayload.approved_at) || new Date().toISOString(),
      statusCode: mapBetaAsyncState(betaStatus),
      href: "/dashboard/account",
      meta: {
        request_id: betaAccessPayload.request_id || null,
      },
    })
  );

  notifications.push(
    ...transactions.map((tx: any) =>
      buildNotification({
        id: `coins:${tx.id}:${tx.created_at}`,
        source: "credits",
        title: `${String(tx.feature || tx.reason || "Ledger financeiro").trim() || "Ledger financeiro"}`,
        message:
          mapFinancialAsyncState(tx) === "needs_attention"
            ? "Esta movimentação exige atenção financeira."
            : mapFinancialAsyncState(tx) === "manually_resolved"
              ? "Esta movimentação foi ajustada manualmente e segue registrada."
              : mapFinancialAsyncState(tx) === "queued"
                ? "Esta movimentação ainda está aguardando confirmação."
                : "Esta movimentação já está registrada e rastreável no ledger.",
        createdAt: toIsoOrNull(tx.created_at) || new Date().toISOString(),
        statusCode: mapFinancialAsyncState(tx),
        href: "/credits#credits-history",
        meta: {
          coin_type: tx.coin_type,
          amount: Number(tx.amount || 0),
          ref_kind: tx.ref_kind || null,
          ref_id: tx.ref_id || null,
        },
      })
    )
  );

  notifications.push(...buildProjectNotifications(projects));
  notifications.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  return NextResponse.json({
    ok: true,
    profile: {
      id: profileResult?.id || user.id,
      email: profileResult?.email || user.email || "",
      created_at: profileResult?.created_at || null,
      last_sign_in_at: profileResult?.last_sign_in_at || null,
      email_confirmed_at: profileResult?.email_confirmed_at || null,
      is_admin: String(user.email || "").trim().toLowerCase() === "desenvolvedordeappsai@gmail.com",
    },
    plan: {
      plan_code: subscriptionPayload?.plan_code || "FREE",
      status: subscriptionPayload?.status || "inactive",
    },
    wallet,
    preferences,
    beta_access: {
      approved: betaAccessPayload.approved !== false,
      requested: betaAccessPayload.requested !== false,
      status: betaStatus,
      request_id: betaAccessPayload.request_id || null,
      approved_at: betaAccessPayload.approved_at || null,
    },
    support: {
      unresolved_count: supportItems.filter((item: any) => item.status !== "resolved").length,
      recent: supportItems,
    },
    financial: {
      recent: transactions,
    },
    projects: {
      recent: projects,
    },
    notifications: {
      items: notifications.slice(0, 18),
      counts: countAsyncStates(notifications),
    },
  });
}
