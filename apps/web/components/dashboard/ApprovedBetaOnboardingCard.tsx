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
    title: "Publicação rápida",
    description: "Creator Post abre o fluxo mais direto para gerar e seguir para o editor.",
    href: "/creators?tab=post",
    cta: "Abrir Creator Post",
  },
  {
    key: "scripts",
    title: "Roteiro e narrativa",
    description: "Creator Scripts organiza a narrativa antes da gravação.",
    href: "/creators?tab=scripts",
    cta: "Abrir Creator Scripts",
  },
  {
    key: "clips",
    title: "Saída visual premium",
    description: "Creator Clips concentra o fluxo visual com status claro.",
    href: "/creators?tab=clips",
    cta: "Abrir Creator Clips",
  },
  {
    key: "supporting",
    title: "Campanha complementar",
    description: "Creator Ads entra como apoio de campanha.",
    href: "/creators?tab=ads",
    cta: "Abrir Creator Ads",
  },
];

const ONBOARDING_SIGNAL_ITEMS = [
  {
    label: "Fluxo base",
    title: "Creator -> Projeto -> Editor",
    description: "A base nasce no creator, ganha continuidade em projetos e fecha no editor.",
  },
  {
    label: "Confidencialidade",
    title: "Conta isolada",
    description: "Os dados não entram em treino durante o uso da plataforma.",
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
      className="dashboard-onboarding-band dashboard-phase-a3-onboarding dashboard-phase-f4-onboarding"
      data-reveal
      data-reveal-delay="90"
    >
      <div className="dashboard-onboarding-band-head dashboard-phase-a3-onboarding-head dashboard-phase-f4-onboarding-head">
        <div className="section-stack">
          <p className="section-kicker">Onboarding</p>
          <h3 style={{ margin: 0 }}>Primeiros passos no beta</h3>
          <p className="meta-text-ea">
            Entre no workspace com um fluxo curto: escolha um creator hero, valide a estimativa e siga para projeto e editor.
          </p>
        </div>
        <button onClick={dismiss} className="btn-ea btn-ghost btn-sm">
          Entendi
        </button>
      </div>

      <div className="dashboard-phase-f4-onboarding-signals">
        {ONBOARDING_SIGNAL_ITEMS.map((item) => (
          <div key={item.label} className="dashboard-phase-f4-onboarding-signal">
            <span className="dashboard-stage-stat-label">{item.label}</span>
            <strong>{item.title}</strong>
            <span>{item.description}</span>
          </div>
        ))}
        <div className="dashboard-phase-f4-onboarding-signal dashboard-phase-f4-onboarding-signal-wallet">
          <span className="dashboard-stage-stat-label">{CREATOR_COINS_PUBLIC_NAME}</span>
          <strong>{summary}</strong>
          <span>Estimativa aparece antes do uso; o histórico confirma depois.</span>
        </div>
      </div>

      <div className="dashboard-onboarding-band-grid dashboard-phase-a3-onboarding-grid dashboard-phase-f4-onboarding-grid">
        <ol className="dashboard-onboarding-step-list dashboard-phase-a3-onboarding-steps dashboard-phase-f4-onboarding-steps">
          <li className="dashboard-onboarding-step-row dashboard-phase-a3-onboarding-step" data-reveal data-reveal-delay="120">
            <span className="dashboard-phase-f4-onboarding-step-index">01</span>
            <div className="dashboard-phase-f4-onboarding-step-copy">
              <strong>Escolha um Creator</strong>
              <span>Comece por Post, Scripts ou Clips.</span>
            </div>
          </li>
          <li className="dashboard-onboarding-step-row dashboard-phase-a3-onboarding-step" data-reveal data-reveal-delay="160">
            <span className="dashboard-phase-f4-onboarding-step-index">02</span>
            <div className="dashboard-phase-f4-onboarding-step-copy">
              <strong>Revise a estimativa</strong>
              <span>Cada geração mostra a estimativa antes do consumo.</span>
            </div>
          </li>
          <li className="dashboard-onboarding-step-row dashboard-phase-a3-onboarding-step" data-reveal data-reveal-delay="200">
            <span className="dashboard-phase-f4-onboarding-step-index">03</span>
            <div className="dashboard-phase-f4-onboarding-step-copy">
              <strong>Salve, edite e exporte</strong>
              <span>Projetos salva a base e o editor fecha a peça.</span>
            </div>
          </li>
          <li className="dashboard-onboarding-step-row dashboard-phase-a3-onboarding-step" data-reveal data-reveal-delay="240">
            <span className="dashboard-phase-f4-onboarding-step-index">04</span>
            <div className="dashboard-phase-f4-onboarding-step-copy">
              <strong>Trabalhe com confidencialidade</strong>
              <span>Os dados não entram em treino.</span>
            </div>
          </li>
        </ol>

        <div className="dashboard-onboarding-path-list dashboard-phase-a3-onboarding-paths dashboard-phase-f4-onboarding-paths">
          <div className="section-stack">
            <p className="section-kicker">Rotas iniciais recomendadas</p>
            <h4 style={{ margin: 0 }}>Núcleo principal com um apoio complementar</h4>
            <p className="helper-text-ea">
              Comece pelo trio hero e use Ads como apoio.
            </p>
          </div>

          {OBJECTIVE_PATHS.map((item, index) => (
            <Link
              key={item.key}
              href={item.href}
              className={`dashboard-onboarding-path-row dashboard-phase-a3-onboarding-path ${index === OBJECTIVE_PATHS.length - 1 ? "dashboard-onboarding-path-row-support" : ""}`}
              onClick={dismiss}
              data-reveal
              data-reveal-delay={String(80 + index * 55)}
            >
              <div className="dashboard-onboarding-path-main">
                <span className="dashboard-stage-stat-label">{index === OBJECTIVE_PATHS.length - 1 ? "Apoio complementar" : "Rota principal"}</span>
                <strong>{item.title}</strong>
                <span className="helper-text-ea">{item.description}</span>
              </div>
              <span className="dashboard-stream-link-cta">{item.cta}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="dashboard-onboarding-summary dashboard-phase-a3-onboarding-summary dashboard-phase-f4-onboarding-summary">
        <div className="dashboard-onboarding-summary-copy dashboard-phase-a3-onboarding-summary-copy dashboard-phase-f4-onboarding-summary-copy">
          <strong>{CREATOR_COINS_PUBLIC_NAME} no fluxo atual</strong>
          <div className="helper-text-ea">Saldo atual: {summary}. Estimativa antes; débito no histórico.</div>
        </div>
        <div className="hero-meta-row dashboard-onboarding-summary-badges dashboard-phase-a3-onboarding-summary-badges dashboard-phase-f4-onboarding-summary-badges">
          <span className="premium-badge premium-badge-warning">{coinTypeLabel("common")}: tarefas de rotina</span>
          <span className="premium-badge premium-badge-phase">{coinTypeLabel("pro")}: maior qualidade</span>
          <span className="premium-badge premium-badge-soon">{coinTypeLabel("ultra")}: processamento premium</span>
        </div>
        <div className="dashboard-onboarding-actions dashboard-phase-a3-onboarding-actions dashboard-phase-f4-onboarding-actions">
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
