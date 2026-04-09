import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { isAdminUser } from "../utils/adminAuth.js";
import { getBetaAccessStateForUser } from "../utils/betaAccess.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import { mergeUserPreferences, prefsKey } from "../utils/userPreferences.js";

const router = express.Router();

router.use(authMiddleware);

function toIsoOrNull(value) {
  const raw = String(value || "").trim();
  return raw || null;
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
}) {
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

function normalizeFinancialState(value) {
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

function mapFinancialAsyncState(transaction) {
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

function mapSupportAsyncState(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "in_review") return "running";
  if (normalized === "resolved") return "manually_resolved";
  return "queued";
}

function mapBetaAsyncState(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved") return "confirmed";
  if (normalized === "rejected") return "needs_attention";
  return "queued";
}

function mapPublishAsyncState(rawValue) {
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

function buildProjectNotifications(projects) {
  const notifications = [];

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

function countAsyncStates(notifications) {
  return notifications.reduce((acc, item) => {
    const key = String(item?.status_code || "confirmed").trim() || "confirmed";
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
}

router.get("/overview", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);

    const [prefsResult, subscriptionResult, walletResult, supportResult, transactionsResult, projectsResult, betaStateResult] =
      await Promise.allSettled([
        supabase.from("configs").select("value").eq("key", prefsKey(req.user.id)).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", req.user.id)
          .in("status", ["active", "trialing", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("creator_coins_wallet")
          .select("user_id, common, pro, ultra, updated_at")
          .eq("user_id", req.user.id)
          .maybeSingle(),
        supabase
          .from("support_requests")
          .select("id, category, subject, status, admin_note, metadata, created_at, updated_at")
          .eq("user_id", req.user.id)
          .order("updated_at", { ascending: false })
          .limit(6),
        supabase
          .from("coins_transactions")
          .select("id, coin_type, amount, reason, feature, ref_kind, ref_id, meta, created_at")
          .eq("user_id", req.user.id)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("projects")
          .select("id, title, name, kind, type, data, created_at, updated_at")
          .eq("user_id", req.user.id)
          .order("updated_at", { ascending: false })
          .limit(8),
        getBetaAccessStateForUser({
          userId: req.user.id,
          email: req.user.email,
        }),
      ]);

    const preferences =
      prefsResult.status === "fulfilled"
        ? mergeUserPreferences(prefsResult.value?.data?.value)
        : mergeUserPreferences(null);

    const subscription =
      subscriptionResult.status === "fulfilled" ? subscriptionResult.value?.data || null : null;
    const walletRow = walletResult.status === "fulfilled" ? walletResult.value?.data || null : null;
    const supportItems =
      supportResult.status === "fulfilled" && Array.isArray(supportResult.value?.data)
        ? supportResult.value.data
        : [];
    const transactions =
      transactionsResult.status === "fulfilled" && Array.isArray(transactionsResult.value?.data)
        ? transactionsResult.value.data
        : [];
    const projects =
      projectsResult.status === "fulfilled" && Array.isArray(projectsResult.value?.data)
        ? projectsResult.value.data
        : [];
    const betaState =
      betaStateResult.status === "fulfilled"
        ? betaStateResult.value
        : { approved: true, requested: true, status: "approved", requestId: null, approvedAt: null };

    const notifications = [];

    notifications.push(
      ...supportItems.map((item) =>
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

    if (betaState?.status) {
      notifications.push(
        buildNotification({
          id: `beta:${req.user.id}:${betaState.status}:${betaState.approvedAt || "latest"}`,
          source: "beta_access",
          title: "Acesso da conta",
          message:
            betaState.status === "approved"
              ? "Seu acesso está confirmado para continuar usando a plataforma."
              : betaState.status === "rejected"
                ? "Seu acesso exige revisão manual antes de continuar."
                : "Seu acesso continua na fila de aprovação.",
          createdAt: toIsoOrNull(betaState.approvedAt) || new Date().toISOString(),
          statusCode: mapBetaAsyncState(betaState.status),
          href: "/dashboard/account",
          meta: {
            request_id: betaState.requestId || null,
          },
        })
      );
    }

    notifications.push(
      ...transactions.map((tx) =>
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

    notifications.sort((left, right) => {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

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

    const response = {
      ok: true,
      profile: {
        id: req.user.id,
        email: req.user.email || "",
        created_at: req.user.created_at || null,
        last_sign_in_at: req.user.last_sign_in_at || null,
        email_confirmed_at: req.user.email_confirmed_at || null,
        is_admin: isAdminUser(req.user),
      },
      plan: {
        plan_code: subscription?.plan_code || "FREE",
        status: subscription?.status || "inactive",
      },
      wallet,
      preferences,
      beta_access: {
        approved: Boolean(betaState?.approved),
        requested: Boolean(betaState?.requested),
        status: betaState?.status || "approved",
        request_id: betaState?.requestId || null,
        approved_at: betaState?.approvedAt || null,
      },
      support: {
        unresolved_count: supportItems.filter((item) => item.status !== "resolved").length,
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
    };

    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: "account_overview_failed", message: error?.message || "Erro interno" });
  }
});

export default router;
