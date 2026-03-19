"use client";

import { useState } from "react";
import { api } from "../../../lib/api";

type Kind = "video" | "text" | "automation" | "course" | "website";

const PRIMARY_KINDS: Kind[] = ["text", "video"];
const SECONDARY_KINDS: Kind[] = ["automation", "course", "website"];

const KIND_LABEL: Record<Kind, string> = {
  video: "Projeto de Vídeo",
  text: "Projeto de Texto",
  automation: "Projeto de Automação",
  course: "Projeto de Curso",
  website: "Projeto de Site",
};

const KIND_HELP: Record<Kind, string> = {
  video: "Estrutura inicial para timeline, cortes e ativos visuais de vídeo e foto.",
  text: "Base para post, copy e evolução no editor de texto.",
  automation: "Projeto inicial para fluxo e automação com IA.",
  course: "Estrutura para aulas, módulos e progressão de conteúdo.",
  website: "Blueprint inicial para blocos e páginas de site.",
};

const KIND_USE_CASE: Record<Kind, string> = {
  video: "Ideal para continuidade de roteiro, cenas, timeline e refinamento visual.",
  text: "Melhor para copy, post, artigo e refinamento editorial.",
  automation: "Abre uma base pronta para mapear automações e etapas com IA.",
  course: "Organiza módulos, seções e trilhas de conteúdo.",
  website: "Prepara estrutura de páginas, blocos e narrativas de site.",
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
            aiSteps: [],
            review: { factCheck: null, status: "draft" },
            versions: [],
            checkpoints: [],
            delivery: {
              exportTarget: "device",
              connectedStorage: null,
              mediaRetention: "externalized",
              outputStage: "draft",
              lastExportedAt: null,
              lastPublishedAt: null,
              history: [],
            }
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
                O beta pago/controlado gira hoje em torno de texto e vídeo com continuidade forte. Os demais formatos continuam acessíveis, mas fora do centro da promessa principal.
              </p>
            </div>
            <div className="hero-meta-row">
              <span className="premium-badge premium-badge-phase">Núcleo recomendado: texto e vídeo</span>
              <span className="premium-badge premium-badge-soon">Outros formatos seguem secundários no beta</span>
            </div>
          </div>

          <div className="hero-side-panel">
            <p className="section-kicker">Como começa</p>
            <div className="hero-side-list">
              <div className="hero-side-note">
                <strong>Escolha o formato certo</strong>
                <span>Texto e vídeo concentram a melhor continuidade atual entre creators hero, editor e saída.</span>
              </div>
              <div className="hero-side-note">
                <strong>Entre com estrutura mínima pronta</strong>
                <span>Todo projeto já nasce salvo em draft, com base mínima para editar, revisar e registrar exported depois.</span>
              </div>
              <div className="hero-side-note">
                <strong>Continue no mesmo workspace</strong>
                <span>Salve em draft, refine com IA e só então exporte ou publique com histórico de saída desde o início.</span>
              </div>
              <div className="hero-side-note">
                <strong>Handoff beta fora do núcleo</strong>
                <span>GitHub e Vercel continuam úteis quando fizer sentido, mas ficam como fundação secundária e manual nesta fase.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="hero-kpi-grid editor-new-kpi-grid">
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Escolha inicial</span>
            <strong className="hero-kpi-value">Formato mais próximo do fluxo</strong>
          </div>
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Continuidade</span>
            <strong className="hero-kpi-value">Projeto salvo desde o primeiro clique</strong>
          </div>
          <div className="premium-card-soft hero-kpi">
            <span className="hero-kpi-label">Pronto para editar</span>
            <strong className="hero-kpi-value">Entrada guiada para editar e exportar</strong>
          </div>
        </div>
      </section>

      {err ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível abrir o editor agora</p>
          <div className="state-ea-text">{err}</div>
        </div>
      ) : null}

      <section className="premium-card editor-new-selection">
        <div className="section-header-ea">
          <p className="section-kicker">Escolha inicial</p>
          <h2 style={{ margin: 0 }}>Comece pelo formato que melhor sustenta o beta hoje</h2>
          <p className="section-header-copy">
            Texto e vídeo concentram a melhor relação atual entre creators hero, editor, projetos e saída. Os demais formatos continuam acessíveis, mas com papel secundário.
          </p>
        </div>

        <div className="editor-new-kind-section">
          <div className="section-stack-tight">
            <p className="section-kicker">Núcleo recomendado</p>
            <p className="helper-text-ea">Use estas entradas quando quiser o caminho mais forte para gerar, refinar, salvar e exportar no beta pago/controlado.</p>
          </div>
          <div className="editor-kind-grid">
            {PRIMARY_KINDS.map((kind) => (
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
        </div>

        <div className="editor-new-kind-section editor-new-kind-section-secondary">
          <div className="section-stack-tight">
            <p className="section-kicker">Secundários e em evolução</p>
            <p className="helper-text-ea">Continuam disponíveis para exploração, mas ainda não devem carregar o centro da promessa comercial do beta pago/controlado.</p>
          </div>
          <div className="editor-kind-grid">
            {SECONDARY_KINDS.map((kind) => (
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
            <span>Use o painel lateral para acelerar ajustes e preparar a peça para entrega.</span>
          </div>
          <div className="premium-card-soft editor-new-flow-note">
            <strong>3. Salve, exporte ou publique</strong>
            <span>O padrão atual é salvar em draft, registrar exported com clareza e só então usar handoff beta ou publicação manual quando fizer sentido.</span>
          </div>
        </div>
        <a href="/dashboard" className="btn-link-ea btn-ghost btn-sm">Voltar ao dashboard</a>
      </section>
    </div>
  );
}
