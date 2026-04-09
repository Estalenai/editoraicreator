"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { api } from "../../lib/api";
import { describeUnifiedAsyncState } from "../../lib/asyncStates";
import { AsyncStateBadge } from "./AsyncStateBadge";

type AccountOverview = any;
const ACCOUNT_ROUTE = "/dashboard/account";

type NotificationItem = {
  id: string;
  source: string;
  title: string;
  message: string;
  created_at: string;
  status_code: string;
  href?: string;
  meta?: Record<string, any>;
  local?: boolean;
};

type SavePreferencesPatch = Record<string, boolean | string>;

type AccountCenterContextValue = {
  overview: AccountOverview | null;
  loading: boolean;
  error: string | null;
  notifications: NotificationItem[];
  unreadCount: number;
  drawerOpen: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  toggleDrawer: () => void;
  closeDrawer: () => void;
  refresh: (silent?: boolean) => Promise<void>;
  savePreferences: (patch: SavePreferencesPatch) => Promise<boolean>;
  pushLocalNotification: (input: Omit<NotificationItem, "id" | "created_at" | "local">) => void;
};

const AccountCenterContext = createContext<AccountCenterContextValue | null>(null);

const READ_IDS_STORAGE_KEY = "editor_ai_account_notification_reads_v1";
const LOCAL_NOTIFICATION_STORAGE_KEY = "editor_ai_account_local_notifications_v1";

function isPublicStandaloneRoute(pathname: string) {
  const current = String(pathname || "").trim() || "/";
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
  return (
    current === "/" ||
    current.startsWith("/login") ||
    publicStandaloneRoutes.has(current) ||
    current.startsWith("/api")
  );
}

function readStoredArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeStoredArray(key: string, values: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // best effort
  }
}

function readStoredNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_NOTIFICATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            id: String(item.id || ""),
            source: String(item.source || "system"),
            title: String(item.title || "Atualização"),
            message: String(item.message || ""),
            created_at: String(item.created_at || new Date().toISOString()),
            status_code: String(item.status_code || "confirmed"),
            href: item.href ? String(item.href) : undefined,
            meta: item.meta && typeof item.meta === "object" ? item.meta : {},
            local: true,
          }))
          .filter((item) => item.id)
      : [];
  } catch {
    return [];
  }
}

function writeStoredNotifications(items: NotificationItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LOCAL_NOTIFICATION_STORAGE_KEY,
      JSON.stringify(items.slice(0, 20))
    );
  } catch {
    // best effort
  }
}

function shouldIncludeNotification(preferences: Record<string, any> | undefined, item: NotificationItem) {
  if (!preferences?.notification_inbox_enabled) return false;
  if (item.source === "support" && preferences.notification_support_updates === false) return false;
  if (item.source === "credits" && preferences.notification_financial_updates === false) return false;
  if (item.source === "projects" && preferences.notification_async_updates === false) return false;
  return true;
}

function buildToastText(item: NotificationItem) {
  const asyncState = describeUnifiedAsyncState(item.status_code);
  return {
    title: item.title,
    detail: `${asyncState.label} • ${item.message}`,
  };
}

