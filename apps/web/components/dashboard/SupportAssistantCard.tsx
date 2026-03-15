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
  { value: "duvida", label: "Dúvida", hint: "Perguntas sobre uso da plataforma." },
  { value: "problema_tecnico", label: "Problema técnico", hint: "Falhas, erros e comportamento inesperado." },
  { value: "pedido_financeiro", label: "Pedido financeiro", hint: "Reembolso, cobrança ou dúvidas de pagamento." },
  { value: "outro", label: "Outro", hint: "Solicitações gerais e feedbacks." },
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

function statusTone(status: SupportStatus) {
  if (status === "resolved") {
    return { background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.55)" };
  }
  if (status === "in_review") {
    return { background: "rgba(59,130,246,0.2)", border: "1px solid rgba(59,130,246,0.55)" };
  }
  return { background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.55)" };
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

      setSuccess("Solicitação enviada. Nossa equipe vai analisar em breve.");
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
    <div
      className="premium-card"
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 14,
        background: "linear-gradient(165deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04))",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 12px 28px rgba(2,6,23,0.24)",
      }}
    >
      <div className="section-head">
        <div>
          <p className="section-kicker">Atendimento interno</p>
          <h3 style={{ margin: "4px 0 0" }}>Support Assistant</h3>
        </div>
        <span className="premium-badge premium-badge-phase">Fila acompanhada pelo admin</span>
      </div>
      <div style={{ opacity: 0.8, marginTop: 8, marginBottom: 10 }}>
        Use este canal para tirar dúvidas e registrar pedidos. Solicitações financeiras são encaminhadas para análise manual.
      </div>

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

      <div className="premium-card-soft" style={{ marginTop: 10, padding: "8px 10px", opacity: 0.85, fontSize: 13 }}>
        {selectedCategory.hint}
      </div>

      <label className="field-label-ea" style={{ marginTop: 12 }}>
        <span>Mensagem</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Descreva seu caso com o máximo de contexto possível..."
          rows={5}
          className="field-ea"
          style={{
            width: "100%",
            resize: "vertical",
          }}
        />
      </label>

      <label className="field-label-ea" style={{ marginTop: 12 }}>
        <span>Referência opcional</span>
        <input
          value={contextRef}
          onChange={(e) => setContextRef(e.target.value)}
          placeholder="Ex.: order_123, quote_abc, URL da tela, jobId..."
          className="field-ea"
        />
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button
          onClick={onSubmit}
          disabled={loading || !subject.trim() || !message.trim()}
          className="btn-ea btn-primary"
        >
          {loading ? "Enviando..." : "Enviar solicitação"}
        </button>
        {error ? (
          <div className="state-ea state-ea-error" style={{ flex: 1, minWidth: 260 }}>
            <p className="state-ea-title">Não foi possível enviar sua solicitação</p>
            <div className="state-ea-text">{toUserFacingError(error, "Revise os campos e tente novamente.")}</div>
          </div>
        ) : null}
        {success ? (
          <div className="state-ea state-ea-success" style={{ flex: 1, minWidth: 260 }}>
            <p className="state-ea-title">Solicitação registrada</p>
            <div className="state-ea-text">{success}</div>
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ height: 1, background: "rgba(255,255,255,0.12)", marginBottom: 12 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 600 }}>Minhas solicitações</div>
          <button
            type="button"
            onClick={loadMyRequests}
            disabled={loadingList}
            className="btn-ea btn-secondary btn-sm"
          >
            {loadingList ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>
        {loadingList ? (
          <div className="empty-ea">Carregando histórico de solicitações...</div>
        ) : items.length === 0 ? (
          <div className="state-ea">
            <p className="state-ea-title">Nenhuma solicitação ainda</p>
            <div className="state-ea-text">
              Quando você enviar seu primeiro pedido, ele aparece aqui com status de acompanhamento.
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
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((item) => (
              <div key={item.id} className="premium-card-soft" style={{ padding: 10, borderRadius: 10, background: "rgba(0,0,0,0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong style={{ lineHeight: 1.35 }}>{formatSubject(item.subject)}</strong>
                  <span
                    style={{
                      ...statusTone(item.status),
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "3px 8px",
                      borderRadius: 999,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {statusLabel(item.status)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    opacity: 0.82,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                  <span aria-hidden>•</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.1)",
                    }}
                  >
                    {categoryLabel(item.category)}
                  </span>
                </div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{item.message}</div>
                {item.admin_note ? (
                  <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: "rgba(255,255,255,0.06)" }}>
                    <strong>Nota da equipe:</strong> {item.admin_note}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



