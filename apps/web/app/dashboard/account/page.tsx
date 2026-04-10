"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AsyncStateBadge } from "../../../components/account/AsyncStateBadge";
import { useAccountCenter } from "../../../components/account/AccountCenterProvider";
import { describeUnifiedAsyncState, type UnifiedAsyncState } from "../../../lib/asyncStates";
import { supabase } from "../../../lib/supabaseClient";
import { CREATOR_COINS_PUBLIC_NAME } from "../../../lib/creatorCoins";
import { toUserFacingError } from "../../../lib/uiFeedback";

type PreferencesForm = {
  language: string;
  ai_execution_mode_preference: "automatic_quality" | "automatic_economy";
  prompt_auto_enabled: boolean;
  prompt_auto_apply: boolean;
  notification_inbox_enabled: boolean;
  notification_toasts_enabled: boolean;
  notification_support_updates: boolean;
  notification_financial_updates: boolean;
  notification_async_updates: boolean;
};

type SessionSnapshot = {
  expiresAt: string | null;
  provider: string | null;
};

const ASYNC_STATE_ORDER: UnifiedAsyncState[] = [
  "queued",
  "running",
  "needs_attention",
  "retrying",
  "partially_failed",
  "confirmed",
  "manually_resolved",
];

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function boolLabel(value: boolean) {
  return value ? "Ativo" : "Inativo";
}

function getInitialPreferences(source: any): PreferencesForm {
  return {
    language: String(source?.language || "pt-BR"),
    ai_execution_mode_preference:
      source?.ai_execution_mode_preference === "automatic_economy"
        ? "automatic_economy"
        : "automatic_quality",
    prompt_auto_enabled: source?.prompt_auto_enabled !== false,
    prompt_auto_apply: source?.prompt_auto_apply === true,
    notification_inbox_enabled: source?.notification_inbox_enabled !== false,
    notification_toasts_enabled: source?.notification_toasts_enabled !== false,
    notification_support_updates: source?.notification_support_updates !== false,
    notification_financial_updates: source?.notification_financial_updates !== false,
    notification_async_updates: source?.notification_async_updates !== false,
  };
}

