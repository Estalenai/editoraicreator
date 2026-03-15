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
  const activeTab = useMemo(
    () => tabs.find((item) => item.id === tab) ?? tabs[0],
    [tab, tabs]
  );

  return (
    <div className="editor-shell-root">
      <header className="premium-card editor-shell-header">
        <div className="editor-shell-header-grid">
          <div className="editor-shell-title-panel">
            <div className="hero-title-stack editor-shell-title-stack">
              <p className="section-kicker">Workspace editorial</p>
              <h2 style={{ margin: 0 }}>{title}</h2>
              <p className="editor-shell-note editor-shell-title-copy">
                EditexAI no centro do projeto: contexto salvo, apoio IA lateral e continuidade sem sair do editor.
              </p>
            </div>
            <div className="hero-meta-row">
              <span className="premium-badge premium-badge-phase">Area ativa: {activeTab.label}</span>
              <span className="premium-badge premium-badge-soon">Projeto com contexto salvo</span>
            </div>
          </div>

          <div className="editor-shell-status-panel">
            <div className="editor-shell-status-grid">
              <div className="editor-shell-status-item">
                <span>Fluxo</span>
                <strong>Editar, revisar e salvar</strong>
              </div>
              <div className="editor-shell-status-item">
                <span>Visibilidade</span>
                <strong>{transparentMode ? "Passo a passo ativo" : "Detalhes sob demanda"}</strong>
              </div>
              <div className="editor-shell-status-item">
                <span>Modo professor</span>
                <strong>{professorMode ? "Explicacao ligada" : "Opcional para apoio"}</strong>
              </div>
              <div className="editor-shell-status-item">
                <span>Proxima acao</span>
                <strong>{activeTab.id === "library" ? "Validar e registrar no projeto" : "Refinar a peca principal"}</strong>
              </div>
            </div>
            <div className="hero-actions-row editor-shell-header-actions">
              <Toggle label="Modo Professor" value={professorMode} onClick={onToggleProfessor} />
              <Toggle label="Modo Transparente" value={transparentMode} onClick={onToggleTransparent} />
              <a href="/dashboard" className="btn-link-ea btn-ghost btn-sm">Dashboard</a>
            </div>
          </div>
        </div>

        <div className="signal-strip editor-shell-signal-strip">
          <div className="signal-chip signal-chip-sober">
            <strong>Origem conectada</strong>
            <span>Creators, projetos e editor compartilham a mesma continuidade.</span>
          </div>
          <div className="signal-chip signal-chip-sober">
            <strong>Apoio lateral</strong>
            <span>A EditexAI acelera etapas sem competir com a peca principal.</span>
          </div>
          <div className="signal-chip signal-chip-sober">
            <strong>Controle editorial</strong>
            <span>Salvar, revisar e iterar continuam visiveis em um shell unico.</span>
          </div>
        </div>

        <div className="editor-shell-trust-grid">
          <div className="premium-card-soft trust-note editor-shell-trust-card">
            <strong>Documento vivo</strong>
            <span>O projeto continua editavel e pronto para novas iteracoes sem perder a base salva.</span>
          </div>
          <div className="premium-card-soft trust-note editor-shell-trust-card">
            <strong>IA com clareza</strong>
            <span>Professor e Transparencia ajudam a acompanhar o que a EditexAI fez em cada passo.</span>
          </div>
          <div className="premium-card-soft trust-note editor-shell-trust-card">
            <strong>Workspace continuo</strong>
            <span>Creators, projeto salvo e editor trabalham no mesmo fluxo operacional.</span>
          </div>
        </div>
      </header>

      <nav className="premium-card editor-shell-toolbar toolbar-surface">
        <div className="editor-shell-toolbar-head">
          <div className="editor-shell-toolbar-copy">
            <p className="section-kicker">Fluxo do editor</p>
            <p className="helper-text-ea">Troque de area sem perder o contexto salvo do projeto.</p>
          </div>
          <div className="editor-shell-toolbar-meta">
            <span className="premium-badge premium-badge-phase">{professorMode ? "Professor ativo" : "Professor opcional"}</span>
            <span className="premium-badge premium-badge-warning">{transparentMode ? "Transparencia ativa" : "Transparencia opcional"}</span>
          </div>
        </div>
        <div className="editor-shell-tab-row" role="tablist" aria-label="Areas do editor">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`btn-ea btn-sm ${t.id === tab ? "btn-primary" : "btn-ghost"}`}
              role="tab"
              aria-selected={t.id === tab}
              tabIndex={t.id === tab ? 0 : -1}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="editor-shell-grid">
        <aside className="premium-card editor-shell-panel editor-shell-panel-secondary">{left}</aside>
        <main className="premium-card editor-shell-panel editor-shell-panel-primary">{center}</main>
        <aside className="premium-card editor-shell-panel editor-shell-panel-secondary editor-shell-panel-support">{right}</aside>
      </div>

      <footer className="premium-card editor-shell-footer">
        {footer ?? (
          <p className="editor-shell-note">
            Dica: ative o Modo Transparente para ver o passo a passo da EditexAI em tempo real.
          </p>
        )}
      </footer>
    </div>
  );
}

function Toggle({ label, value, onClick }: { label: string; value: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`btn-ea btn-sm editor-shell-toggle ${value ? "btn-secondary" : "btn-ghost"}`}>
      <span className="editor-shell-toggle-label">{label}</span>
      <span className="editor-shell-toggle-state">{value ? "ON" : "OFF"}</span>
    </button>
  );
}
