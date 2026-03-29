"use client";

import Link from "next/link";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { SupportAssistantCard } from "../../components/dashboard/SupportAssistantCard";
import { CREATOR_COINS_PUBLIC_NAME } from "../../lib/creatorCoins";
import { toUserFacingError } from "../../lib/uiFeedback";

const SUPPORT_PATHS = [
  {
    title: "Planos e cobrança",
    description: "Entenda checkout, ativação assistida, atualização de assinatura e retorno da Stripe.",
    href: "/plans",
    cta: "Revisar planos",
  },
  {
    title: `${CREATOR_COINS_PUBLIC_NAME} e histórico`,
    description: `Consulte saldo, compra avulsa, conversão entre tipos e movimentações confirmadas de ${CREATOR_COINS_PUBLIC_NAME}.`,
    href: "/credits",
    cta: `Abrir ${CREATOR_COINS_PUBLIC_NAME}`,
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
    question: `Como funciona o suporte para planos, ${CREATOR_COINS_PUBLIC_NAME} e pagamentos?`,
    answer:
      `Pagamentos self-serve passam pela Stripe. Quando houver divergência entre checkout, saldo de ${CREATOR_COINS_PUBLIC_NAME}, histórico ou plano, o suporte valida o retorno e orienta o próximo passo com base no estado real da conta.`,
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
      <section className="support-hero support-hero-open">
        <div className="support-hero-intro">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Canal operacional</p>
              <h1 style={{ margin: "4px 0 0", letterSpacing: -0.35 }}>Suporte</h1>
              <p className="section-header-copy hero-copy-compact">
                {`Uma área objetiva para sustentar o beta pago/controlado: tirar dúvidas, registrar problemas e entender o próximo passo em planos, ${CREATOR_COINS_PUBLIC_NAME}, publicação e integrações sem ruído.`}
              </p>
            </div>

            <div className="support-hero-signals">
              <div className="support-hero-signal">
                <strong>FAQ útil</strong>
                <span>Respostas curtas para as dúvidas mais comuns antes de abrir uma solicitação.</span>
              </div>
              <div className="support-hero-signal">
                <strong>Contexto claro</strong>
                <span>{`Planos, ${CREATOR_COINS_PUBLIC_NAME}, checkout e publicação aparecem como trilhas de ajuda separadas.`}</span>
              </div>
            </div>
          </div>
          <div className="support-hero-focus">
            <span className="support-hero-focus-label">
              {email ? "Triagem interna pronta" : "Triagem guiada"}
            </span>
            <strong>Entre pelo FAQ, valide a trilha certa e leve o caso para a fila quando precisar de análise real.</strong>
            <p className="support-hero-focus-copy">
              O Support Assistant mantém categoria, contexto e histórico no mesmo fluxo para reduzir ida e volta e preservar a continuidade do beta pago/controlado.
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
              <a href="#support-assistant" className="btn-link-ea btn-primary">
                Abrir assistant
              </a>
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
            <span>Consulte o FAQ e a trilha certa antes de abrir uma solicitação. Isso reduz ida e volta e protege a experiência de um beta pago/controlado mais sério.</span>
          </div>
          <div className="support-context-item">
            <strong>Privacidade aplicada</strong>
            <span>Dados enviados em tickets e projetos não são usados para treinar modelos e permanecem em processamento isolado.</span>
          </div>
        </div>
      </section>

      <section className="support-guide-section">
        <div className="section-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Caminhos rápidos de ajuda</h2>
            <p className="helper-text-ea">Escolha a trilha mais próxima do seu caso antes de abrir uma solicitação.</p>
          </div>
        </div>
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
      </section>

      <section className="privacy-trust-note support-trust-note">
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

      <section className="support-faq-section">
        <div className="section-head">
          <div className="section-header-ea">
            <h2 className="heading-reset">Perguntas frequentes</h2>
            <p className="helper-text-ea">Respostas rápidas para dúvidas de operação, cobrança e continuidade do beta.</p>
          </div>
        </div>
        <div className="support-faq-grid">
          {SUPPORT_FAQ.map((item) => (
            <article key={item.question} className="support-faq-item">
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
