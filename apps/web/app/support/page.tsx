"use client";

import Link from "next/link";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { SupportAssistantCard } from "../../components/dashboard/SupportAssistantCard";
import { toUserFacingError } from "../../lib/uiFeedback";

const SUPPORT_PATHS = [
  {
    title: "Planos e cobrança",
    description: "Entenda checkout, ativação assistida, atualização de assinatura e retorno da Stripe.",
    href: "/plans",
    cta: "Revisar planos",
  },
  {
    title: "Créditos e histórico",
    description: "Consulte saldo, compra avulsa, conversão entre tipos e movimentações confirmadas.",
    href: "/credits",
    cta: "Abrir créditos",
  },
  {
    title: "Projetos e publicação",
    description: "Retome o contexto salvo, organize handoff e valide a continuidade para GitHub e Vercel.",
    href: "/projects",
    cta: "Ver projetos",
  },
];

const SUPPORT_FAQ = [
  {
    question: "Quando devo abrir suporte em vez de tentar novamente?",
    answer:
      "Abra suporte quando o erro se repetir, quando o saldo ou o plano não refletirem a ação esperada ou quando você precisar de ativação assistida para cobrança, publicação ou integrações.",
  },
  {
    question: "O que incluir para a equipe responder mais rápido?",
    answer:
      "Envie assunto claro, contexto do que estava fazendo, mensagem de erro, referência do job ou checkout e a tela afetada. Quanto mais objetivo o relato, mais rápido a análise.",
  },
  {
    question: "Como funciona o suporte para planos, créditos e pagamentos?",
    answer:
      "Pagamentos self-serve passam pela Stripe. Quando houver divergência entre checkout, saldo, histórico ou plano, o suporte valida o retorno e orienta o próximo passo com base no estado real da conta.",
  },
  {
    question: "GitHub e Vercel já têm suporte completo?",
    answer:
      "No beta, GitHub e Vercel aparecem como fundações úteis de continuidade e publicação. Se algo não estiver claro no handoff, o suporte ajuda a interpretar o fluxo atual e o que ainda depende da próxima fase.",
  },
  {
    question: "Meus dados enviados ao suporte treinam modelos?",
    answer:
      "Não. Dados enviados em tickets, projetos e contexto operacional não são usados para treinar modelos. O processamento segue isolado por conta com foco em confidencialidade.",
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
      <section className="premium-hero support-hero surface-flow-hero">
        <div className="hero-split support-hero-split">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Canal operacional</p>
              <h1 style={{ margin: "4px 0 0", letterSpacing: -0.35 }}>Suporte</h1>
              <p className="section-header-copy hero-copy-compact">
                Uma área objetiva para sustentar o beta pago/controlado: tirar dúvidas, registrar problemas e entender o próximo passo em planos, créditos, publicação e integrações sem ruído.
              </p>
            </div>

            <div className="signal-strip support-signal-strip">
              <div className="signal-chip signal-chip-sober">
                <strong>FAQ útil</strong>
                <span>Respostas curtas para as dúvidas mais comuns antes de abrir uma solicitação.</span>
              </div>
              <div className="signal-chip signal-chip-sober">
                <strong>Contexto claro</strong>
                <span>Planos, créditos, checkout e publicação aparecem como trilhas de ajuda separadas.</span>
              </div>
              <div className="signal-chip signal-chip-sober">
                <strong>Suporte real</strong>
                <span>Solicitações ficam registradas com status, nota interna e acompanhamento dentro do produto.</span>
              </div>
            </div>
          </div>

          <div className="hero-side-panel support-hero-panel layout-contract-rail">
            <div className="hero-side-list hero-side-list-compact">
              <div className="hero-side-note">
                <strong>Conta conectada</strong>
                <span>{email || "Sessão em validação no momento."}</span>
              </div>
              <div className="hero-side-note">
                <strong>Próximo passo sugerido</strong>
                <span>Consulte o FAQ e a trilha certa antes de abrir uma solicitação. Isso reduz ida e volta e protege a experiência de um beta pago/controlado mais sério.</span>
              </div>
              <div className="hero-side-note hero-side-note-trust">
                <strong>Privacidade aplicada</strong>
                <span>Dados enviados em tickets e projetos não são usados para treinar modelos e permanecem em processamento isolado.</span>
              </div>
            </div>

            {email ? (
              <div className="surface-toolbar support-hero-toolbar">
                <span className="toolbar-label">Conta conectada</span>
                <span style={{ fontWeight: 600 }}>{email}</span>
                <span className="premium-badge premium-badge-phase">Resposta por fila interna</span>
                <Link href="/how-it-works" className="btn-link-ea btn-ghost btn-sm">
                  Como funciona
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="support-guide-section surface-flow-region surface-flow-region-start layout-contract-region">
        <div className="section-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Caminhos rápidos de ajuda</h2>
            <p className="helper-text-ea">Escolha a trilha mais próxima do seu caso antes de abrir uma solicitação.</p>
          </div>
        </div>
        <div className="support-guide-grid">
          {SUPPORT_PATHS.map((item) => (
            <Link key={item.title} href={item.href} className="support-guide-card layout-contract-item">
              <div className="support-guide-card-stack">
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </div>
              <span className="dashboard-quick-link-cta">{item.cta}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="privacy-trust-note support-trust-note surface-flow-region surface-flow-region-middle layout-contract-note">
        <strong>Privacidade e confidencialidade</strong>
        <span>Dados enviados em tickets e projetos não são usados para treinar modelos. O suporte opera com processamento isolado e foco em segurança operacional.</span>
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

      <section className="support-faq-section surface-flow-region surface-flow-region-middle layout-contract-region">
        <div className="section-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Perguntas frequentes</h2>
            <p className="helper-text-ea">Respostas rápidas para dúvidas de operação, cobrança e continuidade do beta.</p>
          </div>
        </div>
        <div className="support-faq-grid">
          {SUPPORT_FAQ.map((item) => (
            <article key={item.question} className="support-faq-item layout-contract-item">
              <strong>{item.question}</strong>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <SupportAssistantCard />
    </div>
  );
}