export function AccountCenterProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const hiddenOnRoute = isPublicStandaloneRoute(pathname);
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [localNotifications, setLocalNotifications] = useState<NotificationItem[]>([]);
  const [toastIds, setToastIds] = useState<string[]>([]);

  useEffect(() => {
    setReadIds(readStoredArray(READ_IDS_STORAGE_KEY));
    setLocalNotifications(readStoredNotifications());
  }, []);

  useEffect(() => {
    writeStoredArray(READ_IDS_STORAGE_KEY, readIds);
  }, [readIds]);

  useEffect(() => {
    writeStoredNotifications(localNotifications);
  }, [localNotifications]);

  const refresh = useCallback(
    async (silent = false) => {
      if (hiddenOnRoute) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setOverview(null);
        setError(null);
        if (!silent) setLoading(false);
        return;
      }

      if (!silent) setLoading(true);
      setError(null);
      try {
        const payload = await api.accountOverview();
        setOverview(payload || null);
      } catch (loadError: any) {
        setError(loadError?.message || "Falha ao carregar conta.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [hiddenOnRoute]
  );

  useEffect(() => {
    if (hiddenOnRoute) return;
    refresh();

    const intervalId = window.setInterval(() => {
      void refresh(true);
    }, 45000);

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void refresh(true);
    });

    return () => {
      window.clearInterval(intervalId);
      subscription.subscription.unsubscribe();
    };
  }, [hiddenOnRoute, refresh]);

  const remoteNotifications = useMemo(() => {
    const items = Array.isArray(overview?.notifications?.items) ? overview.notifications.items : [];
    return items
      .map((item: any) => ({
        id: String(item.id || ""),
        source: String(item.source || "system"),
        title: String(item.title || "Atualização"),
        message: String(item.message || ""),
        created_at: String(item.created_at || new Date().toISOString()),
        status_code: String(item.status_code || "confirmed"),
        href: item.href ? String(item.href) : undefined,
        meta: item.meta && typeof item.meta === "object" ? item.meta : {},
      }))
      .filter((item: NotificationItem) => item.id && shouldIncludeNotification(overview?.preferences, item));
  }, [overview]);

  const notifications = useMemo(() => {
    const merged = [...localNotifications, ...remoteNotifications];
    merged.sort((left, right) => {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
    return merged;
  }, [localNotifications, remoteNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds.includes(item.id)).length,
    [notifications, readIds]
  );

  const markRead = useCallback((id: string) => {
    setReadIds((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((current) => Array.from(new Set([...current, ...notifications.map((item) => item.id)])));
  }, [notifications]);

  const pushLocalNotification = useCallback(
    (input: Omit<NotificationItem, "id" | "created_at" | "local">) => {
      const item: NotificationItem = {
        id: `local:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        source: input.source,
        title: input.title,
        message: input.message,
        created_at: new Date().toISOString(),
        status_code: input.status_code,
        href: input.href,
        meta: input.meta,
        local: true,
      };
      setLocalNotifications((current) => [item, ...current].slice(0, 20));
      if (overview?.preferences?.notification_toasts_enabled !== false) {
        setToastIds((current) => [item.id, ...current].slice(0, 3));
        window.setTimeout(() => {
          setToastIds((current) => current.filter((toastId) => toastId !== item.id));
        }, 5200);
      }
    },
    [overview?.preferences]
  );

  const savePreferences = useCallback(
    async (patch: SavePreferencesPatch) => {
      try {
        const response = await apiFetchPreferencesPatch(patch);
        if (!response) return false;
        setOverview((current: AccountOverview | null) =>
          current
            ? {
                ...current,
                preferences: {
                  ...current.preferences,
                  ...response.prefs,
                },
              }
            : current
        );
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const value = useMemo<AccountCenterContextValue>(
    () => ({
      overview,
      loading,
      error,
      notifications,
      unreadCount,
      drawerOpen,
      markRead,
      markAllRead,
      toggleDrawer: () => setDrawerOpen((current) => !current),
      closeDrawer: () => setDrawerOpen(false),
      refresh,
      savePreferences,
      pushLocalNotification,
    }),
    [
      drawerOpen,
      error,
      loading,
      markAllRead,
      markRead,
      notifications,
      overview,
      pushLocalNotification,
      refresh,
      savePreferences,
      unreadCount,
    ]
  );

  const visibleToasts = useMemo(
    () => toastIds
      .map((id) => notifications.find((item) => item.id === id))
      .filter(Boolean) as NotificationItem[],
    [notifications, toastIds]
  );

  return (
    <AccountCenterContext.Provider value={value}>
      {children}
      {!hiddenOnRoute && drawerOpen ? (
        <div className="account-notification-overlay" onClick={() => setDrawerOpen(false)}>
          <aside
            className="account-notification-drawer"
            aria-label="Central de notificações"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="account-notification-drawer-head">
              <div>
                <p className="section-kicker">Inbox operacional</p>
                <h3 className="heading-reset">Notificações</h3>
              </div>
              <div className="hero-actions-row">
                <button type="button" className="btn-ea btn-ghost btn-sm" onClick={() => void refresh(true)}>
                  Atualizar
                </button>
                <button type="button" className="btn-ea btn-secondary btn-sm" onClick={markAllRead}>
                  Marcar tudo como lido
                </button>
              </div>
            </div>
            <div className="account-notification-drawer-copy">
              Acompanhe suporte, financeiro e fluxos assíncronos sem depender da tela onde o evento começou.
            </div>
            <div className="account-notification-list">
              {notifications.length === 0 ? (
                <div className="state-ea">
                  <p className="state-ea-title">Nenhuma atualização no momento</p>
                  <div className="state-ea-text">
                    Quando suporte, ledger ou publish avançarem, a trilha aparece aqui.
                  </div>
                </div>
              ) : (
                notifications.map((item) => {
                  const toastText = buildToastText(item);
                  const isRead = readIds.includes(item.id);
                  return (
                    <Link
                      key={item.id}
                      href={item.href || ACCOUNT_ROUTE}
                      className="account-notification-item"
                      data-read={isRead ? "true" : "false"}
                      onClick={() => markRead(item.id)}
                    >
                      <div className="account-notification-item-head">
                        <strong>{item.title}</strong>
                        <AsyncStateBadge state={item.status_code} compact />
                      </div>
                      <p>{toastText.detail}</p>
                      <div className="account-notification-item-meta">
                        <span>{item.source}</span>
                        <span>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </aside>
        </div>
      ) : null}
      {!hiddenOnRoute && visibleToasts.length > 0 ? (
        <div className="account-toast-stack" aria-live="polite">
          {visibleToasts.map((item) => {
            const toastText = buildToastText(item);
            return (
              <div key={item.id} className="account-toast-card">
                <div className="account-toast-head">
                  <strong>{toastText.title}</strong>
                  <AsyncStateBadge state={item.status_code} compact />
                </div>
                <p>{toastText.detail}</p>
              </div>
            );
          })}
        </div>
      ) : null}
    </AccountCenterContext.Provider>
  );
}

async function apiFetchPreferencesPatch(patch: SavePreferencesPatch) {
  return api.updatePreferences(patch);
}

export function useAccountCenter() {
  const context = useContext(AccountCenterContext);
  if (!context) {
    throw new Error("useAccountCenter must be used inside AccountCenterProvider");
  }
  return context;
}
