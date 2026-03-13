"use client";

import { useState } from "react";
import { api } from "../../../lib/api";

type Kind = "video" | "text" | "automation" | "course" | "website";

const KIND_LABEL: Record<Kind, string> = {
  video: "Projeto de Vídeo",
  text: "Projeto de Texto",
  automation: "Projeto de Automação",
  course: "Projeto de Curso",
  website: "Projeto de Site",
};

const KIND_HELP: Record<Kind, string> = {
  video: "Estrutura inicial para timeline e roteiro audiovisual.",
  text: "Base para post, copy e evolução no editor de texto.",
  automation: "Projeto inicial para fluxo e automação com IA.",
  course: "Estrutura para aulas, módulos e progressão de conteúdo.",
  website: "Blueprint inicial para blocos e páginas de site.",
};

const KIND_USE_CASE: Record<Kind, string> = {
  video: "Ideal para continuidade de roteiro, cenas e timeline.",
  text: "Melhor para copy, post, artigo e refinamento editorial.",
  automation: "Abre uma base pronta para mapear automacoes e etapas IA.",
  course: "Organiza modulos, secoes e trilhas de conteudo.",
  website: "Prepara estrutura de paginas, blocos e narrativas de site."
};

function extractProjectId(payload: any): string {
  const rawId =
    payload?.item?.id ||
    payload?.data?.item?.id ||
    payload?.data?.id ||
    payload?.id ||
    "";
  return String(rawId || "").trim();
}

export default function NewEditorProjectPage() {
  const [creating, setCreating] = useState<Kind | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function create(kind: Kind) {
    setErr(null);
    setCreating(kind);
    try {
      const title = `${KIND_LABEL[kind]} • ${new Date().toLocaleDateString("pt-BR")}`;
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

      const id = extractProjectId(created);
      if (id) {
        window.location.href = `/editor/${id}`;
        return;
      }
      throw new Error("Projeto criado, mas não foi possível abrir o editor automaticamente.");
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao criar projeto"));
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="page-shell editor-new-page">
      <section className="premium-hero editor-new-hero">
        <div className="hero-split editor-new-hero-grid">
          <div className="hero-copy">
            <div className="hero-title-stack">
              <p className="section-kicker">Entrada do editor</p>
              <h1 style={{ margin: 0, letterSpacing: -0.3 }}>Abra um projeto com contexto pronto</h1>
              <p className="editor-new-lead">
                Escolha o formato mais proximo do seu fluxo e entre no editor com base inicial, landmarks claros e continuidade salva.
              </p>
            </div>
            <div className="hero-meta-row">
              <span className="premium-badge premium-badge-phase">5 formatos de projeto</span>
              <span className="premium-badge premium-badge-soon">Workspace com contexto salvo</span>
            </div>
          </div>

          <div className="hero-side-panel">
            <p className="section-kicker">Como comeca</p>
            <div className="hero-side-list">
              <div className="hero-side-note">
                <strong>Escolha o formato certo</strong>
                <span>O editor abre ja orientado para o tipo de projeto que voce quer desenvolver.</span>
              </div>
              <div className="hero-side-note">
                <strong>Entre com estrutura minima pronta</strong>
                <span>Texto, video, automacao, curso ou site com base salva desde o primeiro passo.</span>
              </div>
              <div className="hero-side-note">
                <strong>Continue no mesmo workspace</strong>
                <span>Salve, refine com IA e retome depois sem quebrar o contexto do projeto.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-kpi-grid editor-new-kpi-grid">
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Escolha inicial</span>
            <strong className="hero-kpi-value">Formato mais proximo do fluxo</strong>
          </div>
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Continuidade</span>
            <strong className="hero-kpi-value">Projeto salvo desde o primeiro clique</strong>
          </div>
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Pronto para editar</span>
            <strong className="hero-kpi-value">Entrada guiada no editor</strong>
          </div>
        </div>
      </section>

      {err ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Nao foi possivel abrir o editor</p>
          <div className="state-ea-text">{err}</div>
        </div>
      ) : null}

      <section className="premium-card editor-new-selection">
        <div className="section-header-ea">
          <p className="section-kicker">Escolha inicial</p>
          <h2 style={{ margin: 0 }}>Selecione o formato mais proximo do seu trabalho</h2>
          <p className="section-header-copy">
            Cada opcao abre um workspace pronto para continuidade, com estrutura base e apoio lateral da EditexAI.
          </p>
        </div>

        <div className="editor-kind-grid">
          {(Object.keys(KIND_LABEL) as Kind[]).map((kind) => (
            <button
              key={kind}
              className={`editor-kind-card ${creating === kind ? "editor-kind-card-loading" : ""}`}
              onClick={() => create(kind)}
              disabled={!!creating}
            >
              <span className="section-kicker editor-kind-kicker">Tipo de projeto</span>
              <span className="editor-kind-title">{creating === kind ? "Preparando workspace..." : KIND_LABEL[kind]}</span>
              <span className="editor-kind-copy">{KIND_HELP[kind]}</span>
              <span className="editor-kind-meta">{KIND_USE_CASE[kind]}</span>
              <span className="editor-kind-action">{creating === kind ? "Aguarde" : "Abrir no editor"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="premium-card-soft editor-new-footer">
        <div className="editor-new-flow">
          <div className="premium-card-soft editor-new-flow-note">
            <strong>1. Escolha o formato</strong>
            <span>Comece pela estrutura que melhor representa o seu fluxo de trabalho.</span>
          </div>
          <div className="premium-card-soft editor-new-flow-note">
            <strong>2. Edite com apoio da IA</strong>
            <span>Use o painel lateral para acelerar etapas sem perder foco no projeto.</span>
          </div>
          <div className="premium-card-soft editor-new-flow-note">
            <strong>3. Salve e continue</strong>
            <span>Mantenha o contexto registrado para voltar ao editor ou seguir a partir de Creators.</span>
          </div>
        </div>
        <a href="/dashboard" className="btn-link-ea btn-ghost btn-sm">Voltar ao dashboard</a>
      </section>
    </div>
  );
}
