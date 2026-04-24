"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { CREATOR_COINS_PUBLIC_NAME, formatCreatorCoinsWalletSummary } from "../../lib/creatorCoins";

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

const ONBOARDING_SIGNAL_ITEMS = [
  {
    label: "Fluxo base",
    title: "Creator -> Projeto -> Editor",
    description: "Entrada e edição no mesmo eixo.",
  },
  {
    label: "Confidencialidade",
    title: "Conta isolada",
    description: "Fora de treino.",
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
      className="dashboard-surface-onboarding"
      data-reveal
      data-reveal-delay="90"
    >
      <div className="dashboard-surface-onboarding-head">
        <div className="dashboard-surface-field-note-copy">
          <strong>Continue o ciclo</strong>
          <span>Entrada, revisão e saldo seguem juntos.</span>
        </div>
        <button onClick={dismiss} className="btn-ea btn-ghost btn-sm">
          Entendi
        </button>
      </div>

      <div className="dashboard-surface-onboarding-signals">
        {ONBOARDING_SIGNAL_ITEMS.map((item) => (
          <div key={item.label} className="dashboard-surface-onboarding-signal">
            <span className="dashboard-stage-stat-label">{item.label}</span>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </div>
        ))}
          <div className="dashboard-surface-onboarding-signal dashboard-surface-onboarding-signal-wallet">
          <span className="dashboard-stage-stat-label">{CREATOR_COINS_PUBLIC_NAME}</span>
          <strong>{summary}</strong>
          <span>Estimativa antes; histórico depois.</span>
        </div>
      </div>

      <div className="dashboard-surface-onboarding-grid">
        <ol className="dashboard-surface-onboarding-steps">
          <li className="dashboard-surface-onboarding-step" data-reveal data-reveal-delay="120">
            <span className="dashboard-surface-onboarding-step-index">01</span>
            <div className="dashboard-surface-onboarding-step-copy">
              <strong>Escolha</strong>
              <span>Post, Scripts ou Clips.</span>
            </div>
          </li>
          <li className="dashboard-surface-onboarding-step" data-reveal data-reveal-delay="160">
            <span className="dashboard-surface-onboarding-step-index">02</span>
            <div className="dashboard-surface-onboarding-step-copy">
              <strong>Revise</strong>
              <span>Consumo previsto.</span>
            </div>
          </li>
          <li className="dashboard-surface-onboarding-step" data-reveal data-reveal-delay="200">
            <span className="dashboard-surface-onboarding-step-index">03</span>
            <div className="dashboard-surface-onboarding-step-copy">
              <strong>Finalize</strong>
              <span>Projeto e editor.</span>
            </div>
          </li>
        </ol>

        <div className="dashboard-surface-onboarding-paths">
          {OBJECTIVE_PATHS.map((item, index) => (
            <Link
              key={item.key}
              href={item.href}
              className="dashboard-surface-onboarding-path"
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
      </div>

      <div className="dashboard-surface-onboarding-summary">
        <div className="dashboard-surface-onboarding-summary-copy">
          <strong>{CREATOR_COINS_PUBLIC_NAME}</strong>
          <div className="helper-text-ea">{summary}. Estimativa antes; histórico depois.</div>
        </div>
        <div className="dashboard-surface-onboarding-summary-note">
          <span>{coinTypeLabel("common")}: rotina</span>
          <span>{coinTypeLabel("pro")}: maior qualidade</span>
          <span>{coinTypeLabel("ultra")}: processamento premium</span>
        </div>
        <div className="dashboard-surface-onboarding-actions">
          <Link href="/creators?tab=post" onClick={dismiss} className="btn-link-ea btn-primary">
            Iniciar fluxo
          </Link>
          <Link href="/credits" onClick={dismiss} className="btn-link-ea btn-secondary">
            Entender {CREATOR_COINS_PUBLIC_NAME}
          </Link>
        </div>
      </div>
    </section>
  );
}
