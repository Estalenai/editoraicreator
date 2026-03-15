"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { toUserFacingError } from "../../../lib/uiFeedback";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";

  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
        <div className="premium-card" style={{ padding: 20 }}>Verificando sessao...</div>
      </div>
    );
  }

  return (
    <div className="auth-entry-shell">
      <section className="premium-hero auth-entry-frame">
        <div className="auth-entry-grid">
          <div className="auth-entry-hero">
            <div className="section-stack">
              <p className="section-kicker">Acesso a plataforma</p>
              <h1 className="auth-entry-title">
                {mode === "signup" ? "Crie sua conta para entrar no beta fechado" : "Entre no Editor AI Creator"}
              </h1>
              <p className="auth-entry-copy">
                {mode === "signup"
                  ? "Cadastre sua conta, entre na fila de aprovacao e prepare o acesso ao workspace."
                  : "Use seu acesso aprovado para abrir uma plataforma clara, segura e pronta para operacao."}
              </p>
            </div>

            <div className="hero-meta-row">
              <span className="premium-badge premium-badge-phase">Beta fechado</span>
              <span className="premium-badge premium-badge-warning">Acesso controlado</span>
            </div>

            <div className="signal-strip auth-entry-signal-strip">
              <div className="signal-chip signal-chip-creative">
                <strong>Conta protegida</strong>
                <span>Autenticacao e liberacao de acesso continuam sob controle no beta.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Fluxo curto</strong>
                <span>Cadastro, aprovacao e entrada no workspace sem ruido desnecessario.</span>
              </div>
              <div className="signal-chip signal-chip-creative">
                <strong>Produto vivo</strong>
                <span>Creators, editor e operacao compartilham a mesma base visual e funcional.</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="premium-card auth-entry-card">
            <div className="section-stack">
              <p className="section-kicker">Acesso a plataforma</p>
              <h2 className="auth-entry-card-title">
                {mode === "signup" ? "Criar conta" : "Entrar"}
              </h2>
              <p className="meta-text-ea">
                {mode === "signup"
                  ? "Use um e-mail valido para solicitar liberacao e acompanhar a aprovacao."
                  : "Entre com seu e-mail e senha para abrir o workspace."}
              </p>
            </div>

            <div className="auth-entry-toggle" role="tablist" aria-label="Modo de acesso">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setSuccess(null);
                }}
                className={`btn-ea ${mode === "login" ? "btn-primary" : "btn-ghost"}`}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setSuccess(null);
                }}
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
                  placeholder="voce@empresa.com"
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
                  placeholder={mode === "signup" ? "Minimo de 6 caracteres" : "Digite sua senha"}
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
              <strong>{mode === "signup" ? "Aprovacao manual no beta" : "Acesso liberado"}</strong>
              <span>
                {mode === "signup"
                  ? "Depois do cadastro, sua conta entra na fila de analise. Voce sera avisado quando o acesso estiver pronto."
                  : "Se sua conta ja foi aprovada, o login leva voce direto para o dashboard."}
              </span>
            </div>

            {error ? (
              <div className="state-ea state-ea-error">
                <p className="state-ea-title">Nao foi possivel continuar</p>
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
                <Link href="/how-it-works" className="text-link-ea">Ver guia rapido</Link>
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
          <div className="premium-card auth-entry-loading">
            Carregando acesso...
          </div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
