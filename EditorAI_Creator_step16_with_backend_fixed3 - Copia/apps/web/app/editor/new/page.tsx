"use client";

import { useState } from "react";
import { api } from "../../lib/api";

type Kind = "video" | "text" | "automation" | "course" | "website";

export default function NewEditorProjectPage() {
  const [creating, setCreating] = useState<Kind | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function create(kind: Kind) {
    setErr(null);
    setCreating(kind);
    try {
      const title = prompt("Título do projeto?") || `Novo ${kind}`;
      const created = await api.createProject({
        title,
        kind,
        data: {
          editor: {
            version: 1,
            mode: { professor: false, transparent: false },
            timeline: { clips: [] },
            doc: { text: "" },
            workflow: { nodes: [], edges: [] },
            course: { sections: [] },
            website: { blocks: [] },
            aiSteps: []
          }
        }
      });

      const id = created?.data?.id || created?.id;
      if (id) {
        window.location.href = `/editor/${id}`;
        return;
      }
      alert("Projeto criado, mas não consegui obter o ID.");
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.error?.message || "Falha ao criar projeto"));
    } finally {
      setCreating(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={card()}>
        <h2 style={{ margin: 0 }}>Editor AI Creator</h2>
        <p style={{ margin: 0, opacity: 0.85 }}>Criar um novo projeto no editor (estrutura base)</p>
      </div>

      {err && <div style={card()}><p style={{ margin: 0, color: "#34F5FF" }}>{err}</p></div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <button style={btn()} onClick={() => create("video")} disabled={!!creating}>
          {creating === "video" ? "Criando…" : "Projeto de Vídeo"}
        </button>
        <button style={btn()} onClick={() => create("text")} disabled={!!creating}>
          {creating === "text" ? "Criando…" : "Post / Texto"}
        </button>
        <button style={btn()} onClick={() => create("automation")} disabled={!!creating}>
          {creating === "automation" ? "Criando…" : "Automação (Workflow)"}
        </button>
        <button style={btn()} onClick={() => create("course")} disabled={!!creating}>
          {creating === "course" ? "Criando…" : "Curso"}
        </button>
        <button style={btn()} onClick={() => create("website")} disabled={!!creating}>
          {creating === "website" ? "Criando…" : "Site"}
        </button>
      </div>

      <div style={card()}>
        <a href="/dashboard" style={link()}>Voltar ao dashboard</a>
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

function btn(): React.CSSProperties {
  return {
    padding: "14px 12px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "linear-gradient(90deg,#00AEEF,#6B5BFF)",
    color: "#fff",
    cursor: "pointer"
  };
}

function link(): React.CSSProperties {
  return {
    color: "#34F5FF",
    textDecoration: "none"
  };
}
