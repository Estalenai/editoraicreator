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
    title: "Quero publicar rápido",
    description: "Comece com Creator Post para gerar a peça-base com CTA e levar isso para o editor.",
    href: "/creators?tab=post",
    cta: "Começar em Creator Post",
  },
  {
    key: "scripts",
    title: "Quero estruturar um vídeo",
    description: "Use Creator Scripts para organizar a narrativa antes de gravar, editar ou transformar em clipe.",
    href: "/creators?tab=scripts",
    cta: "Abrir Creator Scripts",
  },
  {
    key: "clips",
    title: "Quero sair com um clipe",
    description: "Creator Clips é o creator hero visual para transformar ideia em vídeo curto com continuidade.",
    href: "/creators?tab=clips",
    cta: "Abrir Creator Clips",
  },
  {
    key: "supporting",
    title: "Quero explorar apoio e labs",
    description: "Ads, Music, Live Cuts e No Code continuam disponíveis, mas fora do núcleo principal agora.",
    href: "/creators",
    cta: "Ver catálogo completo",
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
          <strong>3) Salve, edite e exporte</strong>
          <span>Projetos é o hub central: salve, retome no editor e avance para exportação.</span>
        </div>
        <div className="premium-card-soft trust-note trust-note-privacy">
          <strong>4) Trabalhe com confidencialidade</strong>
          <span>Seus dados não entram em treino de modelos; o processamento fica isolado e focado no seu workspace.</span>
        </div>
      </div>

      <div className="onboarding-objective-shell">
        <div className="section-stack">
          <p className="section-kicker">Escolha seu objetivo inicial</p>
          <h4 style={{ margin: 0 }}>Comece por um creator hero</h4>
          <p className="helper-text-ea">
            O melhor ponto de entrada hoje está em Post, Scripts e Clips. O restante do catálogo continua disponível, mas sai do centro da promessa.
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
          <strong>Créditos no seu fluxo</strong>
          <div className="helper-text-ea">
            Saldo atual: {summary}. A estimativa aparece antes da ação e o débito final fica no histórico.
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
          Iniciar fluxo gerar → editar → exportar
        </Link>
        <Link href="/credits" onClick={dismiss} className="btn-link-ea btn-secondary">
          Entender créditos
        </Link>
      </div>
    </section>
  );
}
