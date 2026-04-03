"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { toUserFacingError } from "../../../lib/uiFeedback";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement | null>(null);
  const initialMode = searchParams?.get("mode") === "signup" ? "signup" : "login";

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function setAuthMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setError(null);
    setSuccess(null);
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;

      if (data.session) {
        router.replace("/dashboard");
        return;
      }

      setCheckingSession(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/dashboard");
        return;
      }

      if (active) {
        setCheckingSession(false);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

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
        router.replace("/dashboard");
        return;
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

    router.replace("/dashboard");
  }

  if (checkingSession) {
    return (
      <div className="auth-entry-shell">
        <div className="auth-entry-loading">Verificando sessão...</div>
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

            <div className="auth-entry-toggle" role="tablist" aria-label="Modo de acesso">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
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
                role="tab"
                aria-selected={mode === "signup"}
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
