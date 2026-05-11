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
    description: "Publicação",
    href: "/creators?tab=post",
  },
  {
    key: "scripts",
    title: "Scripts",
    description: "Narrativa",
    href: "/creators?tab=scripts",
  },
  {
    key: "clips",
    title: "Clips",
    description: "Saída",
    href: "/creators?tab=clips",
  },
  {
    key: "supporting",
    title: "Ads",
    description: "Apoio",
    href: "/creators?tab=ads",
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
      className="dashboard-context-signal dashboard-context-onboarding dashboard-field-signal"
      aria-label="Próxima entrada do Creator Operating Studio"
      data-reveal
      data-reveal-delay="90"
    >
      <div className="dashboard-context-onboarding-head">
        <div className="dashboard-context-onboarding-copy">
          <span className="dashboard-stream-link-kicker">Entrada</span>
          <strong>Entrada rápida</strong>
          <span>Formato, capacidade e projeto no mesmo eixo.</span>
        </div>
      </div>

      <div className="dashboard-context-onboarding-paths">
        {OBJECTIVE_PATHS.map((item) => (
          <Link key={item.key} href={item.href} className="dashboard-context-onboarding-path" onClick={dismiss}>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </Link>
        ))}
      </div>

      <div className="dashboard-context-onboarding-footer">
        <span>{coinTypeLabel("common")} / {coinTypeLabel("pro")} / {coinTypeLabel("ultra")}</span>
        <strong>{summary}</strong>
        <Link href="/creators?tab=post" onClick={dismiss} className="dashboard-stream-link-cta">
          Iniciar
        </Link>
        <button onClick={dismiss} className="dashboard-context-dismiss" aria-label="Ocultar entrada rápida">
          OK
        </button>
      </div>
    </section>
  );
}
