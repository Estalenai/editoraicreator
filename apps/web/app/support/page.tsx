"use client";

import Link from "next/link";
import { useEffect, type KeyboardEvent } from "react";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { useSectionFocus } from "../../hooks/useSectionFocus";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { SupportAssistantCard } from "../../components/dashboard/SupportAssistantCard";
import { SupportOperationsPanel } from "../../components/support/SupportOperationsPanel";
import { CREATOR_COINS_PUBLIC_NAME } from "../../lib/creatorCoins";
import { toUserFacingError } from "../../lib/uiFeedback";

const SUPPORT_PATHS = [
  {
    title: "Cobrança e saldo",
    description: `Consulte plano, checkout, saldo, compra e movimentações de ${CREATOR_COINS_PUBLIC_NAME} no mesmo histórico.`,
    href: "/credits",
    cta: `Abrir ${CREATOR_COINS_PUBLIC_NAME}`,
  },
  {
    title: "Publicação e continuidade",
    description: "Veja status de projeto, sincronização, GitHub, Vercel e saída registrada na mesma trilha.",
    href: "/projects",
    cta: "Ver projetos",
  },
  {
    title: "Fluxo principal",
    description: "Relembre como creators, editor, projetos e saída se conectam antes de abrir suporte.",
    href: "/how-it-works",
    cta: "Revisar fluxo",
  },
];

type SupportFocusSection = "guide" | "faq" | "assistant";

const SUPPORT_SECTION_HASH: Record<SupportFocusSection, string> = {
  guide: "#support-guide",
  faq: "#support-faq",
  assistant: "#support-assistant",
};

const SUPPORT_FAQ = [
  {
    question: "Quando devo abrir suporte em vez de tentar novamente?",
    answer:
      "Abra suporte quando o mesmo erro voltar, quando saldo ou publish não refletirem o histórico ou quando o quadro operacional indicar atenção.",
  },
  {
    question: "O que incluir para a equipe responder mais rápido?",
    answer:
      "Envie assunto claro, mensagem de erro, referência do job ou checkout e a tela afetada.",
  },
  {
    question: `Como funciona o suporte para planos, ${CREATOR_COINS_PUBLIC_NAME} e pagamentos?`,
    answer:
      `Pagamentos passam pela Stripe. Se houver divergência entre checkout, saldo, histórico ou plano, o suporte valida o retorno e orienta o próximo passo.`,
  },
  {
    question: "GitHub e Vercel já têm suporte completo?",
    answer:
      "GitHub e Vercel já têm trilha backend-owned, mas o caminho feliz ainda depende de credencial válida e resposta do provider. Se o status não avançar, abra o projeto e leve o contexto do erro para o suporte.",
  },
  {
    question: "Meus dados enviados ao suporte treinam modelos?",
    answer:
      "Não. Dados enviados em tickets, projetos e contexto operacional não entram em treino.",
  },
];

