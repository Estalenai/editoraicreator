"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { EditorShell, EditorTab } from "../../../components/editor/EditorShell";

type Project = { id: string; title: string; kind: string; data?: any };

type AiStep = { id: string; ts: string; title: string; details?: string };

type EditorDoc = {
  mode: { professor: boolean; transparent: boolean };
  doc: { text: string };
  timeline: { clips: Array<{ id: string; name: string; start: number; end: number }> };
  workflow: { nodes: any[]; edges: any[] };
  course: { sections: any[] };
  website: { blocks: any[] };
  aiSteps: AiStep[];
};

const PROJECT_KIND_LABEL: Record<string, string> = {
  video: "Projeto de Video",
  text: "Projeto de Texto",
  automation: "Projeto de Automacao",
  course: "Projeto de Curso",
  website: "Projeto de Site"
};

function extractProjectPayload(payload: any): Project {
  const resolved = (payload?.item || payload?.data?.item || payload?.data || payload || null) as Project | null;
  if (!resolved?.id) {
    throw new Error("Projeto não encontrado para o editor.");
  }
  return resolved;
}

function ensureEditor(project: Project): EditorDoc {
  const d = (project.data || {}) as any;
  const e = (d.editor || {}) as any;

  return {
    mode: {
      professor: !!e.mode?.professor,
      transparent: !!e.mode?.transparent
    },
    doc: {
      text: typeof e.doc?.text === "string" ? e.doc.text : ""
    },
    timeline: {
      clips: Array.isArray(e.timeline?.clips) ? e.timeline.clips : []
    },
    workflow: {
      nodes: Array.isArray(e.workflow?.nodes) ? e.workflow.nodes : [],
      edges: Array.isArray(e.workflow?.edges) ? e.workflow.edges : []
    },
    course: {
      sections: Array.isArray(e.course?.sections) ? e.course.sections : []
    },
    website: {
      blocks: Array.isArray(e.website?.blocks) ? e.website.blocks : []
    },
    aiSteps: Array.isArray(e.aiSteps) ? e.aiSteps : []
  };
}

function pushStep(list: AiStep[], title: string, details?: string): AiStep[] {
  return [
    { id: cryptoId(), ts: new Date().toISOString(), title, details },
    ...list
  ].slice(0, 200);
}

