"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { coinTypeLabel } from "../../lib/coinTypeLabel";

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
  return `${wallet.common ?? 0} Comum • ${wallet.pro ?? 0} Pro • ${wallet.ultra ?? 0} Ultra`;
}

const OBJECTIVE_PATHS = [
  {
    key: "post",
    title: "Publicação rápida",
    description: "Creator Post abre o fluxo mais direto para gerar, salvar e seguir para o editor.",
    href: "/creators?tab=post",
    cta: "Abrir Creator Post",
  },
  {
    key: "scripts",
    title: "Roteiro e narrativa",
    description: "Creator Scripts organiza estrutura, revisão editorial e continuidade antes da gravação.",
    href: "/creators?tab=scripts",
    cta: "Abrir Creator Scripts",
  },
  {
    key: "clips",
    title: "Saída visual premium",
    description: "Creator Clips concentra o fluxo visual com job assíncrono, status legível e handoff para o editor.",
    href: "/creators?tab=clips",
    cta: "Abrir Creator Clips",
  },
  {
    key: "supporting",
    title: "Campanha complementar",
    description: "Creator Ads fecha o núcleo com peças de conversão para lançamento, mídia e distribuição.",
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
    <section className="onboarding-card-ea dashboard-onboarding-card" data-reveal data-reveal-delay="90">
      <div className="onboarding-card-head">
        <div className="section-stack">
          <p className="section-kicker">Onboarding</p>
          <h3 style={{ margin: 0 }}>Primeiros passos no beta</h3>
          <p className="meta-text-ea">
            Entre no workspace com um fluxo objetivo: selecione um creator hero, valide a estimativa e leve a saída para projeto e editor.
          </p>
        </div>
        <button onClick={dismiss} className="btn-ea btn-ghost btn-sm">
          Entendi
        </button>
      </div>

      <div className="trust-grid onboarding-trust-grid">
        <div className="trust-note dashboard-onboarding-step" data-reveal data-reveal-delay="120">
          <strong>1) Escolha um Creator</strong>
          <span>O núcleo hero já organiza o caminho de publicação, roteiro e clipe sem dispersar a decisão inicial.</span>
        </div>
        <div className="trust-note dashboard-onboarding-step" data-reveal data-reveal-delay="160">
          <strong>2) Revise a estimativa</strong>
          <span>Cada geração mostra a estimativa operacional antes de consumir saldo.</span>
        </div>
        <div className="trust-note dashboard-onboarding-step" data-reveal data-reveal-delay="200">
          <strong>3) Salve, edite e exporte</strong>
          <span>Projetos funciona como hub central: salva, retoma no editor e preserva continuidade até a saída.</span>
        </div>
        <div className="trust-note trust-note-privacy dashboard-onboarding-step" data-reveal data-reveal-delay="240">
          <strong>4) Trabalhe com confidencialidade</strong>
          <span>Os dados não entram em treino de modelos; o processamento permanece isolado e focado no workspace.</span>
        </div>
      </div>

      <div className="onboarding-objective-shell">
        <div className="section-stack">
          <p className="section-kicker">Rotas iniciais recomendadas</p>
          <h4 style={{ margin: 0 }}>Núcleo principal com um apoio complementar</h4>
          <p className="helper-text-ea">
            As entradas abaixo priorizam o trio hero e fecham a grade com um fluxo complementar de campanha.
          </p>
        </div>
        <div className="onboarding-objective-grid">
          {OBJECTIVE_PATHS.map((item, index) => (
            <Link
              key={item.key}
              href={item.href}
              className={`onboarding-objective-card dashboard-onboarding-path ${index === OBJECTIVE_PATHS.length - 1 ? "onboarding-objective-card-support" : ""}`}
              onClick={dismiss}
              data-reveal
              data-reveal-delay={String(80 + index * 55)}
            >
              <strong>{item.title}</strong>
              <div className="helper-text-ea">{item.description}</div>
              <div>
                <span className="card-link-hint">{item.cta}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="onboarding-credit-panel dashboard-onboarding-credit">
        <div className="section-stack">
          <strong>Créditos no fluxo atual</strong>
          <div className="helper-text-ea">
            Saldo atual: {summary}. A estimativa aparece antes da ação e o débito final permanece rastreável no histórico.
          </div>
        </div>
        <div className="hero-meta-row">
          <span className="premium-badge premium-badge-warning">{coinTypeLabel("common")}: tarefas de rotina</span>
          <span className="premium-badge premium-badge-phase">{coinTypeLabel("pro")}: maior qualidade</span>
          <span className="premium-badge premium-badge-soon">{coinTypeLabel("ultra")}: processamento premium</span>
        </div>
      </div>

      <div className="onboarding-action-row dashboard-onboarding-actions">
        <Link href="/creators?tab=post" onClick={dismiss} className="btn-link-ea btn-primary">
          Iniciar fluxo gerar → salvar
        </Link>
        <Link href="/credits" onClick={dismiss} className="btn-link-ea btn-secondary">
          Entender créditos
        </Link>
      </div>
    </section>
  );
}
