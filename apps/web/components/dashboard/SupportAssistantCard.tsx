"use client";

import { useEffect, useMemo, useState, type KeyboardEvent, type Ref } from "react";
import { api } from "../../lib/api";
import { PremiumSelect } from "../ui/PremiumSelect";
import { toUserFacingError } from "../../lib/uiFeedback";
import { useAccountCenter } from "../account/AccountCenterProvider";

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
  updated_at?: string | null;
  metadata?: Record<string, any> | null;
};

type Props = {
  onRefetch?: () => Promise<void>;
  focused?: boolean;
  onFocus?: () => void;
  preview?: string;
  sectionRef?: Ref<HTMLElement>;
};

const CATEGORY_OPTIONS: Array<{ value: SupportCategory; label: string; hint: string }> = [
  { value: "duvida", label: "Dúvida", hint: "Uso, próximos passos ou interpretação do fluxo." },
  { value: "problema_tecnico", label: "Problema técnico", hint: "Erros, jobs travados ou comportamento inesperado." },
  { value: "pedido_financeiro", label: "Pedido financeiro", hint: "Cobrança, assinatura, compra de créditos ou saldo." },
  { value: "outro", label: "Outro", hint: "Pedidos gerais e feedback." },
];

const SUPPORT_EXPECTATIONS = [
  "Diga o que tentou fazer e o que aconteceu.",
  "Inclua checkout, projeto, job, URL ou tela quando existir.",
  "Se envolver cobrança, diga o que a Stripe mostrou e o que voltou para a conta.",
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

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function supportRef(item: SupportRequestItem): string {
  return String(item.metadata?.support_ref || item.id || "SUPORTE");
}

function supportLifecycle(item: SupportRequestItem): Array<Record<string, any>> {
  const lifecycle = Array.isArray(item.metadata?.lifecycle) ? item.metadata.lifecycle : [];
  return lifecycle.filter((entry) => entry && typeof entry === "object");
}

function supportQueueLabel(item: SupportRequestItem): string {
  return String(item.metadata?.queue_label || "Atendimento");
}

function supportOwnerLabel(item: SupportRequestItem): string | null {
  const value = String(item.metadata?.owner_label || "").trim();
  return value || null;
}

export function SupportAssistantCard({
  onRefetch,
  focused = true,
  onFocus,
  preview = "Abra o assistant quando quiser concentrar triagem, histórico e contexto do pedido na mesma área.",
  sectionRef,
}: Props) {
  const { pushLocalNotification } = useAccountCenter();
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
      const response = await api.supportCreateRequest({
        category,
        subject: subject.trim(),
        message: message.trim(),
        metadata: {
          context_ref: contextRef.trim() || null,
          source: "dashboard_support_assistant",
        },
      });

      setSuccess("Solicitação enviada. A resposta entra neste histórico.");
      pushLocalNotification({
        source: "support",
        title: "Solicitação enviada",
        message: "O caso entrou no inbox operacional e segue na trilha de atendimento.",
        status_code: "queued",
        href: "/support",
        meta: {
          support_ref: response?.item?.metadata?.support_ref || response?.item?.id || null,
        },
      });
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

  function onFocusTrigger(event: KeyboardEvent) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onFocus?.();
  }

  return (
    <section
      id="support-assistant"
      ref={sectionRef}
      className="support-assistant-card support-assistant-open focus-shell-section"
      data-focus-active={focused}
    >
      <div
        className="section-head support-assistant-head focus-shell-head"
        data-focus-clickable={!focused}
        role={!focused ? "button" : undefined}
        tabIndex={!focused ? 0 : -1}
        onClick={!focused ? onFocus : undefined}
        onKeyDown={!focused ? onFocusTrigger : undefined}
      >
        <div className="section-header-ea">
          <p className="section-kicker">Atendimento interno</p>
          <h3 className="heading-reset">Support Assistant</h3>
          <p className="helper-text-ea">
            Dúvidas, problemas e financeiro com histórico na mesma fila.
          </p>
        </div>
        <div className="hero-actions-row">
          <span className="premium-badge premium-badge-phase">Fila acompanhada pela equipe</span>
          {onFocus ? (
            <button
              type="button"
              onClick={onFocus}
              className={`btn-ea ${focused ? "btn-secondary" : "btn-ghost"} btn-sm focus-shell-toggle`}
              aria-pressed={focused}
            >
              {focused ? "Em foco" : "Trazer para foco"}
            </button>
          ) : null}
        </div>
      </div>
      {!focused && preview ? <div className="focus-shell-preview">{preview}</div> : null}

      {focused ? (
        <div className="focus-shell-body">
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

          <div className="support-category-hint">
            <strong>{selectedCategory.label}</strong>
            <span>{selectedCategory.hint}</span>
          </div>

          <label className="field-label-ea">
            <span>Mensagem</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva o caso: o que tentou fazer e o que apareceu."
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
            <span className="helper-text-ea">Mais contexto objetivo acelera a triagem.</span>
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
          <div className="support-guidelines-card">
            <strong>Como acelerar a resposta</strong>
            <ul className="support-guidelines-list">
              {SUPPORT_EXPECTATIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="support-guidelines-card">
            <strong>Quando falar com suporte</strong>
            <span>
              Use suporte quando checkout, saldo, histórico, plano, publicação ou integrações não refletirem o esperado.
            </span>
          </div>
        </aside>
      </div>

      <div className="support-history-head">
        <div className="section-header-ea">
          <h4 className="heading-reset">Minhas solicitações</h4>
          <p className="helper-text-ea">Acompanhe status, respostas internas e histórico.</p>
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
            Quando você enviar o primeiro pedido, ele aparece aqui com status e notas da equipe.
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
            <article key={item.id} className="support-history-item">
              <div className="support-history-headline">
                <strong>{formatSubject(item.subject)}</strong>
                <span className={`premium-badge ${item.status === "resolved" ? "premium-badge-phase" : item.status === "in_review" ? "premium-badge-warning" : "premium-badge-soon"}`}>
                  {statusLabel(item.status)}
                </span>
              </div>
              <div className="support-history-meta">
                <span>{formatDateTime(item.created_at)}</span>
                <span aria-hidden>•</span>
                <span>{categoryLabel(item.category)}</span>
                <span aria-hidden>•</span>
                <span>{supportRef(item)}</span>
              </div>
              <div className="support-history-proof-row">
                <span className="support-proof-chip">Fila: {supportQueueLabel(item)}</span>
                <span className="support-proof-chip">
                  Última atualização: {formatDateTime(item.updated_at || item.created_at)}
                </span>
                {supportOwnerLabel(item) ? (
                  <span className="support-proof-chip">Responsável: {supportOwnerLabel(item)}</span>
                ) : null}
              </div>
              <div className="support-history-message">{item.message}</div>
              {item.metadata?.resolution_summary ? (
                <div className="support-history-note">
                  <strong>Resumo de resolução</strong>
                  <span>{String(item.metadata.resolution_summary)}</span>
                </div>
              ) : null}
              {item.metadata?.next_step ? (
                <div className="support-history-note">
                  <strong>Próximo passo orientado</strong>
                  <span>{String(item.metadata.next_step)}</span>
                </div>
              ) : null}
              {item.admin_note ? (
                <div className="support-history-note">
                  <strong>Nota da equipe</strong>
                  <span>{item.admin_note}</span>
                </div>
              ) : null}
              {supportLifecycle(item).length > 0 ? (
                <div className="support-history-timeline">
                  {supportLifecycle(item).slice(-4).map((entry, index) => (
                    <div key={`${item.id}-entry-${index}`} className="support-history-timeline-item">
                      <strong>{String(entry.summary || statusLabel(item.status))}</strong>
                      <span>
                        {formatDateTime(entry.at)}{entry.owner_label ? ` • ${String(entry.owner_label)}` : ""}{entry.queue_label ? ` • ${String(entry.queue_label)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          </div>
        )}
        </div>
      ) : null}
    </section>
  );
}
