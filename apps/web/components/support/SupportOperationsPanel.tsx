"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { toUserFacingError } from "../../lib/uiFeedback";

type HealthReadySnapshot = Awaited<ReturnType<typeof api.healthReady>>;

type OperationsTone = "ok" | "warn" | "muted";

const RETRY_GUIDELINES = [
  "Tente novamente quando a ação estiver em pendente ou sincronizando, sem erro novo.",
  "Espere a reconciliação quando publicação, saldo ou retorno externo ainda não refletirem o estado final.",
  "Evite repetir checkout, conversão ou publish se o histórico já indicar processamento em andamento.",
];

const ESCALATION_GUIDELINES = [
  "Abra suporte quando o mesmo erro voltar depois da nova tentativa.",
  "Escalone quando checkout, saldo, projeto ou publicação ficarem divergentes do histórico.",
  "Abra ticket se o quadro operacional entrar em atenção e a ação crítica depender disso.",
];

const CONTEXT_GUIDELINES = [
  "Assunto claro com rota, projeto, checkout, ticket ou deployment envolvidos.",
  "Mensagem de erro exata, o que você tentou fazer e o estado que esperava ver.",
  "Referência útil: URL da tela, horário aproximado e status atual que ficou travado.",
];

function resolvePlatformTone(
  loading: boolean,
  snapshot: HealthReadySnapshot | null,
  error: string | null
): { tone: OperationsTone; label: string; summary: string } {
  if (loading) {
    return {
      tone: "muted",
      label: "Verificando",
      summary: "Consultando a prontidão da plataforma.",
    };
  }

  if (error) {
    return {
      tone: "warn",
      label: "Sem leitura",
      summary: "A plataforma não conseguiu confirmar a prontidão agora. Use o histórico da ação e a trilha certa antes de insistir.",
    };
  }

  if (snapshot?.ok) {
    return {
      tone: "ok",
      label: "Operacional",
      summary: "A API e as dependências centrais responderam. Falhas pontuais tendem a estar no fluxo específico.",
    };
  }

  return {
    tone: "warn",
    label: "Atenção",
    summary: "A leitura de prontidão voltou degradada. Antes de repetir cobrança, geração ou publish, valide o contexto do erro.",
  };
}

export function SupportOperationsPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<HealthReadySnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHealthReady() {
      setLoading(true);
      setError(null);

      try {
        const payload = await api.healthReady();
        if (cancelled) return;
        setSnapshot(payload);
      } catch (healthError: any) {
        if (cancelled) return;
        setSnapshot(null);
        setError(toUserFacingError(healthError?.message, "Falha ao consultar a prontidão da plataforma."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHealthReady();
    return () => {
      cancelled = true;
    };
  }, []);

  const platformState = useMemo(
    () => resolvePlatformTone(loading, snapshot, error),
    [error, loading, snapshot]
  );

  const readinessFacts = useMemo(
    () => [
      {
        label: "API ready",
        value: snapshot ? `${snapshot.status}` : loading ? "Carregando" : "Sem leitura",
      },
      {
        label: "Banco",
        value: snapshot?.deps?.db ? "Disponível" : loading ? "Aguardando" : "Atenção",
      },
      {
        label: "Admin Supabase",
        value: snapshot?.deps?.supabaseAdmin ? "Configurado" : loading ? "Aguardando" : "Ausente",
      },
    ],
    [loading, snapshot]
  );

  return (
    <section className="support-ops-section" aria-labelledby="support-ops-title">
      <div className="section-head">
        <div className="section-header-ea">
          <h2 id="support-ops-title" className="heading-reset">
            Status e ajuda operacional
          </h2>
          <p className="helper-text-ea">
            Um quadro curto do estado atual e do que fazer quando saldo, publish, geração ou checkout não refletirem o esperado.
          </p>
        </div>
      </div>

      <div className="support-ops-layout">
        <article className="support-ops-card support-ops-card-primary">
          <div className="support-ops-head">
            <div className="support-ops-title-stack">
              <span className={`support-ops-chip support-ops-chip-${platformState.tone}`}>
                {platformState.label}
              </span>
              <strong>Plataforma</strong>
            </div>
            <span className="support-ops-meta-pill">
              {snapshot ? `Ready ${snapshot.status}` : "Sem snapshot"}
            </span>
          </div>
          <p className="support-ops-copy">{platformState.summary}</p>
          <div className="support-ops-facts" role="list" aria-label="Dependências da plataforma">
            {readinessFacts.map((fact) => (
              <div key={fact.label} role="listitem">
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
          {error ? <div className="support-ops-inline-note">{error}</div> : null}
        </article>

        <div className="support-ops-stack">
          <article className="support-ops-card support-ops-card-secondary">
            <div className="support-ops-head">
              <div className="support-ops-title-stack">
                <span className="support-ops-chip support-ops-chip-muted">Próximo passo</span>
                <strong>Quando tentar de novo</strong>
              </div>
            </div>
            <p className="support-ops-copy">
              Repita a ação quando o sistema ainda estiver processando e o histórico não mostrar falha nova.
            </p>
            <ul className="support-ops-list">
              {RETRY_GUIDELINES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="support-ops-card support-ops-card-secondary">
            <div className="support-ops-head">
              <div className="support-ops-title-stack">
                <span className="support-ops-chip support-ops-chip-muted">Escalada</span>
                <strong>Quando abrir suporte</strong>
              </div>
            </div>
            <p className="support-ops-copy">
              Abra suporte quando o produto já sinalizou que a ação não avançou sozinha.
            </p>
            <ul className="support-ops-list">
              {ESCALATION_GUIDELINES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="support-ops-card support-ops-card-secondary">
            <div className="support-ops-head">
              <div className="support-ops-title-stack">
                <span className="support-ops-chip support-ops-chip-muted">Pedido claro</span>
                <strong>O que incluir</strong>
              </div>
            </div>
            <p className="support-ops-copy">
              Quanto menos interpretação a equipe precisar fazer, mais rápido o retorno fica útil.
            </p>
            <ul className="support-ops-list">
              {CONTEXT_GUIDELINES.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
