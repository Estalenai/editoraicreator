"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import { toUserFacingError } from "../../lib/uiFeedback";

type BetaAccessStatus = "pending" | "approved" | "rejected";

type Props = {
  initialEmail?: string;
  initialStatus?: BetaAccessStatus | null;
  title?: string;
  description?: string;
  compact?: boolean;
};

function statusLabel(status: BetaAccessStatus | null): string {
  if (status === "approved") return "Acesso liberado";
  if (status === "rejected") return "Solicitação não aprovada";
  if (status === "pending") return "Em análise";
  return "Sem solicitação";
}

function statusMessage(status: BetaAccessStatus | null): string {
  if (status === "approved") return "Seu acesso foi liberado. Faça login para entrar na plataforma.";
  if (status === "rejected") return "Sua solicitação não foi aprovada neste ciclo. Você pode reenviar.";
  if (status === "pending") return "Seu pedido está em análise.";
  return "Informe seu e-mail para entrar na fila.";
}

export function ClosedBetaAccessCard({
  initialEmail = "",
  initialStatus = null,
  title = "Beta fechado",
  description = "Solicite acesso para entrar na fila de liberação.",
  compact = false,
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<BetaAccessStatus | null>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resolvedStatus = useMemo(() => statusLabel(status), [status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = await api.requestBetaAccess({ email: email.trim().toLowerCase() });
      const nextStatus = String(payload?.request?.status || "pending") as BetaAccessStatus;
      setStatus(nextStatus);
      setSuccess(
        nextStatus === "approved"
          ? "Seu acesso já está liberado."
          : "Solicitação registrada com sucesso."
      );
    } catch (submitError: any) {
      setError(toUserFacingError(submitError?.message, "Falha ao registrar solicitação."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`beta-access-card-open${compact ? " beta-access-card-compact" : ""}`}>
      <div className="beta-access-summary">
        <div className="section-stack beta-access-card-head">
          <p className="section-kicker">Beta fechado</p>
          <h2 style={{ margin: 0, letterSpacing: -0.2 }}>{title}</h2>
          <p className="meta-text-ea">{description}</p>
        </div>

        <div className="beta-access-status-open">
          <div className="beta-access-status-row">
            <strong>Status:</strong>
            <span className="premium-badge premium-badge-phase">
              {resolvedStatus}
            </span>
          </div>
          <div className="helper-text-ea">{statusMessage(status)}</div>
          <div className="beta-access-action-row">
            <Link href="/login" className="btn-link-ea btn-primary btn-sm">
              Já tenho acesso
            </Link>
            <Link href="/login?mode=signup" className="btn-link-ea btn-secondary btn-sm">
              Criar conta
            </Link>
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="beta-access-form beta-access-form-open">
        <label htmlFor="waitlist-email" className="field-label-ea">
          <span>E-mail</span>
          <input
            id="waitlist-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@empresa.com"
            className="field-ea"
          />
        </label>
        <div className="helper-text-ea">
          Usamos este e-mail para atualizar seu status.
        </div>
        <button
          type="submit"
          disabled={loading || email.trim().length < 5}
          className="btn-ea btn-primary"
        >
          {loading ? "Enviando..." : "Entrar na fila de espera"}
        </button>
      </form>

      {error ? (
        <div className="state-ea state-ea-error" style={{ marginTop: 10 }}>
          <p className="state-ea-title">Não foi possível atualizar a fila</p>
          <div className="state-ea-text">{error}</div>
        </div>
      ) : null}
      {success ? (
        <div className="state-ea state-ea-success" style={{ marginTop: 10 }}>
          <p className="state-ea-title">Fila atualizada</p>
          <div className="state-ea-text">{success}</div>
        </div>
      ) : null}
    </div>
  );
}
