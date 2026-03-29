"use client";

import { ReactNode, useMemo } from "react";

export type EditorTab = "video" | "text" | "automation" | "course" | "website" | "library";

export function EditorShell({
  title,
  tab,
  onTab,
  versionLabel,
  reviewLabel,
  checkpointLabel,
  deliverableLabel,
  outputLabel,
  nextActionLabel,
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
  versionLabel?: string;
  reviewLabel?: string;
  checkpointLabel?: string;
  deliverableLabel?: string;
  outputLabel?: string;
  nextActionLabel?: string;
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
    <div className="editor-shell-root editor-shell-workspace layout-contract-editor">
      <section className="editor-shell-canvas editor-shell-surface layout-contract-canvas">
        <header className="editor-shell-header editor-shell-region layout-contract-region">
          <div className="editor-shell-header-grid">
            <div className="editor-shell-title-panel">
              <div className="hero-title-stack editor-shell-title-stack">
                <p className="section-kicker">Workspace editorial</p>
                <h2 style={{ margin: 0 }}>{title}</h2>
                <p className="editor-shell-note editor-shell-title-copy">
                  Este é o centro do beta pago/controlado: creators, projeto salvo, checkpoints, revisão e saída rastreada convergem no mesmo workspace até o encerramento do fluxo.
                </p>
              </div>
              <div className="hero-meta-row">
                <span className="premium-badge premium-badge-phase">Área ativa: {activeTab.label}</span>
                <span className="premium-badge premium-badge-soon">Projeto com contexto salvo e saída rastreada</span>
              </div>
            </div>

            <div className="editor-shell-status-panel editor-shell-status-rail layout-contract-rail">
              <div className="editor-shell-status-grid">
                <div className="editor-shell-status-item">
                  <span>Entregável</span>
                  <strong>{deliverableLabel || "Gerar, editar e publicar"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Versão ativa</span>
                  <strong>{versionLabel || "Sem versão salva ainda"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Checkpoint</span>
                  <strong>{checkpointLabel || "Sem checkpoint ativo"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Revisão</span>
                  <strong>{reviewLabel || "Draft em andamento"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Visibilidade</span>
                  <strong>{transparentMode ? "Passo a passo ativo" : "Detalhes sob demanda"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Explicação guiada</span>
                  <strong>{professorMode ? "Explicação ligada" : "Opcional para apoio"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Outputs</span>
                  <strong>{outputLabel || "Saídas e ativos no mesmo projeto"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Próxima ação</span>
                  <strong>{nextActionLabel || (activeTab.id === "library" ? "Validar e registrar no projeto" : "Refinar a peça principal")}</strong>
                </div>
              </div>
              <div className="hero-actions-row editor-shell-header-actions">
                <Toggle label="Explicação guiada" value={professorMode} onClick={onToggleProfessor} />
                <Toggle label="Passo a passo" value={transparentMode} onClick={onToggleTransparent} />
                <a href="/dashboard" className="btn-link-ea btn-ghost btn-sm">Dashboard</a>
              </div>
            </div>
          </div>

          <div className="signal-strip editor-shell-signal-strip">
            <div className="signal-chip signal-chip-sober">
              <strong>Origem conectada</strong>
              <span>Creators, projetos e editor compartilham continuidade para vídeo, foto e outras peças.</span>
            </div>
            <div className="signal-chip signal-chip-sober">
              <strong>Apoio lateral</strong>
              <span>A EditexAI acelera etapas sem competir com a peça principal.</span>
            </div>
            <div className="signal-chip signal-chip-sober">
              <strong>Controle editorial</strong>
              <span>Salvar, revisar e iterar continuam visíveis em um shell único.</span>
            </div>
            <div className="signal-chip signal-chip-sober">
              <strong>Versionamento vivo</strong>
              <span>Versões, checkpoints, contexto e entregáveis ficam no mesmo workspace até a saída final.</span>
            </div>
          </div>

          <div className="editor-shell-trust-grid">
            <div className="trust-note editor-shell-trust-card layout-contract-note">
              <strong>Documento vivo</strong>
              <span>O projeto continua editável e pronto para novas iterações sem perder a base salva.</span>
            </div>
            <div className="trust-note editor-shell-trust-card layout-contract-note">
              <strong>IA com clareza</strong>
              <span>Explicação guiada e passo a passo ajudam a acompanhar o que a EditexAI fez em cada etapa.</span>
            </div>
            <div className="trust-note editor-shell-trust-card layout-contract-note">
              <strong>Saída controlada</strong>
              <span>Fluxo padrão de entrega: salve a versão, registre exported com clareza e confirme published quando a etapa manual estiver realmente concluída. GitHub e Vercel entram como handoff secundário.</span>
            </div>
          </div>
        </header>

        <nav className="editor-shell-toolbar toolbar-surface editor-shell-region layout-contract-region">
          <div className="editor-shell-toolbar-head">
            <div className="editor-shell-toolbar-copy">
              <p className="section-kicker">Fluxo do editor</p>
              <p className="helper-text-ea">Troque de área sem perder o contexto salvo nem a base de publicação.</p>
            </div>
            <div className="editor-shell-toolbar-meta">
              <span className="premium-badge premium-badge-phase">{professorMode ? "Explicação ativa" : "Explicação opcional"}</span>
              <span className="premium-badge premium-badge-warning">{transparentMode ? "Passo a passo ativo" : "Passo a passo opcional"}</span>
            </div>
          </div>
          <div className="editor-shell-tab-row" role="tablist" aria-label="Áreas do editor">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTab(t.id)}
                className="editor-shell-tab-trigger layout-contract-item"
                data-active={t.id === tab}
                role="tab"
                aria-selected={t.id === tab}
                tabIndex={t.id === tab ? 0 : -1}
              >
                <span className="editor-shell-tab-trigger-label">{t.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="editor-shell-grid editor-shell-grid-continuous">
          <aside className="editor-shell-panel editor-shell-panel-secondary editor-shell-panel-rail layout-contract-panel">{left}</aside>
          <main className="editor-shell-panel editor-shell-panel-primary editor-shell-panel-core layout-contract-panel">{center}</main>
          <aside className="editor-shell-panel editor-shell-panel-secondary editor-shell-panel-support editor-shell-panel-rail layout-contract-panel">{right}</aside>
        </div>

        <footer className="editor-shell-footer editor-shell-region layout-contract-region">
          {footer ?? (
            <p className="editor-shell-note">
              Dica: ative o passo a passo para ver a execução da EditexAI com mais clareza.
            </p>
          )}
        </footer>
      </section>
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
