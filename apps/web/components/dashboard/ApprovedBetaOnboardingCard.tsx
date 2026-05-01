"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { formatCreatorCoinsWalletSummary } from "../../lib/creatorCoins";

type Props = {
  email: string;
  wallet: any | null;
  loading?: boolean;
};

const ONBOARDING_VERSION = "v2";

function onboardingStorageKey(email: string): string {
  return `ea:onboarding:${ONBOARDING_VERSION}:${email.trim().toLowerCase()}`;
}

function walletSummary(wallet: any | null, loading = false): string {
  if (loading) return "Saldo em atualização";
  if (!wallet) return "Sem saldo sincronizado";
  return formatCreatorCoinsWalletSummary(wallet);
}

const OBJECTIVE_PATHS = [
  {
    key: "post",
    title: "Post",
    description: "Publicação direta.",
    href: "/creators?tab=post",
    cta: "Abrir Creator Post",
  },
  {
    key: "scripts",
    title: "Scripts",
    description: "Narrativa revisável.",
    href: "/creators?tab=scripts",
    cta: "Abrir Creator Scripts",
  },
  {
    key: "clips",
    title: "Clips",
    description: "Saída visual.",
    href: "/creators?tab=clips",
    cta: "Abrir Creator Clips",
  },
  {
    key: "supporting",
    title: "Ads",
    description: "Apoio complementar.",
    href: "/creators?tab=ads",
    cta: "Abrir Creator Ads",
  },
];

export function ApprovedBetaOnboardingCard({ email, wallet, loading = false }: Props) {
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!email) {
      setVisible(false);
      setReady(true);
      return;
    }

    try {
      const seen = window.localStorage.getItem(onboardingStorageKey(email)) === "seen";
      setVisible(!seen);
    } catch {
      setVisible(true);
    } finally {
      setReady(true);
    }
  }, [email]);

  const summary = useMemo(() => walletSummary(wallet, loading), [wallet, loading]);

  function dismiss() {
    if (!email) {
      setVisible(false);
      return;
    }
    try {
      window.localStorage.setItem(onboardingStorageKey(email), "seen");
    } catch {
      // noop: fallback para sessão atual
    }
    setVisible(false);
  }

  if (!ready || !visible) return null;

  return (
    <section
      className="dashboard-surface-onboarding dashboard-continuity-guide dashboard-studio-onboarding dashboard-field-signal"
      aria-label="Próxima entrada do Creator Operating Studio"
      data-reveal
      data-reveal-delay="90"
    >
      <div className="dashboard-surface-onboarding-head">
        <div className="dashboard-surface-field-note-copy">
          <strong>Entrada rápida</strong>
          <span>Escolha o formato e continue pelo mesmo projeto.</span>
        </div>
        <button onClick={dismiss} className="btn-ea btn-ghost btn-sm">
          Entendi
        </button>
      </div>

      <div className="dashboard-studio-onboarding-radar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="dashboard-continuity-guide-grid dashboard-studio-onboarding-compact">
        <div className="dashboard-continuity-paths">
          {OBJECTIVE_PATHS.map((item, index) => (
            <Link
              key={item.key}
              href={item.href}
              className="dashboard-continuity-path"
              onClick={dismiss}
              data-reveal
              data-reveal-delay={String(80 + index * 55)}
            >
              <div className="dashboard-surface-onboarding-path-main">
                <span className="dashboard-stage-stat-label">{index === OBJECTIVE_PATHS.length - 1 ? "Apoio" : "Principal"}</span>
                <strong>{item.title}</strong>
                <span className="helper-text-ea">{item.description}</span>
              </div>
              <span className="dashboard-stream-link-cta">{item.cta}</span>
            </Link>
          ))}
        </div>

        <div className="dashboard-continuity-summary dashboard-studio-onboarding-summary">
          <div className="dashboard-surface-onboarding-summary-copy">
            <span className="dashboard-stage-stat-label">Capacidade</span>
            <strong>{summary}</strong>
            <div className="helper-text-ea">Saldo disponível antes da entrega.</div>
          </div>
          <div className="dashboard-surface-onboarding-summary-note">
            <span>{coinTypeLabel("common")}: rotina</span>
            <span>{coinTypeLabel("pro")}: maior qualidade</span>
            <span>{coinTypeLabel("ultra")}: premium</span>
          </div>
          <div className="dashboard-surface-onboarding-actions">
            <Link href="/creators?tab=post" onClick={dismiss} className="btn-link-ea btn-primary">
              Iniciar fluxo
            </Link>
            <Link href="/credits" onClick={dismiss} className="btn-link-ea btn-secondary">
              Ver capacidade
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
