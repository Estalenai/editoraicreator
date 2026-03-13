"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { coinTypeLabel } from "../../lib/coinTypeLabel";

type Props = {
  email: string;
  wallet: any | null;
};

const ONBOARDING_VERSION = "v2";

function onboardingStorageKey(email: string): string {
  return `ea:onboarding:${ONBOARDING_VERSION}:${email.trim().toLowerCase()}`;
}

function walletSummary(wallet: any | null): string {
  if (!wallet) return "0 Comum • 0 Pro • 0 Ultra";
  return `${wallet.common ?? 0} Comum • ${wallet.pro ?? 0} Pro • ${wallet.ultra ?? 0} Ultra`;
}

const OBJECTIVE_PATHS = [
  {
    key: "content",
    title: "Quero criar conteúdo",
    description: "Comece com Creator Post e evolua para Scripts.",
    href: "/creators?tab=post",
    cta: "Começar em Creator Post",
  },
  {
    key: "ads",
    title: "Quero gerar anúncios",
    description: "Use Creator Ads para headline, corpo e CTA de conversão.",
    href: "/creators?tab=ads",
    cta: "Abrir Creator Ads",
  },
  {
    key: "media",
    title: "Quero começar por vídeo/música",
    description: "Creator Clips e Creator Music aceleram produção audiovisual.",
    href: "/creators?tab=clips",
    cta: "Abrir Creator Clips",
  },
  {
    key: "product",
    title: "Quero estruturar um produto",
    description: "Creator No Code monta a base inicial para continuar no editor.",
    href: "/creators?tab=no-code",
    cta: "Abrir Creator No Code",
  },
];

export function ApprovedBetaOnboardingCard({ email, wallet }: Props) {
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

  const summary = useMemo(() => walletSummary(wallet), [wallet]);

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
    <section className="premium-card onboarding-card-ea">
      <div className="onboarding-card-head">
        <div className="section-stack">
          <p className="section-kicker">Onboarding</p>
          <h3 style={{ margin: 0 }}>Primeiros passos no beta</h3>
          <p className="meta-text-ea">
            Entre no workspace com um fluxo simples: escolha um creator, revise a estimativa e continue em projetos.
          </p>
        </div>
        <button onClick={dismiss} className="btn-ea btn-ghost btn-sm">
          Entendi
        </button>
      </div>

      <div className="trust-grid onboarding-trust-grid">
        <div className="premium-card-soft trust-note">
          <strong>1) Escolha um Creator</strong>
          <span>Comece com um módulo rápido e gere sua primeira saída com contexto claro.</span>
        </div>
        <div className="premium-card-soft trust-note">
          <strong>2) Revise a estimativa</strong>
          <span>Cada geração mostra estimativa prévia de consumo antes de debitar saldo.</span>
        </div>
        <div className="premium-card-soft trust-note">
          <strong>3) Salve e continue</strong>
          <span>Projetos é o hub central: salve, retome no editor e mantenha continuidade.</span>
        </div>
      </div>

      <div className="onboarding-objective-shell">
        <div className="section-stack">
          <p className="section-kicker">Escolha seu objetivo inicial</p>
          <h4 style={{ margin: 0 }}>Comece por uma tarefa clara</h4>
          <p className="helper-text-ea">
            Cada entrada abaixo abre o creator certo para o primeiro fluxo sem excesso de decisao.
          </p>
        </div>
        <div className="onboarding-objective-grid">
          {OBJECTIVE_PATHS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="premium-card-soft onboarding-objective-card"
              onClick={dismiss}
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

      <div className="premium-card-soft onboarding-credit-panel">
        <div className="section-stack">
          <strong>Creditos no seu fluxo</strong>
          <div className="helper-text-ea">
          Saldo atual: {summary}. Estimativa aparece antes da ação e o débito final no histórico.
          </div>
        </div>
        <div className="hero-meta-row">
          <span className="premium-badge premium-badge-warning">{coinTypeLabel("common")}: tarefas de rotina</span>
          <span className="premium-badge premium-badge-phase">{coinTypeLabel("pro")}: maior qualidade</span>
          <span className="premium-badge premium-badge-soon">{coinTypeLabel("ultra")}: processamento premium</span>
        </div>
      </div>

      <div className="onboarding-action-row">
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
