"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { api } from "../lib/api";
import { clearServerSession } from "../lib/clientSessionSync";
import { resolvePlanLabel } from "../lib/planLabel";
import { toUserFacingError } from "../lib/uiFeedback";

type DashboardData = {
  ok: boolean;
  user: { id: string; email: string };
  plan: string;
  wallet: any | null;
  projects: any[];
};

export type BetaAccessStatus = "pending" | "approved" | "rejected";

export type BetaAccessState = {
  approved: boolean;
  requested: boolean;
  status: BetaAccessStatus;
  request_id?: string | null;
  approved_at?: string | null;
  admin_bypass?: boolean;
};

type Options = {
  loadDashboard?: boolean;
};

function isRecoverableAccessError(message: string) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("demorou demais para responder") ||
    normalized.includes("não foi possível conectar com a api") ||
    normalized.includes("nao foi possivel conectar com a api") ||
    normalized.includes("erro ao comunicar com a api") ||
    normalized.includes("failed to fetch")
  );
}

export function useDashboardBootstrap(options: Options = {}) {
  const { loadDashboard = true } = options;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accessResolved, setAccessResolved] = useState(false);
  const [syncingSubscription, setSyncingSubscription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [planLabel, setPlanLabel] = useState<string | null>(null);
  const [planCodeRaw, setPlanCodeRaw] = useState<string | null>(null);
  const [wallet, setWallet] = useState<any | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [betaAccess, setBetaAccess] = useState<BetaAccessState | null>(null);

  const resetDashboardState = useCallback(() => {
    setPlanLabel(null);
    setPlanCodeRaw(null);
    setWallet(null);
    setProjects([]);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessResolved(false);
    setError(null);

    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (!session) {
      router.replace("/login");
      setLoading(false);
      return;
    }

    setEmail(session.user.email ?? "");

    const dashboardPromise = loadDashboard
      ? api
          .getDashboard({
            accessToken: session.access_token,
            user: {
              id: session.user.id,
              email: session.user.email ?? "",
            },
          })
          .then(
            (dashboard) => ({ ok: true as const, dashboard }),
            (dashboardError) => ({ ok: false as const, dashboardError })
          )
      : null;

    try {
      const betaPayload = await api.betaAccessMe();
      const access = betaPayload?.access as BetaAccessState | undefined;
      if (access && access.approved !== true) {
        setBetaAccess({
          approved: false,
          requested: Boolean(access.requested),
          status: access.status || "pending",
          request_id: access.request_id || null,
          approved_at: access.approved_at || null,
          admin_bypass: Boolean(access.admin_bypass),
        });
        resetDashboardState();
        setAccessResolved(true);
        setLoading(false);
        return;
      }

      if (access && access.approved === true) {
        setBetaAccess({
          approved: true,
          requested: Boolean(access.requested),
          status: "approved",
          request_id: access.request_id || null,
          approved_at: access.approved_at || null,
          admin_bypass: Boolean(access.admin_bypass),
        });
      } else {
        setBetaAccess(null);
      }
      setAccessResolved(true);
    } catch (betaError: any) {
      const betaMessage = String(betaError?.message || "");
      if (betaMessage.includes("beta_access_required")) {
        setBetaAccess({
          approved: false,
          requested: true,
          status: "pending",
        });
        resetDashboardState();
        setAccessResolved(true);
        setLoading(false);
        return;
      }

      if (!isRecoverableAccessError(betaMessage)) {
        setError(toUserFacingError(betaMessage, "Falha ao validar acesso do beta."));
        resetDashboardState();
        setAccessResolved(true);
        setLoading(false);
        return;
      }

      setAccessResolved(true);
    }

    if (!loadDashboard) {
      setLoading(false);
      return;
    }

    try {
      const dashboardResult = await dashboardPromise;
      if (!dashboardResult?.ok) {
        throw dashboardResult?.dashboardError;
      }
      const dashboard = dashboardResult.dashboard as DashboardData;

      const nextPlanCodeRaw = String(dashboard.plan ?? "FREE").toUpperCase();
      const nextPlanLabel = resolvePlanLabel(nextPlanCodeRaw);

      setPlanCodeRaw(nextPlanCodeRaw);
      setPlanLabel(nextPlanLabel);
      setWallet(dashboard.wallet ?? null);
      setProjects(Array.isArray(dashboard.projects) ? dashboard.projects : []);
    } catch (loadError: any) {
      setError(toUserFacingError(loadError?.message, "Falha ao carregar dados da conta."));
      resetDashboardState();
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, resetDashboardState, router]);

  useEffect(() => {
    load();
  }, [load]);

  const onLogout = useCallback(async () => {
    await supabase.auth.signOut();
    await clearServerSession().catch(() => null);

    if (typeof window !== "undefined") {
      window.location.assign("/");
      return;
    }

    router.replace("/");
  }, [router]);

  const onSyncSubscription = useCallback(async () => {
    try {
      setSyncingSubscription(true);
      setError(null);
      await api.refreshStripeSubscription();
      await load();
    } catch (syncError: any) {
      setError(toUserFacingError(syncError?.message, "Falha ao sincronizar assinatura."));
    } finally {
      setSyncingSubscription(false);
    }
  }, [load]);

  const betaBlocked = useMemo(
    () => !loading && !!betaAccess && betaAccess.approved !== true,
    [betaAccess, loading]
  );
  const accessReady = useMemo(
    () => accessResolved && (!betaAccess || betaAccess.approved === true),
    [accessResolved, betaAccess]
  );

  return {
    loading,
    accessReady,
    syncingSubscription,
    error,
    email,
    planLabel,
    planCodeRaw,
    wallet,
    projects,
    betaAccess,
    betaBlocked,
    refresh: load,
    setError,
    onLogout,
    onSyncSubscription,
  };
}