function cryptoId() {
  try {
    // @ts-ignore
    return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export default function EditorProjectPage() {
  const params = useParams();
  const id = String((params as any).id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<EditorTab>("text");

  const [professorMode, setProfessorMode] = useState(false);
  const [transparentMode, setTransparentMode] = useState(false);

  const [text, setText] = useState("");
  const [claim, setClaim] = useState("");
  const [factResult, setFactResult] = useState<any>(null);

  const [aiSteps, setAiSteps] = useState<AiStep[]>([]);

  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const p = await api.getProject(id);
        const proj = extractProjectPayload(p);
        setProject(proj);

        const ed = ensureEditor(proj);
        setProfessorMode(ed.mode.professor);
        setTransparentMode(ed.mode.transparent);
        setText(ed.doc.text);
        setAiSteps(ed.aiSteps);

        // Escolhe aba inicial baseada no kind
        if (proj.kind === "video") setTab("video");
        else if (proj.kind === "automation") setTab("automation");
        else if (proj.kind === "course") setTab("course");
        else if (proj.kind === "website") setTab("website");
        else setTab("text");
      } catch (e: any) {
        setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao carregar projeto"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const title = useMemo(() => project?.title || `Projeto ${id}`, [project, id]);
  const projectKindLabel = useMemo(
    () => PROJECT_KIND_LABEL[project?.kind || ""] || project?.kind || "Projeto",
    [project?.kind]
  );
  const factVerdict = useMemo(
    () => String(factResult?.verdict || factResult?.result?.verdict || "Sem veredito"),
    [factResult]
  );
  const factConfidence = useMemo(() => {
    const confidence = factResult?.confidence ?? factResult?.result?.confidence;
    if (confidence === null || confidence === undefined || confidence === "") return null;
    return String(confidence);
  }, [factResult]);

  async function save() {
    if (!project) return;
    setSaving(true);
    setErr(null);

    try {
      const current = ensureEditor(project);
      const next: EditorDoc = {
        ...current,
        mode: { professor: professorMode, transparent: transparentMode },
        doc: { text },
        aiSteps
      };

      const updated = await api.updateProject(project.id, {
        data: {
          ...(project.data || {}),
          editor: {
            version: 1,
            mode: next.mode,
            doc: next.doc,
            timeline: next.timeline,
            workflow: next.workflow,
            course: next.course,
            website: next.website,
            aiSteps: next.aiSteps
          }
        }
      });

      const proj = extractProjectPayload(updated);
      setProject(proj);
      setAiSteps(pushStep(aiSteps, "Projeto salvo", new Date().toLocaleString()));
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao salvar"));
    } finally {
      setSaving(false);
    }
  }

  async function runTextGenerate() {
    setErr(null);
    setFactResult(null);
    setAiSteps(pushStep(aiSteps, "EditexAI: gerar texto", "Chamando /api/ai/text-generate"));

    try {
      const res = await api.aiTextGenerate({ prompt: text.trim() || "Gere um texto curto." });
      const content = res?.text || res?.output || res?.content || JSON.stringify(res);
      setText(String(content));
      setAiSteps(pushStep(aiSteps, "EditexAI: texto gerado", "Texto atualizado no editor"));
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao gerar texto"));
      setAiSteps(pushStep(aiSteps, "Erro ao gerar texto", String(e?.error?.message || e)));
    }
  }

  async function runFactCheck() {
    setErr(null);
    setFactResult(null);
    setAiSteps(pushStep(aiSteps, "EditexAI: fact-check", "Chamando /api/ai/fact-check"));

    try {
      const res = await api.aiFactCheck({ claim });
      setFactResult(res);
      const verdict = res?.verdict || res?.result?.verdict || "(sem veredito)";
      setAiSteps(pushStep(aiSteps, `Fact-check: ${verdict}`, "Resultado disponível no painel"));
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha no fact-check"));
      setAiSteps(pushStep(aiSteps, "Erro no fact-check", String(e?.error?.message || e)));
    }
  }

  if (loading) {
    return (
      <div className="page-shell">
        <div className="premium-card" style={{ padding: 16, display: "grid", gap: 10 }}>
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "40%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "76%" }} />
          <div className="premium-skeleton premium-skeleton-card" style={{ height: 160 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      {err && (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Falha no editor</p>
          <div className="state-ea-text">{err}</div>
        </div>
      )}

      <EditorShell
        title={title}
        tab={tab}
        onTab={setTab}
        professorMode={professorMode}
        transparentMode={transparentMode}
        onToggleProfessor={() => setProfessorMode(v => !v)}
        onToggleTransparent={() => setTransparentMode(v => !v)}
        left={
          <div className="editor-panel-stack">
            <section className="editor-shell-inline-card editor-shell-context-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Projeto em foco</p>
                <h3>{title}</h3>
                <p className="editor-shell-note">
                  Base ativa do workspace editorial. Tudo o que for salvo aqui continua no mesmo projeto.
                </p>
              </div>

              <div className="editor-shell-badge-row">
                <span className="premium-badge premium-badge-phase">{projectKindLabel}</span>
                <span className="premium-badge premium-badge-soon">ID {id}</span>
              </div>

              <div className="editor-shell-facts">
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Status</span>
                  <strong>{saving ? "Salvando agora" : "Pronto para editar"}</strong>
                </div>
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Visibilidade</span>
                  <strong>{transparentMode ? "Passos abertos" : "Passos sob demanda"}</strong>
                </div>
                <div className="editor-shell-fact">
                  <span className="editor-shell-fact-label">Apoio IA</span>
                  <strong>{professorMode ? "Explicacao ativa" : "Explicacao opcional"}</strong>
                </div>
              </div>

              <div className="editor-shell-cta-group">
                <button onClick={save} disabled={saving} className="btn-ea btn-primary">
                  {saving ? "Salvando..." : "Salvar agora"}
                </button>
                <a href="/projects" className="btn-link-ea btn-ghost btn-sm">Projetos</a>
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Guia rapido</p>
                <h4>Como usar este editor</h4>
                <p className="editor-shell-note">
                  Mantenha a mesma cadencia em qualquer aba para evoluir o projeto sem perder contexto.
                </p>
              </div>
              <ol className="editor-shell-checklist editor-shell-checklist-ordered">
                <li>Edite o bloco principal da aba ativa.</li>
                <li>Use a EditexAI no painel lateral quando precisar acelerar uma etapa.</li>
                <li>Salve ao concluir um bloco importante para manter o projeto sincronizado.</li>
              </ol>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Atalhos do editor</p>
                <h4>Onde cada area ajuda</h4>
              </div>
              <ul className="editor-shell-checklist">
                <li>Texto: escreva, refine e consolide a base principal do projeto.</li>
                <li>Biblioteca IA: valide afirmacoes e registre o resultado no contexto do projeto.</li>
                <li>Modo Transparente: acompanhe o passo a passo quando houver execucao IA.</li>
              </ul>
            </section>
          </div>
        }
        center={
          <div className="editor-panel-stack">
            {tab === "text" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Texto base do projeto</h3>
                  <p className="editor-shell-note">
                    Escreva, refine com IA e mantenha a peca central pronta para continuidade no workspace.
                  </p>
                </div>
                <div className="editor-shell-badge-row">
                  <span className="premium-badge premium-badge-phase">Documento vivo</span>
                  <span className="premium-badge premium-badge-soon">Salve ao concluir um bloco</span>
                </div>
                <label className="field-label-ea">
                  <span>Conteudo em edicao</span>
                  <textarea
                    className="field-ea editor-shell-textarea"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={14}
                    placeholder="Escreva ou gere com a EditexAI..."
                  />
                </label>
              </section>
            )}

            {tab === "video" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Editor de Video</h3>
                  <p className="editor-shell-note">
                    Base do fluxo pronta para continuidade. Timeline e importação/exportação entram na próxima etapa.
                  </p>
                </div>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Timeline preparada</strong>
                  <p className="editor-shell-note">Clipes e estrutura do fluxo já ficam organizados para a próxima etapa de edição.</p>
                </div>
              </section>
            )}

            {tab === "automation" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Workflows IA</h3>
                  <p className="editor-shell-note">
                    Organize automações, mantenha o projeto salvo e avance por etapas sem perder a estrutura.
                  </p>
                </div>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Builder preparado</strong>
                  <p className="editor-shell-note">
                    Nós e conexões já ficam persistidos no projeto. A edição visual completa entra na próxima etapa.
                  </p>
                </div>
              </section>
            )}

            {tab === "course" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Creator Courses</h3>
                  <p className="editor-shell-note">
                    Estruture seções e aulas com uma base pronta para evolução editorial por módulos.
                  </p>
                </div>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Seções e aulas</strong>
                  <p className="editor-shell-note">Estrutura salva no projeto para continuidade guiada no editor.</p>
                </div>
              </section>
            )}

            {tab === "website" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Edicao principal</p>
                  <h3>Creator Sites</h3>
                  <p className="editor-shell-note">
                    Mantenha blocos e estrutura do site prontos para crescer com o mesmo contexto do projeto.
                  </p>
                </div>
                <div className="editor-shell-placeholder editor-shell-placeholder-muted">
                  <strong>Blocos</strong>
                  <p className="editor-shell-note">Estrutura de blocos salva para evolução incremental.</p>
                </div>
              </section>
            )}

            {tab === "library" && (
              <section className="editor-shell-section editor-shell-focus-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Biblioteca IA</p>
                  <h3>Validacao e apoio editorial</h3>
                  <p className="editor-shell-note">
                    Use fact-check e registre o resultado no mesmo contexto do projeto.
                  </p>
                </div>

                <div className="editor-shell-inline-card">
                  <div className="editor-shell-panel-head">
                    <h4>Fact-check (Anti Fake News)</h4>
                    <p className="editor-shell-note">
                      Cole uma afirmacao, valide o resultado e preserve o contexto dentro do projeto.
                    </p>
                  </div>
                  <label className="field-label-ea">
                    <span>Afirmacao para verificar</span>
                    <textarea
                      className="field-ea editor-shell-textarea editor-shell-textarea-sm"
                      value={claim}
                      onChange={e => setClaim(e.target.value)}
                      rows={4}
                      placeholder="Cole aqui uma afirmacao para verificar..."
                    />
                  </label>
                  <div className="editor-shell-cta-group">
                    <button className="btn-ea btn-primary" onClick={runFactCheck}>
                      Verificar
                    </button>
                    <button className="btn-ea btn-ghost" onClick={() => { setClaim(""); setFactResult(null); }}>
                      Limpar
                    </button>
                  </div>

                  {factResult && (
                    <div className="editor-shell-result-card editor-shell-result-surface">
                      <div className="editor-shell-result-summary">
                        <div className="editor-shell-fact">
                          <span className="editor-shell-fact-label">Veredito</span>
                          <strong>{factVerdict}</strong>
                        </div>
                        <div className="editor-shell-fact">
                          <span className="editor-shell-fact-label">Confiança</span>
                          <strong>{factConfidence || "Nao informada"}</strong>
                        </div>
                        <p className="editor-shell-note editor-shell-result-note">
                          O resumo acima ajuda na decisão rápida. O retorno completo permanece disponível abaixo.
                        </p>
                      </div>
                      <pre className="editor-shell-pre editor-shell-pre-compact">{JSON.stringify(factResult, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        }
        right={
          <div className="editor-panel-stack editor-shell-support-stack">
            <section className="editor-shell-inline-card editor-shell-support-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Assistente lateral</p>
                <h3>EditexAI</h3>
                <p className="editor-shell-note">
                  Acione a IA sem sair do fluxo principal. O painel lateral serve como apoio, nao como distracao.
                </p>
              </div>
              <div className="editor-shell-cta-group">
                <button className="btn-ea btn-primary" onClick={runTextGenerate}>
                  Gerar texto com IA
                </button>
                <button className="btn-ea btn-ghost" onClick={() => setTab("library")}>
                  Abrir biblioteca
                </button>
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Visibilidade do processo</p>
                <h4>Modos de trabalho</h4>
                <p className="editor-shell-note">
                  Controle como o processo da IA aparece durante o uso do editor.
                </p>
              </div>
              <div className="editor-shell-status-grid editor-shell-status-grid-compact">
                <div className="editor-shell-status-item">
                  <span>Professor</span>
                  <strong>{professorMode ? "Explicacao ativa" : "Explicacao opcional"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Transparencia</span>
                  <strong>{transparentMode ? "Passos visiveis" : "Passos sob demanda"}</strong>
                </div>
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Log do projeto</p>
                <h4>Passos registrados</h4>
                <p className="editor-shell-note">
                  Historico rapido do que ja foi salvo ou executado no contexto deste editor.
                </p>
              </div>
              <div className="editor-shell-log-list">
                {aiSteps.length ? aiSteps.map(s => (
                  <div key={s.id} className="editor-shell-step">
                    <div className="editor-shell-step-head">
                      <div className="editor-shell-step-title">{s.title}</div>
                      <div className="editor-shell-step-ts">{s.ts}</div>
                    </div>
                    {s.details && <div className="editor-shell-step-copy">{s.details}</div>}
                  </div>
                )) : (
                  <div className="editor-shell-empty-note">
                    <strong>Sem passos registrados</strong>
                    <span>Ative modos de apoio ou salve um bloco para registrar novas acoes no projeto.</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        }
        footer={
          <div className="editor-shell-footer-wrap">
            <div className="editor-shell-footer-copy">
              <p className="section-kicker">Projeto atual</p>
              <strong className="editor-shell-footer-title">{title}</strong>
              <p className="editor-shell-note">
                Continue salvando blocos-chave para manter o contexto pronto no workspace.
              </p>
            </div>
            <div className="editor-shell-cta-group">
              <button className="btn-ea btn-ghost btn-sm" onClick={() => setAiSteps([])}>
                Limpar log
              </button>
            </div>
          </div>
        }
      />
    </div>
  );
}


