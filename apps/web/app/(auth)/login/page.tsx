"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { syncServerSession } from "../../../lib/clientSessionSync";
import { toUserFacingError } from "../../../lib/uiFeedback";
import { PublicLaunchFooter } from "../../../components/public/PublicLaunchFooter";

function normalizeNextPath(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  return raw;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement | null>(null);
  const sessionProbeTimeoutRef = useRef<number | null>(null);
  const initialMode = searchParams?.get("mode") === "signup" ? "signup" : "login";
  const nextPath = normalizeNextPath(searchParams?.get("next"));

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [sessionProbeNonce, setSessionProbeNonce] = useState(0);
  const [sessionProbeSlow, setSessionProbeSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function setAuthMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setError(null);
    setSuccess(null);
  }

  useEffect(() => {
    let active = true;
    let sessionCheckExpired = false;

    setCheckingSession(true);
    setSessionProbeSlow(false);
    if (sessionProbeTimeoutRef.current) {
      window.clearTimeout(sessionProbeTimeoutRef.current);
    }
    sessionProbeTimeoutRef.current = window.setTimeout(() => {
      sessionCheckExpired = true;
      if (!active) return;
      setSessionProbeSlow(true);
      setCheckingSession(false);
      setError((current) =>
        current || "A verificação da sessão demorou além do esperado. Você pode entrar manualmente agora."
      );
    }, 1800);

    const finishChecking = () => {
      if (!active) return;
      if (sessionProbeTimeoutRef.current) {
        window.clearTimeout(sessionProbeTimeoutRef.current);
        sessionProbeTimeoutRef.current = null;
      }
      setCheckingSession(false);
    };

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;

      if (data.session) {
        try {
          if (sessionCheckExpired) return;
          await syncServerSession(data.session);
          if (sessionCheckExpired || !active) return;
          router.replace(nextPath);
          return;
        } catch (syncError: any) {
          if (active) {
            setError(toUserFacingError(syncError?.message, "Nao foi possivel validar sua sessao agora."));
            finishChecking();
          }
        }
        return;
      }

      finishChecking();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        try {
          if (sessionCheckExpired) return;
          await syncServerSession(session);
          if (sessionCheckExpired || !active) return;
          router.replace(nextPath);
          return;
        } catch (syncError: any) {
          if (active) {
            setError(toUserFacingError(syncError?.message, "Nao foi possivel validar sua sessao agora."));
            finishChecking();
          }
        }
        return;
      }

      finishChecking();
    });

    return () => {
      active = false;
      if (sessionProbeTimeoutRef.current) {
        window.clearTimeout(sessionProbeTimeoutRef.current);
        sessionProbeTimeoutRef.current = null;
      }
      authListener.subscription.unsubscribe();
    };
  }, [nextPath, router, sessionProbeNonce]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (mode === "signup") {
      if (password.length < 6) {
        setError("A senha precisa ter no mínimo 6 caracteres.");
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError("As senhas não conferem.");
        setLoading(false);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(toUserFacingError(signUpError.message, "Não foi possível criar sua conta agora."));
        setLoading(false);
        return;
      }

      if (data.session) {
        try {
          await syncServerSession(data.session);
          router.replace(nextPath);
          return;
        } catch (syncError: any) {
          setError(toUserFacingError(syncError?.message, "Nao foi possivel validar sua sessao agora."));
          setLoading(false);
          return;
        }
      }

      setSuccess(
        "Conta criada. Faça login e acompanhe a aprovação do acesso."
      );
      setMode("login");
      setConfirmPassword("");
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(toUserFacingError(signInError.message, "Não foi possível concluir o login agora."));
      setLoading(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("A sessao nao foi confirmada depois do login.");
      setLoading(false);
      return;
    }

    try {
      await syncServerSession(session);
      router.replace(nextPath);
    } catch (syncError: any) {
      setError(toUserFacingError(syncError?.message, "Nao foi possivel validar sua sessao agora."));
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="auth-entry-shell auth-entry-shell-loading">
        <section className="auth-entry-loading-surface premium-card">
          <div className="section-stack">
            <p className="section-kicker">Acesso à plataforma</p>
            <h1 className="auth-entry-loading-title">Verificando sessão</h1>
            <p className="auth-entry-loading-copy">
              Estamos restaurando sua conta e retomando o workspace com segurança.
            </p>
          </div>
          <div className="auth-entry-loading-progress" aria-hidden="true">
            <div className="premium-skeleton premium-skeleton-line auth-entry-loading-line auth-entry-loading-line-strong" />
            <div className="premium-skeleton premium-skeleton-line auth-entry-loading-line" />
            <div className="premium-skeleton premium-skeleton-line auth-entry-loading-line auth-entry-loading-line-short" />
          </div>
          <div className="auth-entry-inline-note">
            <strong>Recuperando sessão e permissões</strong>
            <span>Se a confirmação demorar demais, liberamos entrada manual sem deixar a tela vazia.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-entry-shell">
      <section className="auth-entry-frame-open">
        <div className="auth-entry-grid auth-entry-grid-open">
          <div className="auth-entry-hero">
            <div className="section-stack">
              <p className="section-kicker">Acesso à plataforma</p>
              <h1 className="auth-entry-title">
                {mode === "signup" ? "Crie sua conta para pedir acesso" : "Entre no núcleo criativo"}
              </h1>
              <p className="auth-entry-copy">
                {mode === "signup"
                  ? "Cadastre sua conta e entre na fila."
                  : "Use seu acesso aprovado para abrir creators, editor e projetos."}
              </p>
            </div>

            <div className="hero-meta-row auth-entry-meta-row">
              <span className="premium-badge premium-badge-phase">Beta fechado</span>
            </div>

            <div className="auth-entry-context-grid">
              <div className="auth-entry-context-item">
                <strong>Acesso aprovado</strong>
                <span>Só contas liberadas entram no núcleo.</span>
              </div>
              <div className="auth-entry-context-item">
                <strong>Conta isolada</strong>
                <span>Dados da conta não entram em treino.</span>
              </div>
            </div>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="auth-entry-card-open">
            <div className="section-stack">
              <p className="section-kicker">Acesso à plataforma</p>
              <h2 className="auth-entry-card-title">
                {mode === "signup" ? "Criar conta" : "Entrar"}
              </h2>
              <p className="meta-text-ea">
                {mode === "signup"
                  ? "Use um e-mail válido para pedir acesso."
                  : "Entre com e-mail e senha."}
              </p>
            </div>

            <div className="auth-entry-toggle" role="group" aria-label="Modo de acesso">
              <button
                type="button"
                aria-pressed={mode === "login"}
                data-active={mode === "login" ? "true" : "false"}
                onClick={() => {
                  if (mode === "login") {
                    formRef.current?.requestSubmit();
                    return;
                  }
                  setAuthMode("login");
                }}
                disabled={loading && mode === "login"}
                className={`btn-ea ${mode === "login" ? "btn-primary" : "btn-ghost"}`}
              >
                Entrar
              </button>
              <button
                type="button"
                aria-pressed={mode === "signup"}
                data-active={mode === "signup" ? "true" : "false"}
                onClick={() => setAuthMode("signup")}
                className={`btn-ea ${mode === "signup" ? "btn-primary" : "btn-ghost"}`}
              >
                Criar conta
              </button>
            </div>

            <div className="auth-entry-form">
              <label className="field-label-ea">
                <span>E-mail</span>
                <input
                  type="email"
                  placeholder="você@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="field-ea"
                />
              </label>

              <label className="field-label-ea">
                <span>Senha</span>
                <input
                  type="password"
                  placeholder={mode === "signup" ? "Mínimo de 6 caracteres" : "Digite sua senha"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className="field-ea"
                />
              </label>

              {mode === "signup" ? (
                <label className="field-label-ea">
                  <span>Confirmar senha</span>
                  <input
                  type="password"
                  placeholder="Repita sua senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="field-ea"
                />
              </label>
              ) : null}
            </div>

            <div className="auth-entry-support-note">
              <strong>{mode === "signup" ? "Aprovação manual no beta" : "Acesso liberado"}</strong>
              <span>
                {mode === "signup"
                  ? "Depois do cadastro, sua conta entra em análise."
                  : "Contas aprovadas entram direto no workspace."}
              </span>
            </div>

            <div className="auth-entry-inline-note">
              <strong>Segurança e confidencialidade</strong>
              <span>Os dados da conta não entram em treino.</span>
            </div>

            {error ? (
              <div className="state-ea state-ea-error">
                <p className="state-ea-title">Não foi possível continuar</p>
                <div className="state-ea-text">{error}</div>
              </div>
            ) : null}
            {success ? (
              <div className="state-ea state-ea-success">
                <p className="state-ea-title">Conta criada</p>
                <div className="state-ea-text">{success}</div>
              </div>
            ) : null}

            {sessionProbeSlow ? (
              <div className="auth-entry-loading-actions">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSessionProbeSlow(false);
                    setSessionProbeNonce((value) => value + 1);
                  }}
                  className="btn-ea btn-secondary btn-sm"
                >
                  Tentar verificar novamente
                </button>
              </div>
            ) : null}

            <button type="submit" disabled={loading} className="btn-ea btn-primary auth-entry-submit">
              {loading ? "Processando..." : mode === "signup" ? "Criar conta" : "Entrar"}
            </button>

            <div className="auth-entry-links">
              <div className="auth-entry-link-row">
                <span>Sem acesso ainda?</span>
                <Link href="/" className="text-link-ea">Entrar na fila de espera</Link>
              </div>
              <div className="auth-entry-link-row">
                <span>Primeiro acesso?</span>
                <Link href="/how-it-works" className="text-link-ea">Ver guia rápido</Link>
              </div>
            </div>
          </form>
        </div>
      </section>

      <PublicLaunchFooter />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-entry-shell">
          <div className="auth-entry-loading">
            Carregando acesso...
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
