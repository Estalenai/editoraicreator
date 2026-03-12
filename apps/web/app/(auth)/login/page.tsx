"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) return setMsg(error.message);

    window.location.href = "/dashboard";
  }

  return (
    <div style={card()}>
      <h2 style={{ marginTop: 0 }}>Login</h2>
      <form onSubmit={onLogin} style={{ display: "grid", gap: 10 }}>
        <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="email" style={inp()} />
        <input value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="senha" type="password" style={inp()} />
        <button disabled={loading} style={btn()}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
        {msg && <p style={{ margin: 0, color: "#34F5FF" }}>{msg}</p>}
      </form>
      <p style={{ opacity: 0.8, marginBottom: 0 }}>
        O acesso usa Supabase Auth e o backend valida via Bearer access_token.
      </p>
    </div>
  );
}

function card(): React.CSSProperties {
  return {
    maxWidth: 420,
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)"
  };
}
function inp(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    color: "#fff",
    outline: "none"
  };
}
function btn(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "linear-gradient(90deg,#00AEEF,#6B5BFF)",
    color: "#fff",
    cursor: "pointer"
  };
}