export default function AccountPage() {
  const {
    overview,
    loading,
    error,
    notifications,
    unreadCount,
    drawerOpen,
    toggleDrawer,
    refresh,
    savePreferences,
    pushLocalNotification,
  } = useAccountCenter();

  const [preferences, setPreferences] = useState<PreferencesForm>(() => getInitialPreferences(null));
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshot>({
    expiresAt: null,
    provider: null,
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setPreferences(getInitialPreferences(overview?.preferences));
  }, [overview?.preferences]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setSessionSnapshot({
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        provider: String(session?.user?.app_metadata?.provider || "email").trim() || "email",
      });
    }

    loadSession();
    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void loadSession();
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const notificationCounts = useMemo(
    () =>
      ASYNC_STATE_ORDER.map((state) => ({
        state,
        count: Number(overview?.notifications?.counts?.[state] || 0),
        presentation: describeUnifiedAsyncState(state),
      })),
    [overview?.notifications?.counts]
  );

  const recentNotifications = useMemo(() => notifications.slice(0, 6), [notifications]);
  const wallet = overview?.wallet || { common: 0, pro: 0, ultra: 0, total: 0, updated_at: null };
  const profile = overview?.profile || {};
  const betaAccess = overview?.beta_access || {};
  const plan = overview?.plan || {};
  const unresolvedSupportCount = Number(overview?.support?.unresolved_count || 0);
  const isInitialLoading = loading && !overview && !error;
  const accountSummary = [
    { label: "Conta", value: isInitialLoading ? "Sincronizando..." : String(profile.email || "—") },
    { label: "Plano", value: isInitialLoading ? "Sincronizando..." : String(plan.plan_code || "FREE") },
    {
      label: "Saldo total",
      value: isInitialLoading
        ? "Sincronizando..."
        : `${Number(wallet.total || 0).toLocaleString("pt-BR")} ${CREATOR_COINS_PUBLIC_NAME}`,
    },
    { label: "Inbox", value: isInitialLoading ? "Sincronizando..." : unreadCount > 0 ? `${unreadCount} pendente(s)` : "Tudo acompanhado" },
  ];

  async function onSavePreferences() {
    setSavingPreferences(true);
    setSaveError(null);
    const ok = await savePreferences(preferences);
    setSavingPreferences(false);
    if (!ok) {
      setSaveError("Não foi possível salvar as preferências agora.");
      return;
    }
    pushLocalNotification({
      source: "system",
      title: "Preferências atualizadas",
      message: "Conta, inbox e automações básicas foram salvas para esta sessão.",
      status_code: "confirmed",
      href: "/dashboard/account",
      meta: { channel: "preferences" },
    });
  }

  return (
    <div className="page-shell account-page">
      <div className="account-page-canvas">
        <section className="premium-hero account-hero">
          <div className="account-hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Conta e continuidade</p>
              <h1 className="heading-reset">Conta</h1>
              <p className="section-header-copy hero-copy-compact">
                Sessão, preferências, inbox e estados assíncronos no mesmo centro operacional.
              </p>
            </div>
            <div className="hero-meta-row">
              <span className="premium-badge premium-badge-phase">
                {profile.email_confirmed_at ? "E-mail confirmado" : "Confirmação pendente"}
              </span>
              <span className="premium-badge premium-badge-warning">
                {drawerOpen ? "Inbox aberta" : unreadCount > 0 ? `${unreadCount} pendente(s)` : "Inbox acompanhada"}
              </span>
            </div>
          </div>

          <div className="account-hero-actions">
            <button type="button" className="btn-ea btn-secondary" onClick={toggleDrawer}>
              {drawerOpen ? "Fechar inbox" : "Abrir inbox"}
            </button>
            <button type="button" className="btn-ea btn-ghost" onClick={() => void refresh()}>
              Atualizar conta
            </button>
          </div>

          <div className="account-summary-grid">
            {accountSummary.map((item) => (
              <div key={item.label} className="account-summary-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </section>

        {error ? (
          <div className="state-ea state-ea-error">
            <p className="state-ea-title">Não foi possível carregar a conta</p>
            <div className="state-ea-text">{toUserFacingError(error, "Atualize a página e tente novamente.")}</div>
            <div className="state-ea-actions">
              <button type="button" className="btn-ea btn-secondary btn-sm" onClick={() => void refresh()}>
                Atualizar conta
              </button>
            </div>
          </div>
        ) : null}

        <div className="account-workspace-grid">
          <div className="account-workspace-main">
            <section className="account-section-card">
              <div className="section-head">
                <div className="section-header-ea">
                  <h2 className="heading-reset">Sessão e segurança básica</h2>
                  <p className="helper-text-ea">
                    Dados centrais da conta, sessão atual e orientação mínima para exportação ou exclusão.
                  </p>
                </div>
              </div>

              <div className="account-detail-grid">
                <div className="account-detail-card">
                  <span>Último login</span>
                  <strong>{loading ? "Sincronizando..." : formatDateTime(profile.last_sign_in_at)}</strong>
                </div>
                <div className="account-detail-card">
                  <span>Sessão atual expira</span>
                  <strong>{formatDateTime(sessionSnapshot.expiresAt)}</strong>
                </div>
                <div className="account-detail-card">
                  <span>Provider</span>
                  <strong>{sessionSnapshot.provider || "email"}</strong>
                </div>
                <div className="account-detail-card">
                  <span>Acesso beta</span>
                  <strong>{String(betaAccess.status || "approved")}</strong>
                </div>
              </div>

              <div className="account-inline-notes">
                <div className="account-inline-note">
                  <strong>Exportação e exclusão</strong>
                  <span>
                    Nesta fase, pedidos de exportação ou exclusão seguem por suporte com trilha rastreável.
                  </span>
                  <div className="hero-actions-row">
                    <Link href="/support#support-assistant" className="btn-link-ea btn-secondary btn-sm">
                      Solicitar via suporte
                    </Link>
                    <Link href="/privacidade" className="btn-link-ea btn-ghost btn-sm">
                      Ver privacidade
                    </Link>
                  </div>
                </div>
                <div className="account-inline-note">
                  <strong>Próxima defesa de conta</strong>
                  <span>
                    Gate, sessão e logout já foram endurecidos. Aqui você acompanha o estado atual sem depender da tela de login.
                  </span>
                </div>
              </div>
            </section>

            <section className="account-section-card">
              <div className="section-head">
                <div className="section-header-ea">
                  <h2 className="heading-reset">Preferências da conta</h2>
                  <p className="helper-text-ea">
                    Ajuste idioma, execução assistida e como a plataforma acompanha eventos fora da tela atual.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ea btn-primary btn-sm"
                  onClick={onSavePreferences}
                  disabled={savingPreferences}
                >
                  {savingPreferences ? "Salvando..." : "Salvar preferências"}
                </button>
              </div>

              <div className="account-preferences-grid">
                <label className="field-label-ea">
                  <span>Idioma</span>
                  <select
                    className="field-ea"
                    value={preferences.language}
                    onChange={(event) =>
                      setPreferences((current) => ({ ...current, language: event.target.value }))
                    }
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en-US">English (US)</option>
                  </select>
                </label>

                <label className="field-label-ea">
                  <span>Modo assistido</span>
                  <select
                    className="field-ea"
                    value={preferences.ai_execution_mode_preference}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        ai_execution_mode_preference: event.target.value as PreferencesForm["ai_execution_mode_preference"],
                      }))
                    }
                  >
                    <option value="automatic_quality">Automático com qualidade</option>
                    <option value="automatic_economy">Automático com economia</option>
                  </select>
                </label>

                <label className="account-toggle-card">
                  <input
                    type="checkbox"
                    checked={preferences.prompt_auto_enabled}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        prompt_auto_enabled: event.target.checked,
                      }))
                    }
                  />
                  <div>
                    <strong>Prompt automático</strong>
                    <span>{boolLabel(preferences.prompt_auto_enabled)} para enriquecer o fluxo por padrão.</span>
                  </div>
                </label>

                <label className="account-toggle-card">
                  <input
                    type="checkbox"
                    checked={preferences.prompt_auto_apply}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        prompt_auto_apply: event.target.checked,
                      }))
                    }
                  />
                  <div>
                    <strong>Aplicar sem perguntar</strong>
                    <span>Use com cautela para etapas repetitivas.</span>
                  </div>
                </label>
              </div>

              <div className="account-preferences-subgrid">
                <label className="account-toggle-card">
                  <input
                    type="checkbox"
                    checked={preferences.notification_inbox_enabled}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        notification_inbox_enabled: event.target.checked,
                      }))
                    }
                  />
                  <div>
                    <strong>Inbox operacional</strong>
                    <span>Centraliza eventos fora da página onde começaram.</span>
                  </div>
                </label>

                <label className="account-toggle-card">
                  <input
                    type="checkbox"
                    checked={preferences.notification_toasts_enabled}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        notification_toasts_enabled: event.target.checked,
                      }))
                    }
                  />
                  <div>
                    <strong>Toasts rápidos</strong>
                    <span>Confirmações curtas para eventos importantes.</span>
                  </div>
                </label>

                <label className="account-toggle-card">
                  <input
                    type="checkbox"
                    checked={preferences.notification_support_updates}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        notification_support_updates: event.target.checked,
                      }))
                    }
                  />
                  <div>
                    <strong>Suporte</strong>
                    <span>Fila, análise, resolução e encerramento do seu caso.</span>
                  </div>
                </label>

                <label className="account-toggle-card">
                  <input
                    type="checkbox"
                    checked={preferences.notification_financial_updates}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        notification_financial_updates: event.target.checked,
                      }))
                    }
                  />
                  <div>
                    <strong>Financeiro</strong>
                    <span>Ledger, confirmação, falha, estorno e disputa.</span>
                  </div>
                </label>

                <label className="account-toggle-card">
                  <input
                    type="checkbox"
                    checked={preferences.notification_async_updates}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        notification_async_updates: event.target.checked,
                      }))
                    }
                  />
                  <div>
                    <strong>Fluxos assíncronos</strong>
                    <span>Publish, deploy e jobs que avançam fora da tela atual.</span>
                  </div>
                </label>
              </div>

              {saveError ? (
                <div className="state-ea state-ea-error state-ea-spaced">
                  <p className="state-ea-title">Não foi possível salvar</p>
                  <div className="state-ea-text">{saveError}</div>
                </div>
              ) : null}
            </section>
          </div>

          <aside className="account-workspace-rail">
            <section className="account-section-card">
              <div className="section-head">
                <div className="section-header-ea">
                  <h2 className="heading-reset">Estados assíncronos</h2>
                  <p className="helper-text-ea">
                    Uma linguagem só para fila, execução, atenção, retry, parcial, confirmação e resolução manual.
                  </p>
                </div>
              </div>

              <div className="account-async-grid">
                {notificationCounts.map((item) => (
                  <div key={item.state} className="account-async-card">
                    <AsyncStateBadge state={item.state} />
                    <strong>{item.count}</strong>
                    <span>{item.presentation.detail}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="account-section-card">
              <div className="section-head">
                <div className="section-header-ea">
                  <h2 className="heading-reset">Trilha recente</h2>
                  <p className="helper-text-ea">
                    O produto acompanha suporte, financeiro e publish mesmo quando você saiu da tela de origem.
                  </p>
                </div>
              </div>

              <div className="account-notification-preview-list">
                {recentNotifications.length === 0 ? (
                  <div className="state-ea">
                    <p className="state-ea-title">Nenhuma atualização recente</p>
                    <div className="state-ea-text">Quando o sistema avançar fora da tela atual, a trilha aparece aqui.</div>
                  </div>
                ) : (
                  recentNotifications.map((item) => (
                    <Link key={item.id} href={item.href || "/dashboard/account"} className="account-notification-preview-item">
                      <div className="account-notification-preview-head">
                        <strong>{item.title}</strong>
                        <AsyncStateBadge state={item.status_code} compact />
                      </div>
                      <p>{item.message}</p>
                      <span>{formatDateTime(item.created_at)}</span>
                    </Link>
                  ))
                )}
              </div>
            </section>

            <section className="account-section-card">
              <div className="section-head">
                <div className="section-header-ea">
                  <h2 className="heading-reset">Sinais da conta</h2>
                  <p className="helper-text-ea">Camada curta de contexto para uso diário e suporte.</p>
                </div>
              </div>

              <div className="account-inline-notes">
                <div className="account-inline-note">
                  <strong>Suporte aberto</strong>
                  <span>{unresolvedSupportCount > 0 ? `${unresolvedSupportCount} caso(s) ainda em andamento.` : "Nenhum caso pendente agora."}</span>
                </div>
                <div className="account-inline-note">
                  <strong>Wallet atual</strong>
                  <span>
                    Comum {Number(wallet.common || 0).toLocaleString("pt-BR")} • Pro {Number(wallet.pro || 0).toLocaleString("pt-BR")} • Ultra {Number(wallet.ultra || 0).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="account-inline-note">
                  <strong>Última atualização do saldo</strong>
                  <span>{formatDateTime(wallet.updated_at)}</span>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
