import Link from "next/link";
import { PublicLaunchFooter } from "./PublicLaunchFooter";

type PublicDocumentSection = {
  title: string;
  body: string[];
};

type PublicDocumentPageProps = {
  kicker: string;
  title: string;
  summary: string;
  disclaimer?: string;
  sections: PublicDocumentSection[];
};

export function PublicDocumentPage({
  kicker,
  title,
  summary,
  disclaimer = "Este material representa a base pública e operacional do produto nesta fase. Revisão jurídica e regulatória posterior continua recomendada antes do lançamento definitivo.",
  sections,
}: PublicDocumentPageProps) {
  return (
    <div className="page-shell public-document-page">
      <div className="public-document-canvas">
        <section className="public-document-hero surface-flow-hero" data-reveal>
          <div className="public-document-hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">{kicker}</p>
              <h1 className="heading-reset">{title}</h1>
              <p className="hero-copy-compact">{summary}</p>
            </div>

            <div className="hero-meta-row hero-meta-row-compact">
              <span className="premium-badge premium-badge-warning">Base pública do produto</span>
              <Link href="/login" className="btn-link-ea btn-secondary btn-sm">
                Entrar na plataforma
              </Link>
            </div>
          </div>

          <div className="public-document-disclaimer">
            <strong>Escopo desta página</strong>
            <span>{disclaimer}</span>
          </div>
        </section>

        <section className="public-document-sections surface-flow-region layout-contract-region" data-reveal data-reveal-delay="40">
          {sections.map((section, index) => (
            <article key={section.title} className="public-document-section layout-contract-item" data-reveal data-reveal-delay={String(60 + index * 35)}>
              <div className="section-stack-tight">
                <h2 className="heading-reset public-document-section-title">{section.title}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="helper-text-ea public-document-paragraph">
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </section>

        <PublicLaunchFooter />
      </div>
    </div>
  );
}
