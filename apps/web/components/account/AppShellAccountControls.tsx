"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAccountCenter } from "./AccountCenterProvider";

const ACCOUNT_ROUTE = "/dashboard/account";

function normalizePath(pathname: string) {
  if (!pathname) return "/";
  const normalized = pathname.trim();
  if (!normalized || normalized === "/") return "/";
  return normalized.replace(/\/+$/, "") || "/";
}

function shouldHideAccountControls(pathname: string): boolean {
  const current = normalizePath(pathname);
  const publicStandaloneRoutes = new Set([
    "/",
    "/login",
    "/how-it-works",
    "/termos",
    "/privacidade",
    "/transparencia-ia",
    "/uso-aceitavel",
    "/cancelamento-e-reembolso",
    "/como-operamos",
  ]);
  if (current === "/") return true;
  if (current.startsWith("/login")) return true;
  if (publicStandaloneRoutes.has(current)) return true;
  if (current.startsWith("/api")) return true;
  return false;
}

function getInitials(email?: string | null) {
  const value = String(email || "").trim();
  if (!value) return "EA";
  const [local] = value.split("@");
  return local.slice(0, 2).toUpperCase() || "EA";
}

export function AppShellAccountControls() {
  const pathname = usePathname() || "";
  const {
    overview,
    unreadCount,
    drawerOpen,
    toggleDrawer,
  } = useAccountCenter();

  const hidden = shouldHideAccountControls(pathname);
  const email = String(overview?.profile?.email || "").trim();
  const plan = String(overview?.plan?.plan_code || "").trim() || "Conta";
  const initials = useMemo(() => getInitials(email), [email]);

  if (hidden) return null;

  return (
    <div className="app-account-controls" aria-label="Conta e notificações">
      <button
        type="button"
        className="app-account-inbox-button"
        aria-label={`Abrir notificações${unreadCount ? ` (${unreadCount} não lidas)` : ""}`}
        aria-expanded={drawerOpen}
        onClick={toggleDrawer}
      >
        <span className="app-account-inbox-icon" aria-hidden>
          Caixa
        </span>
        <span className="app-account-inbox-copy">
          <strong>Inbox</strong>
          <span>{unreadCount > 0 ? `${unreadCount} pendente(s)` : "Tudo acompanhado"}</span>
        </span>
        {unreadCount > 0 ? <span className="app-account-inbox-count">{unreadCount}</span> : null}
      </button>

      <Link href={ACCOUNT_ROUTE} prefetch={false} className="app-account-link">
        <span className="app-account-avatar" aria-hidden>
          {initials}
        </span>
        <span className="app-account-link-copy">
          <strong>{email || "Conta"}</strong>
          <span>{plan}</span>
        </span>
      </Link>
    </div>
  );
}
