"use client";

import { ReactNode, useMemo } from "react";

export type EditorTab = "video" | "text" | "automation" | "course" | "website" | "library";

export function EditorShell({
  title,
  tab,
  onTab,
  professorMode,
  transparentMode,
  onToggleProfessor,
  onToggleTransparent,
  left,
  center,
  right,
  footer
}: {
  title: string;
  tab: EditorTab;
  onTab: (t: EditorTab) => void;
  professorMode: boolean;
  transparentMode: boolean;
  onToggleProfessor: () => void;
  onToggleTransparent: () => void;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
}) {
  const tabs = useMemo(
    () =>
      [
        { id: "video" as const, label: "Vídeo" },
        { id: "text" as const, label: "Texto" },
        { id: "automation" as const, label: "Workflows" },
        { id: "course" as const, label: "Cursos" },
        { id: "website" as const, label: "Sites" },
        { id: "library" as const, label: "Biblioteca IA" }
      ],
    []
  );

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto auto 1fr auto", height: "calc(100vh - 32px)", gap: 12 }}>
      <header style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <p style={{ margin: 0, opacity: 0.8, fontSize: 12 }}>Autocrie.ai • Editor AI Creator</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Toggle label="Modo Professor" value={professorMode} onClick={onToggleProfessor} />
            <Toggle label="Modo Transparente" value={transparentMode} onClick={onToggleTransparent} />
            <a href="/dashboard" style={linkBtn()}>Dashboard</a>
          </div>
        </div>
      </header>

      <nav style={card()}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              style={tabBtn(t.id === tab)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 340px", gap: 12, minHeight: 0 }}>
        <aside style={{ ...card(), overflow: "auto" }}>{left}</aside>
        <main style={{ ...card(), overflow: "auto" }}>{center}</main>
        <aside style={{ ...card(), overflow: "auto" }}>{right}</aside>
      </div>

      <footer style={{ ...card(), display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        {footer ?? (
          <p style={{ margin: 0, opacity: 0.8, fontSize: 12 }}>
            Dica: ative o Modo Transparente para ver o passo a passo da Autocrie em tempo real.
          </p>
        )}
      </footer>
    </div>
  );
}

function Toggle({ label, value, onClick }: { label: string; value: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={toggleBtn(value)}>
      <span style={{ opacity: 0.9 }}>{label}</span>
      <span style={{ marginLeft: 8, fontWeight: 700 }}>{value ? "ON" : "OFF"}</span>
    </button>
  );
}

function card(): React.CSSProperties {
  return {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)"
  };
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: active ? "linear-gradient(90deg,#00AEEF,#6B5BFF)" : "rgba(0,0,0,0.15)",
    color: "#fff",
    cursor: "pointer"
  };
}

function toggleBtn(active: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(52,245,255,0.18)" : "rgba(255,255,255,0.08)",
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
    textDecoration: "none"
  };
}
