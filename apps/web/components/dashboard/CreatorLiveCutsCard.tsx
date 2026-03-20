"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { coinTypeLabel } from "../../lib/coinTypeLabel";
import { PremiumSelect } from "../ui/PremiumSelect";
import { toUserFacingError } from "../../lib/uiFeedback";

type LiveCutMode = "timed" | "continuous";
type LiveCutStatus = "draft" | "active" | "paused" | "ended" | "canceled";
type LiveCutIntensity = "basic" | "balanced" | "aggressive";
type PreferredMoment = "engracado" | "marcante" | "impactante" | "highlights_gerais" | "outro";

type LiveCutSession = {
  id: string;
  source_label?: string | null;
  mode: LiveCutMode;
  requested_duration_minutes?: number | null;
  estimate_preview_minutes: number;
  status: LiveCutStatus;
  intensity: LiveCutIntensity;
  preferred_moments: PreferredMoment[];
  estimated_credit_type: "common" | "pro" | "ultra";
  estimated_credit_amount: number;
  accepted_estimate: boolean;
  auto_post_enabled: boolean;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  ended_at?: string | null;
};

type EstimatePayload = {
  horizon_minutes: number;
  block_minutes: number;
  credit_type: "common" | "pro" | "ultra";
  credit_amount: number;
  note: string;
};

const MOMENT_OPTIONS: Array<{ value: PreferredMoment; label: string }> = [
  { value: "engracado", label: "Momentos engraçados" },
  { value: "marcante", label: "Momentos marcantes" },
  { value: "impactante", label: "Falas impactantes" },
  { value: "highlights_gerais", label: "Highlights gerais" },
  { value: "outro", label: "Outro foco" },
];

const LIVE_CUT_MODE_OPTIONS = [
  { value: "timed", label: "Tempo definido" },
  { value: "continuous", label: "Contínuo (previsão por crédito)" },
];

const LIVE_CUT_INTENSITY_OPTIONS = [
  { value: "basic", label: "Básica (menor consumo)" },
  { value: "balanced", label: "Balanceada" },
  { value: "aggressive", label: "Agressiva (maior intensidade)" },
];

function statusLabel(status: LiveCutStatus) {
  if (status === "active") return "Ativa";
  if (status === "paused") return "Pausada";
  if (status === "ended") return "Encerrada";
  if (status === "canceled") return "Cancelada";
  return "Rascunho";
}

function modeLabel(mode: LiveCutMode): string {
  return mode === "timed" ? "Tempo definido" : "Contínuo";
}

function intensityLabel(intensity: LiveCutIntensity): string {
  if (intensity === "basic") return "Básica";
  if (intensity === "aggressive") return "Agressiva";
  return "Balanceada";
}