export default function SupportPage() {
  const {
    loading,
    error,
    email,
    betaAccess,
    betaBlocked,
    onLogout,
  } = useDashboardBootstrap({ loadDashboard: false });
  const { activeSection, registerSection, focusSection } =
    useSectionFocus<SupportFocusSection>("assistant");

  function updateSupportHash(section: SupportFocusSection) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.hash = SUPPORT_SECTION_HASH[section];
    window.history.replaceState(null, "", url.toString());
  }

  function activateSection(
    section: SupportFocusSection,
    options?: { scroll?: "auto" | "always" | "never" }
  ) {
    focusSection(section, { scroll: options?.scroll ?? "auto" });
    updateSupportHash(section);
  }

  function onSectionTrigger(
    event: KeyboardEvent,
    section: SupportFocusSection,
    scroll: "auto" | "always" | "never" = "auto"
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateSection(section, { scroll });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFocusFromHash = () => {
      const hash = String(window.location.hash || "").toLowerCase();
      if (hash === "#support-guide") {
        focusSection("guide", { scroll: "never" });
        return;
      }
      if (hash === "#support-faq") {
        focusSection("faq", { scroll: "never" });
        return;
      }
      if (hash === "#support-assistant") {
        focusSection("assistant", { scroll: "never" });
      }
    };

    syncFocusFromHash();
    window.addEventListener("hashchange", syncFocusFromHash);
    return () => window.removeEventListener("hashchange", syncFocusFromHash);
  }, [focusSection]);

  if (betaBlocked) {
    return (
      <BetaAccessBlockedView
        email={email}
        status={betaAccess?.status}
        onLogout={onLogout}
      />
    );
  }

  return (
    <div className="page-shell support-page">
      <section className="support-hero support-hero-open">
        <div className="support-hero-intro">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Canal operacional</p>
              <h1 style={{ margin: "4px 0 0", letterSpacing: -0.35 }}>Suporte</h1>
              <p className="section-header-copy hero-copy-compact">
                {`Dúvidas, problemas e próximo passo com menos ida e volta em planos, ${CREATOR_COINS_PUBLIC_NAME}, publicação e integrações.`}
              </p>
            </div>

            <div className="support-hero-signals">
              <div className="support-hero-signal">
                <strong>Status curto</strong>
                <span>Confirme a prontidão da plataforma antes de interpretar falha local como erro geral.</span>
              </div>
              <div className="support-hero-signal">
                <strong>Base certa</strong>
                <span>{`Cobrança, ${CREATOR_COINS_PUBLIC_NAME}, publish e fluxo principal têm rota de apoio objetiva.`}</span>
              </div>
            </div>
          </div>
          <div className="support-hero-focus">
            <span className="support-hero-focus-label">
              {email ? "Triagem interna pronta" : "Triagem guiada"}
            </span>
            <strong>Consulte o FAQ e leve o caso para a fila quando precisar.</strong>
            <p className="support-hero-focus-copy">
              O Support Assistant mantém categoria, contexto e histórico no mesmo fluxo.
            </p>
            <div className="support-hero-focus-meta">
              <span className="premium-badge premium-badge-phase">
                {email ? "Fila interna acompanhada" : "Fluxo de ajuda orientado"}
              </span>
              <span className="support-hero-focus-meta-copy">
                {email || "Conta em validação no momento."}
              </span>
            </div>
            <div className="hero-actions-row support-hero-actions">
              <button
                type="button"
                onClick={() => {
                  activateSection("assistant", { scroll: "always" });
                }}
                className="btn-link-ea btn-primary"
              >
                Abrir assistant
              </button>
              <Link href="/how-it-works" className="btn-link-ea btn-ghost">
                Como funciona
              </Link>
            </div>
          </div>
        </div>
        <div className="support-context-strip" aria-label="Contexto operacional do suporte">
          <div className="support-context-item">
            <strong>Conta conectada</strong>
            <span>{email || "Sessão em validação no momento."}</span>
          </div>
          <div className="support-context-item">
            <strong>Próximo passo sugerido</strong>
            <span>Consulte o FAQ e a trilha certa antes de abrir uma solicitação.</span>
          </div>
          <div className="support-context-item">
            <strong>Privacidade aplicada</strong>
            <span>Dados de tickets e projetos não entram em treino.</span>
          </div>
        </div>
      </section>

      <SupportOperationsPanel />

      <section
        ref={registerSection("guide")}
        className="support-guide-section focus-shell-section"
        data-focus-active={activeSection === "guide"}
      >
        <div
          className="section-head focus-shell-head"
          data-focus-clickable={activeSection !== "guide"}
          role={activeSection !== "guide" ? "button" : undefined}
          tabIndex={activeSection !== "guide" ? 0 : -1}
          onClick={activeSection !== "guide" ? () => activateSection("guide") : undefined}
          onKeyDown={activeSection !== "guide" ? (event) => onSectionTrigger(event, "guide") : undefined}
        >
          <div className="section-header-ea">
            <h2 className="heading-reset">Bases de apoio</h2>
            <p className="helper-text-ea">Documentação curta e rotas certas para cobrança, publish e fluxo principal.</p>
          </div>
          <button
            type="button"
            onClick={() => activateSection("guide")}
            className={`btn-ea ${activeSection === "guide" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "guide"}
          >
            {activeSection === "guide" ? "Em foco" : "Trazer para foco"}
          </button>
        </div>
        <div className="focus-shell-preview">
          Consulte a base certa sem depender de texto solto, FAQ longa ou interpretação de memória.
        </div>
        <div className="focus-shell-body">
        <div className="support-guide-grid">
          {SUPPORT_PATHS.map((item) => (
            <Link key={item.title} href={item.href} className="support-guide-card">
              <div className="support-guide-card-stack">
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </div>
              <span className="dashboard-quick-link-cta">{item.cta}</span>
            </Link>
          ))}
        </div>
        </div>
      </section>

      <section className="privacy-trust-note support-trust-note">
        <strong>Privacidade e confidencialidade</strong>
        <span>Dados enviados em tickets e projetos não entram em treino.</span>
      </section>

      {loading ? (
        <div className="support-loading-card layout-contract-card">
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "32%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "70%" }} />
          <div className="premium-skeleton premium-skeleton-card" />
        </div>
      ) : null}

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar a área de suporte</p>
          <div className="state-ea-text">{toUserFacingError(error, "Atualize a página e tente novamente.")}</div>
        </div>
      ) : null}

      <section
        ref={registerSection("faq")}
        className="support-faq-section focus-shell-section"
        data-focus-active={activeSection === "faq"}
      >
        <div
          className="section-head focus-shell-head"
          data-focus-clickable={activeSection !== "faq"}
          role={activeSection !== "faq" ? "button" : undefined}
          tabIndex={activeSection !== "faq" ? 0 : -1}
          onClick={activeSection !== "faq" ? () => activateSection("faq") : undefined}
          onKeyDown={activeSection !== "faq" ? (event) => onSectionTrigger(event, "faq") : undefined}
        >
          <div className="section-header-ea">
            <h2 className="heading-reset">Perguntas frequentes</h2>
            <p className="helper-text-ea">Respostas rápidas para operação, cobrança e continuidade.</p>
          </div>
          <button
            type="button"
            onClick={() => activateSection("faq")}
            className={`btn-ea ${activeSection === "faq" ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
            aria-pressed={activeSection === "faq"}
          >
            {activeSection === "faq" ? "Em foco" : "Trazer para foco"}
          </button>
        </div>
        <div className="focus-shell-preview">
          Consulte respostas rápidas sem manter a área de triagem e os atalhos abertos ao mesmo tempo.
        </div>
        <div className="focus-shell-body">
        <div className="support-faq-grid">
          {SUPPORT_FAQ.map((item) => (
            <article key={item.question} className="support-faq-item">
              <strong>{item.question}</strong>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
        </div>
      </section>

      <SupportAssistantCard
        focused={activeSection === "assistant"}
        onFocus={() => activateSection("assistant")}
        sectionRef={registerSection("assistant")}
      />
    </div>
  );
}
