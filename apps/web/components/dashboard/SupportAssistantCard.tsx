"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { PremiumSelect } from "../ui/PremiumSelect";
import { toUserFacingError } from "../../lib/uiFeedback";

type SupportCategory = "duvida" | "problema_tecnico" | "pedido_financeiro" | "outro";
type SupportStatus = "open" | "in_review" | "resolved";

type SupportRequestItem = {
  id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  status: SupportStatus;
  admin_note?: string | null;
  created_at: string;
};

type Props = {
  onRefetch?: () => Promise<void>;
};

const CATEGORY_OPTIONS: Array<{ value: SupportCategory; label: string; hint: string }> = [
  { value: "duvida", label: "Dúvida", hint: "Perguntas sobre uso da plataforma, próximos passos ou interpretação do fluxo." },
  { value: "problema_tecnico", label: "Problema técnico", hint: "Falhas, erros, jobs travados, retorno inconsistente ou comportamento inesperado." },
  { value: "pedido_financeiro", label: "Pedido financeiro", hint: "Cobrança, assinatura, compra de créditos, checkout ou divergência de saldo." },
  { value: "outro", label: "Outro", hint: "Solicitações gerais, feedbacks ou pedidos que não entram nas categorias anteriores." },
];

const SUPPORT_EXPECTATIONS = [
  "Descreva o que tentou fazer, o que esperava ver e o que aconteceu de fato.",
  "Inclua referência de checkout, projeto, job, URL ou tela quando existir.",
  "Se o tema envolver cobrança ou créditos, diga se o retorno da Stripe aconteceu e o que a tela mostrou depois.",
];

function categoryLabel(category: SupportCategory): string {
  if (category === "problema_tecnico") return "Problema técnico";
  if (category === "pedido_financeiro") return "Pedido financeiro";
  if (category === "duvida") return "Dúvida";
  return "Outro";
}

function statusLabel(status: SupportStatus): string {
  if (status === "in_review") return "Em análise";
  if (status === "resolved") return "Resolvido";
  return "Em aberto";
}

