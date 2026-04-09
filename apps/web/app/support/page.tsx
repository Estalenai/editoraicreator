"use client";

import Link from "next/link";
import { useDashboardBootstrap } from "../../hooks/useDashboardBootstrap";
import { BetaAccessBlockedView } from "../../components/waitlist/BetaAccessBlockedView";
import { SupportAssistantCard } from "../../components/dashboard/SupportAssistantCard";
import { SupportOperationsPanel } from "../../components/support/SupportOperationsPanel";
import { CREATOR_COINS_PUBLIC_NAME } from "../../lib/creatorCoins";
import { toUserFacingError } from "../../lib/uiFeedback";

const SUPPORT_PATHS = [
  {
    title: "Cobrança e saldo",
    description: `Consulte plano, checkout, saldo e movimentações de ${CREATOR_COINS_PUBLIC_NAME}.`,
    href: "/credits",
    cta: `Abrir ${CREATOR_COINS_PUBLIC_NAME}`,
  },
  {
    title: "Publicação e continuidade",
    description: "Veja projeto, sincronização e saída na mesma trilha.",
    href: "/projects",
    cta: "Ver projetos",
  },
  {
    title: "Fluxo principal",
    description: "Reveja creators, editor, projetos e saída antes de abrir suporte.",
    href: "/how-it-works",
    cta: "Revisar fluxo",
  },
];

const SUPPORT_FAQ = [
  {
    question: "Quando devo abrir suporte em vez de tentar novamente?",
    answer:
      "Abra suporte quando o erro voltar, quando saldo ou publish não refletirem o histórico ou quando o quadro operacional indicar atenção.",
  },
  {
    question: "O que incluir para a equipe responder mais rápido?",
    answer:
      "Envie assunto claro, erro, referência do job ou checkout e a tela afetada.",
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
      <div className="support-page-canvas">
        <section className="support-hero support-hero-open">
          <div className="support-hero-intro">
            <div className="hero-copy">
              <div className="hero-title-stack">
                <p className="section-kicker">Canal operacional</p>
                <h1 style={{ margin: "4px 0 0", letterSpacing: -0.35 }}>Suporte</h1>
                <p className="section-header-copy hero-copy-compact">
                  {`Dúvidas, problemas e próximo passo com menos ida e volta em planos, ${CREATOR_COINS_PUBLIC_NAME} e publicação.`}
                </p>
              </div>

              <div className="support-hero-signals">
                <div className="support-hero-signal">
                  <strong>Status curto</strong>
                  <span>Confirme a prontidão da plataforma antes de assumir erro geral.</span>
                </div>
                <div className="support-hero-signal">
                  <strong>Base certa</strong>
                  <span>{`Cobrança, ${CREATOR_COINS_PUBLIC_NAME}, publish e fluxo principal têm rota curta.`}</span>
                </div>
              </div>
            </div>
            <div className="support-hero-focus">
              <span className="support-hero-focus-label">
                {email ? "Canal pronto" : "Canal orientado"}
              </span>
              <strong>Confirme status, consulte a base certa e abra o caso só quando precisar.</strong>
              <p className="support-hero-focus-copy">
                O Support Assistant mantém categoria, contexto e histórico no mesmo fluxo.
              </p>
              <div className="support-hero-focus-meta">
                <span className="premium-badge premium-badge-phase">
                  {email ? "Acompanhamento operacional ativo" : "Apoio operacional orientado"}
                </span>
                <span className="support-hero-focus-meta-copy">
                  {email || "Conta em validação no momento."}
                </span>
              </div>
              <div className="hero-actions-row support-hero-actions">
                <Link href="#support-assistant" className="btn-link-ea btn-primary">
                  Abrir assistant
                </Link>
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
              <span>Consulte a base certa antes de abrir um caso.</span>
            </div>
            <div className="support-context-item">
              <strong>Privacidade aplicada</strong>
              <span>Dados de tickets e projetos não entram em treino.</span>
            </div>
          </div>
        </section>

        <div className="support-workspace-grid">
          <div className="support-workspace-main">
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

            <SupportAssistantCard focused />

            <section id="support-guide" className="support-reference-section">
              <div className="section-head support-reference-head">
                <div className="section-header-ea">
                  <h2 className="heading-reset">Bases de apoio e respostas rápidas</h2>
                  <p className="helper-text-ea">
                    Abra a rota certa, confirme o contexto e só escale quando a trilha já indicar que a ação não avançou.
                  </p>
                </div>
              </div>

              <div className="support-reference-grid">
                <section className="support-reference-primary">
                  <div className="support-reference-subhead">
                    <strong>Caminhos rápidos</strong>
                    <span>Rotas curtas para cobrança, publish e fluxo principal.</span>
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

                <section id="support-faq" className="support-reference-faq">
                  <div className="support-reference-subhead">
                    <strong>Perguntas frequentes</strong>
                    <span>Respostas rápidas para operação, cobrança e continuidade.</span>
                  </div>
                  <div className="support-faq-list">
                    {SUPPORT_FAQ.map((item) => (
                      <article key={item.question} className="support-faq-item">
                        <strong>{item.question}</strong>
                        <p>{item.answer}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          </div>

          <aside className="support-workspace-rail">
            <SupportOperationsPanel />

            <section className="privacy-trust-note support-trust-note support-privacy-rail">
              <strong>Privacidade e confidencialidade</strong>
              <span>Dados enviados em tickets e projetos não entram em treino.</span>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
