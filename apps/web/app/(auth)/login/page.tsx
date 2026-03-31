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
        "Conta criada com sucesso. Agora faça login e aguarde a aprovação no beta fechado para acessar o dashboard."
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
                {mode === "signup" ? "Crie sua conta para entrar no beta fechado" : "Entre no Editor AI Creator"}
              </h1>
              <p className="auth-entry-copy">
                {mode === "signup"
                  ? "Cadastre sua conta, entre na fila de aprovação e prepare seu acesso ao workspace."
                  : "Use seu acesso aprovado para abrir um workspace seguro, pronto para gerar, editar e exportar."}
              </p>
            </div>

            <div className="hero-meta-row auth-entry-meta-row">
              <span className="premium-badge premium-badge-phase">Beta fechado</span>
            </div>

            <div className="auth-entry-context-grid">
              <div className="auth-entry-context-item">
                <strong>Conta protegida</strong>
                <span>Somente contas aprovadas entram no workspace e seguem com sessão protegida.</span>
              </div>
              <div className="auth-entry-context-item">
                <strong>Entrada profissional</strong>
                <span>Login curto, dados isolados de treino e continuidade segura para abrir o editor.</span>
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
                  ? "Use um e-mail válido para entrar na fila de liberação."
                  : "Entre com seu e-mail e senha para abrir o workspace."}
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
                  ? "Depois do cadastro, sua conta entra na fila de análise. Avisaremos quando o acesso estiver pronto."
                  : "Se sua conta já foi aprovada, o login leva você direto para o dashboard."}
              </span>
            </div>

            <div className="auth-entry-inline-note">
              <strong>Segurança e confidencialidade</strong>
              <span>Dados da sua conta não são usados para treinar modelos. O processamento segue isolado e com prioridade para privacidade.</span>
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