function formatSubject(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "Solicitação sem assunto";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function SupportAssistantCard({ onRefetch }: Props) {
  const [category, setCategory] = useState<SupportCategory>("duvida");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contextRef, setContextRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<SupportRequestItem[]>([]);

  const selectedCategory = useMemo(
    () => CATEGORY_OPTIONS.find((item) => item.value === category) || CATEGORY_OPTIONS[0],
    [category]
  );

  const categorySelectOptions = useMemo(
    () => CATEGORY_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    []
  );

  async function loadMyRequests() {
    setLoadingList(true);
    try {
      const data = await api.supportMyRequests(20);
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadMyRequests();
  }, []);

  async function onSubmit() {
    if (!subject.trim() || !message.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await api.supportCreateRequest({
        category,
        subject: subject.trim(),
        message: message.trim(),
        metadata: {
          context_ref: contextRef.trim() || null,
          source: "dashboard_support_assistant",
        },
      });

      setSuccess("Solicitação enviada. A equipe acompanha a fila interna e responde neste histórico assim que a análise começar.");
      setSubject("");
      setMessage("");
      setContextRef("");
      await loadMyRequests();
      if (onRefetch) await onRefetch();
    } catch (e: any) {
      setError(e?.message || "Falha ao enviar solicitação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="premium-card support-assistant-card surface-flow-region surface-flow-region-end">
      <div className="section-head support-assistant-head">
        <div className="section-header-ea">
          <p className="section-kicker">Atendimento interno</p>
          <h3 className="heading-reset">Support Assistant</h3>
          <p className="helper-text-ea">
            Use este canal para dúvidas, problemas técnicos e questões financeiras. A fila fica registrada no produto para acompanhamento contínuo.
          </p>
        </div>
        <span className="premium-badge premium-badge-phase">Fila acompanhada pela equipe</span>
      </div>

      <div className="support-assistant-grid">
        <div className="support-assistant-form">
          <div className="form-grid-2">
            <label className="field-label-ea">
              <span>Categoria</span>
              <PremiumSelect
                value={category}
                onChange={(next) => setCategory(next as SupportCategory)}
                options={categorySelectOptions}
                ariaLabel="Categoria de suporte"
              />
            </label>

            <label className="field-label-ea">
              <span>Assunto</span>
              <input
                id="support-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Resumo curto do pedido"
                className="field-ea"
              />
            </label>
          </div>

          <div className="premium-card-soft support-category-hint">
            <strong>{selectedCategory.label}</strong>
            <span>{selectedCategory.hint}</span>
          </div>

          <label className="field-label-ea">
            <span>Mensagem</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva o caso com contexto objetivo: o que tentou fazer, o que apareceu e o que esperava ver."
              rows={5}
              className="field-ea support-message-field"
            />
          </label>

          <label className="field-label-ea">
            <span>Referência opcional</span>
            <input
              value={contextRef}
              onChange={(e) => setContextRef(e.target.value)}
              placeholder="Ex.: order_123, quote_abc, URL da tela, jobId ou projectId"
              className="field-ea"
            />
          </label>

          <div className="support-assistant-actions">
            <button
              onClick={onSubmit}
              disabled={loading || !subject.trim() || !message.trim()}
              className="btn-ea btn-primary"
            >
              {loading ? "Enviando solicitação..." : "Enviar solicitação"}
            </button>
            <span className="helper-text-ea">Quanto mais contexto objetivo, mais rápida tende a ser a triagem.</span>
          </div>

          {error ? (
            <div className="state-ea state-ea-error state-ea-spaced">
              <p className="state-ea-title">Não foi possível enviar sua solicitação</p>
              <div className="state-ea-text">{toUserFacingError(error, "Revise os campos e tente novamente.")}</div>
            </div>
          ) : null}
          {success ? (
            <div className="state-ea state-ea-success state-ea-spaced">
              <p className="state-ea-title">Solicitação registrada</p>
              <div className="state-ea-text">{success}</div>
            </div>
          ) : null}
        </div>

        <aside className="support-assistant-side">
          <div className="premium-card-soft support-guidelines-card">
            <strong>Como acelerar a resposta</strong>
            <ul className="support-guidelines-list">
              {SUPPORT_EXPECTATIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="premium-card-soft support-guidelines-card">
            <strong>Quando falar com suporte</strong>
            <span>
              Use suporte quando checkout, saldo, histórico, plano, publicação ou integrações não refletirem o comportamento esperado após atualização da tela.
            </span>
          </div>
        </aside>
      </div>

      <div className="support-history-head">
        <div className="section-header-ea">
          <h4 className="heading-reset">Minhas solicitações</h4>
          <p className="helper-text-ea">Acompanhe status, respostas internas e o histórico do que já foi enviado.</p>
        </div>
        <button
          type="button"
          onClick={loadMyRequests}
          disabled={loadingList}
          className="btn-ea btn-secondary btn-sm"
        >
          {loadingList ? "Atualizando lista..." : "Atualizar lista"}
        </button>
      </div>

      {loadingList ? (
        <div className="empty-ea">Carregando histórico de solicitações...</div>
      ) : items.length === 0 ? (
        <div className="state-ea">
          <p className="state-ea-title">Nenhuma solicitação ainda</p>
          <div className="state-ea-text">
            Quando você enviar seu primeiro pedido, ele aparece aqui com status de acompanhamento e possíveis notas da equipe.
          </div>
          <div className="state-ea-actions">
            <button
              type="button"
              onClick={() => {
                const target = document.getElementById("support-subject");
                if (target instanceof HTMLInputElement) target.focus();
              }}
              className="btn-ea btn-primary btn-sm"
            >
              Criar solicitação
            </button>
            <button type="button" onClick={loadMyRequests} className="btn-ea btn-ghost btn-sm">
              Atualizar lista
            </button>
          </div>
        </div>
      ) : (
        <div className="support-history-list">
          {items.map((item) => (
            <article key={item.id} className="premium-card-soft support-history-item">
              <div className="support-history-headline">
                <strong>{formatSubject(item.subject)}</strong>
                <span className={`premium-badge ${item.status === "resolved" ? "premium-badge-phase" : item.status === "in_review" ? "premium-badge-warning" : "premium-badge-soon"}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <div className="support-history-meta">
                <span>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                <span aria-hidden>•</span>
                <span>{categoryLabel(item.category)}</span>
              </div>
              <div className="support-history-message">{item.message}</div>
              {item.admin_note ? (
                <div className="support-history-note">
                  <strong>Nota da equipe</strong>
                  <span>{item.admin_note}</span>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
