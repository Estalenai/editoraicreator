"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../..//lib/supabaseClient";
import { api } from "../../lib/api";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      setSessionEmail(data.session?.user?.email ?? null);

      if (!token) {
        window.location.href = "/login";
        return;
      }

      try {
        const [p, w, pr] = await Promise.all([
          api.myPlan(),
          api.coinsBalance().catch(() => null), // se SQL do passo 9 não foi rodado ainda
          api.listProjects()
        ]);

        setPlan(p);
        if (w) setWallet(w.wallet);
        setProjects(pr?.data ?? pr ?? []);
      } catch (e: any) {
        setErr(typeof e === "string" ? e : (e?.error?.message || "Falha ao carregar dashboard"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function createProject() {
    const title = prompt("Título do projeto?");
    if (!title) return;
    try {
      const created = await api.createProject({ title, kind: "text", data: { createdFrom: "web" } });
      alert("Projeto criado!");
      // recarregar lista
      const pr = await api.listProjects();
      setProjects(pr?.data ?? pr ?? []);
    } catch (e: any) {
      alert(typeof e === "string" ? e : (e?.error?.message || "Erro ao criar"));
    }
  }

  if (loading) return <p>Carregando…</p>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Dashboard</h2>
            <p style={{ margin: 0, opacity: 0.85 }}>Logado como: {sessionEmail}</p>
          </div>
          <button onClick={logout} style={btn("rgba(255,255,255,0.12)")}>Sair</button>
        </div>
      </div>

      {err && <div style={card()}><p style={{ margin: 0, color: "#34F5FF" }}>{err}</p></div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={card()}>
          <h3 style={{ marginTop: 0 }}>Plano</h3>
          <pre style={pre()}>{JSON.stringify(plan, null, 2)}</pre>
        </div>
        <div style={card()}>
          <h3 style={{ marginTop: 0 }}>Creator Coins</h3>
          <p style={{ opacity: 0.85, marginTop: 0 }}>
            Se você ainda não executou o SQL do PASSO 9, esta seção pode ficar vazia (ok).
          </p>
          <pre style={pre()}>{wallet ? JSON.stringify(wallet, null, 2) : "—"}</pre>
        </div>
      </div>

      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Projetos</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a href="/editor/new" style={linkBtn()}>Abrir Editor</a>
            <button onClick={createProject} style={btn()}>Novo projeto</button>
          </div>
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {projects?.length ? projects.map((p: any) => (
            <div key={p.id || p.title} style={{
              padding: 12, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(0,0,0,0.18)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <strong>{p.title}</strong>
                {p.id && <a href={`/editor/${p.id}`} style={miniLink()}>Editar</a>}
              </div>
              <div style={{ opacity: 0.8, fontSize: 12 }}>kind: {p.kind}</div>
            </div>
          )) : <p style={{ opacity: 0.8, margin: 0 }}>Nenhum projeto ainda.</p>}
        </div>
      </div>
    </div>
  );
}

function card(): React.CSSProperties {
  return {
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)"
  };
}
function pre(): React.CSSProperties {
  return {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.2)",
    overflowX: "auto",
    margin: 0
  };
}
function btn(bg?: string): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: bg || "linear-gradient(90deg,#00AEEF,#6B5BFF)",
    color: "#fff",
    cursor: "pointer"
  };
}

function linkBtn(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    textDecoration: "none",
    cursor: "pointer"
  };
}

function miniLink(): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.15)",
    color: "#34F5FF",
    textDecoration: "none",
    fontSize: 12
  };
}