export function CreatorLiveCutsCard() {
  const [sourceLabel, setSourceLabel] = useState("");
  const [mode, setMode] = useState<LiveCutMode>("timed");
  const [requestedDurationMinutes, setRequestedDurationMinutes] = useState(60);
  const [estimatePreviewMinutes, setEstimatePreviewMinutes] = useState(120);
  const [intensity, setIntensity] = useState<LiveCutIntensity>("balanced");
  const [preferredMoments, setPreferredMoments] = useState<PreferredMoment[]>(["highlights_gerais"]);
  const [autoPostEnabled, setAutoPostEnabled] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessions, setSessions] = useState<LiveCutSession[]>([]);
  const [latestEstimate, setLatestEstimate] = useState<EstimatePayload | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const canCreate = mode === "timed" ? requestedDurationMinutes >= 15 : estimatePreviewMinutes >= 30;

  const estimatePreviewLabel = useMemo(() => {
    if (mode === "timed") {
      return `${requestedDurationMinutes} min definidos`;
    }
    return `${estimatePreviewMinutes} min de previsão contínua`;
  }, [mode, requestedDurationMinutes, estimatePreviewMinutes]);

  function togglePreferredMoment(moment: PreferredMoment) {
    setPreferredMoments((prev) => {
      if (prev.includes(moment)) {
        const next = prev.filter((item) => item !== moment);
        return next.length > 0 ? next : ["highlights_gerais"];
      }
      if (prev.length >= 5) return prev;
      return [...prev, moment];
    });
  }

  async function loadSessions() {
    setLoadingList(true);
    try {
      const payload = await api.liveCutsListSessions(20);
      setSessions(Array.isArray(payload?.items) ? payload.items : []);
    } catch {
      setSessions([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, []);

  async function onCreateSession() {
    if (!canCreate) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = await api.liveCutsCreateSession({
        source_label: sourceLabel.trim() || undefined,
        mode,
        requested_duration_minutes: mode === "timed" ? requestedDurationMinutes : undefined,
        estimate_preview_minutes: mode === "continuous" ? estimatePreviewMinutes : undefined,
        intensity,
        preferred_moments: preferredMoments,
        auto_post_enabled: autoPostEnabled,
        notes: notes.trim() || undefined,
      });

      setLatestEstimate(payload?.estimate || null);
      setSuccess("Sessão criada em rascunho. Revise a estimativa e ative quando estiver pronto.");
      await loadSessions();
    } catch (e: any) {
      setError(e?.message || "Falha ao criar sessão de cortes ao vivo.");
    } finally {
      setLoading(false);
    }
  }

  async function onUpdateStatus(session: LiveCutSession, nextStatus: Exclude<LiveCutStatus, "draft">) {
    setUpdatingId(session.id);
    setError(null);
    setSuccess(null);
    try {
      await api.liveCutsUpdateSessionStatus(session.id, {
        status: nextStatus,
        accepted_estimate: nextStatus === "active" ? true : undefined,
      });
      setSuccess(`Sessão ${statusLabel(nextStatus as LiveCutStatus)}.`);
      await loadSessions();
    } catch (e: any) {
      setError(e?.message || "Falha ao atualizar status da sessão.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="creator-workspace-card creator-workspace-card-modular creator-workspace-module">
      <div className="creator-workspace-header">
        <div className="hero-title-stack section-stack-tight">
          <p className="section-kicker">Configuração da sessão</p>
          <h3 className="heading-reset">Creator Live Cuts</h3>
        </div>
        <p className="creator-workspace-subtitle">
          Configure a sessão, valide a estimativa e acompanhe a operação inicial de cortes ao vivo.
        </p>
      </div>

      <div className="creator-workspace-zones">
      <div className="creator-form-zone">
        <p className="creator-zone-title">Configuração da sessão</p>
        <p className="creator-zone-copy">Defina origem, modo e intensidade antes de criar a sessão com estimativa.</p>
        <div className="form-grid-2 creator-field-grid">
        <label className="field-label-ea">
          <span>Fonte/label da live</span>
          <input
            value={sourceLabel}
            onChange={(e) => setSourceLabel(e.target.value)}
            placeholder="Ex.: Live semanal no YouTube"
            className="field-ea"
          />
        </label>

        <label className="field-label-ea">
          <span>Modo</span>
          <PremiumSelect
            value={mode}
            onChange={(next) => setMode(next as LiveCutMode)}
            options={LIVE_CUT_MODE_OPTIONS}
            ariaLabel="Modo da sessão de cortes"
          />
        </label>

        {mode === "timed" ? (
          <label className="field-label-ea">
            <span>Duração solicitada (min)</span>
            <input
              type="number"
              min={15}
              max={720}
              value={requestedDurationMinutes}
              onChange={(e) => setRequestedDurationMinutes(Number(e.target.value || 60))}
              className="field-ea"
            />
          </label>
        ) : (
          <label className="field-label-ea">
            <span>Janela de previsão (min)</span>
            <input
              type="number"
              min={30}
              max={720}
              value={estimatePreviewMinutes}
              onChange={(e) => setEstimatePreviewMinutes(Number(e.target.value || 120))}
              className="field-ea"
            />
          </label>
        )}

        <label className="field-label-ea">
          <span>Intensidade</span>
          <PremiumSelect
            value={intensity}
            onChange={(next) => setIntensity(next as LiveCutIntensity)}
            options={LIVE_CUT_INTENSITY_OPTIONS}
            ariaLabel="Intensidade dos cortes"
          />
        </label>
        </div>
      </div>

      <div className="creator-form-zone">
        <p className="creator-zone-title">Prioridades da sessão</p>
        <p className="creator-zone-copy">Escolha os momentos prioritários e registre observações antes de ativar a operação.</p>
        <div className="creator-section-label">Priorizar momentos</div>
        <div className="creator-chip-list">
          {MOMENT_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="choice-chip"
              data-active={preferredMoments.includes(option.value)}
            >
              <input
                type="checkbox"
                checked={preferredMoments.includes(option.value)}
                onChange={() => togglePreferredMoment(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>

      <label className="toggle-row" data-active={autoPostEnabled}>
        <input type="checkbox" checked={autoPostEnabled} onChange={(e) => setAutoPostEnabled(e.target.checked)} />
        <span>Auto post (somente flag para etapas futuras)</span>
      </label>

      <label className="field-label-ea">
        <span>Observações</span>
        <textarea
          className="field-ea creator-prompt-textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Preferências extras para os cortes."
        />
      </label>
      </div>

      <div className="creator-context-zone">
        <p className="creator-zone-title">Pré-visualização operacional</p>
        <p className="creator-zone-copy">
          Fase 1 focada em configuração, estimativa explícita e controle inicial antes da automação contínua.
        </p>
        <div className="helper-note-inline"><strong>Pré-visualização:</strong> {estimatePreviewLabel}</div>
        <div className="helper-note-subtle">
          O consumo final pode variar na evolução da feature, mas a ativação sempre passa por estimativa explícita. O histórico em Créditos concentra a movimentação real.
        </div>
      </div>

      <div className="creator-actions-row">
        <div className="creator-action-buttons">
        <button
          onClick={onCreateSession}
          disabled={loading || !canCreate}
          className="btn-ea btn-primary"
        >
          {loading ? "Criando..." : "Criar sessão com estimativa"}
        </button>
        </div>
        {(error || success) ? (
          <div className="creator-feedback-stack">
            {error ? (
          <div className="state-ea state-ea-error">
            <p className="state-ea-title">Falha na operação da sessão</p>
            <div className="state-ea-text">{toUserFacingError(error, "Tente novamente em instantes.")}</div>
          </div>
            ) : null}
        {success ? <div className="creator-feedback-note">{success}</div> : null}
          </div>
        ) : null}
      </div>

      {latestEstimate && (
        <div className="creator-output-card">
          <div className="creator-output-card-title">Estimativa registrada</div>
          <div className="creator-output-card-stat-row">
            <span>Créditos previstos</span>
            <strong>{latestEstimate.credit_amount} {coinTypeLabel(latestEstimate.credit_type)}</strong>
          </div>
          <div className="creator-output-card-meta">Horizonte: {latestEstimate.horizon_minutes} min</div>
          <div className="result-copy-prewrap">{latestEstimate.note}</div>
        </div>
      )}

      <div className="creator-result-stack">
        <div className="creator-result-header">
          <p className="section-kicker">Operação</p>
          <div className="creator-result-title">Minhas sessões</div>
          <p className="creator-result-copy">Use este painel para acompanhar rascunhos, ativações e encerramentos da Fase 1.</p>
        </div>
        {loadingList ? (
          <div className="creator-loading-panel creator-workspace-note">
            <div className="helper-note-inline">Carregando sessões...</div>
            <div className="premium-skeleton premium-skeleton-line" style={{ width: "36%" }} />
            <div className="premium-skeleton premium-skeleton-line" style={{ width: "82%" }} />
          </div>
        ) : sessions.length === 0 ? (
          <div className="state-ea creator-empty-state">
            <p className="state-ea-title">Nenhuma sessão criada</p>
            <div className="state-ea-text">
              Configure uma sessão com estimativa para começar a operação de cortes ao vivo nesta Fase 1.
            </div>
            <div className="state-ea-actions">
              <button onClick={onCreateSession} disabled={loading || !canCreate} className="btn-ea btn-primary btn-sm">
                Criar primeira sessão
              </button>
              <Link href="/support" className="btn-link-ea btn-ghost btn-sm">
                Tirar dúvidas
              </Link>
            </div>
          </div>
        ) : (
          <div className="creator-session-list">
            {sessions.map((session) => (
              <div key={session.id} className="creator-session-card">
                <div className="creator-session-card-head">
                  <strong>{session.source_label || "Sessão de cortes ao vivo"}</strong>
                  <span className="premium-badge premium-badge-phase">{statusLabel(session.status)}</span>
                </div>
                <div className="creator-session-card-meta">
                  <span>
                  {modeLabel(session.mode)} • {intensityLabel(session.intensity)} • {session.estimated_credit_amount}{" "}
                  {coinTypeLabel(session.estimated_credit_type)}
                  </span>
                  <span>{new Date(session.created_at).toLocaleString("pt-BR")}</span>
                </div>
                <div className="creator-session-actions">
                  {session.status === "draft" ? (
                    <button
                      onClick={() => onUpdateStatus(session, "active")}
                      disabled={updatingId === session.id}
                      className="btn-ea btn-success btn-sm"
                    >
                      Ativar sessão
                    </button>
                  ) : null}
                  {session.status === "active" ? (
                    <>
                      <button
                        onClick={() => onUpdateStatus(session, "paused")}
                        disabled={updatingId === session.id}
                        className="btn-ea btn-secondary btn-sm"
                      >
                        Pausar
                      </button>
                      <button
                        onClick={() => onUpdateStatus(session, "ended")}
                        disabled={updatingId === session.id}
                        className="btn-ea btn-danger btn-sm"
                      >
                        Encerrar
                      </button>
                    </>
                  ) : null}
                  {session.status === "paused" ? (
                    <>
                      <button
                        onClick={() => onUpdateStatus(session, "active")}
                        disabled={updatingId === session.id}
                        className="btn-ea btn-success btn-sm"
                      >
                        Retomar
                      </button>
                      <button
                        onClick={() => onUpdateStatus(session, "canceled")}
                        disabled={updatingId === session.id}
                        className="btn-ea btn-danger btn-sm"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}




