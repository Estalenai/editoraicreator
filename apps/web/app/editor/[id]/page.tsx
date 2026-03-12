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
        const proj: Project = (p?.data || p) as any;
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
        setErr(typeof e === "string" ? e : (e?.error?.message || "Falha ao carregar projeto"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const title = useMemo(() => project?.title || `Projeto ${id}`, [project, id]);

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

      const proj: Project = (updated?.data || updated) as any;
      setProject(proj);
      setAiSteps(pushStep(aiSteps, "Projeto salvo", new Date().toLocaleString()));
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.error?.message || "Falha ao salvar"));
    } finally {
      setSaving(false);
    }
  }

  async function runTextGenerate() {
    setErr(null);
    setFactResult(null);
    setAiSteps(pushStep(aiSteps, "Autocrie: gerar texto", "Chamando /api/ai/text-generate"));

    try {
      const res = await api.aiTextGenerate({ prompt: text.trim() || "Gere um texto curto." });
      const content = res?.text || res?.output || res?.content || JSON.stringify(res);
      setText(String(content));
      setAiSteps(pushStep(aiSteps, "Autocrie: texto gerado", "Texto atualizado no editor"));
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.error?.message || "Falha ao gerar texto"));
      setAiSteps(pushStep(aiSteps, "Erro ao gerar texto", String(e?.error?.message || e)));
    }
  }

  async function runFactCheck() {
    setErr(null);
    setFactResult(null);
    setAiSteps(pushStep(aiSteps, "Autocrie: fact-check", "Chamando /api/ai/fact-check"));

    try {
      const res = await api.aiFactCheck({ claim });
      setFactResult(res);
      const verdict = res?.verdict || res?.result?.verdict || "(sem veredito)";
      setAiSteps(pushStep(aiSteps, `Fact-check: ${verdict}`, "Resultado disponível no painel"));
    } catch (e: any) {
      setErr(typeof e === "string" ? e : (e?.error?.message || "Falha no fact-check"));
      setAiSteps(pushStep(aiSteps, "Erro no fact-check", String(e?.error?.message || e)));
    }
  }

  if (loading) return <p>Carregando editor…</p>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {err && (
        <div style={card()}>
          <p style={{ margin: 0, color: "#34F5FF" }}>{err}</p>
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
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <h3 style={{ marginTop: 0 }}>Projeto</h3>
              <p style={{ margin: 0, opacity: 0.85, fontSize: 12 }}>id: {id}</p>
              <p style={{ margin: 0, opacity: 0.85, fontSize: 12 }}>kind: {project?.kind}</p>
            </div>

            <button onClick={save} disabled={saving} style={btn()}>
              {saving ? "Salvando…" : "Salvar"}
            </button>

            <div style={divider()} />

            <h4 style={{ margin: 0 }}>Atalhos (MVP)</h4>
            <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.85, fontSize: 12 }}>
              <li>Texto: use Autocrie para gerar/editar conteúdo</li>
              <li>Fact-check: use a aba Biblioteca IA → Fact-check</li>
              <li>Modo Transparente: exibe log de passos</li>
            </ul>
          </div>
        }
        center={
          <div style={{ display: "grid", gap: 12 }}>
            {tab === "text" && (
              <div>
                <h3 style={{ marginTop: 0 }}>Editor de Texto (MVP)</h3>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={14}
                  style={textarea()}
                  placeholder="Escreva ou gere com a Autocrie…"
                />
              </div>
            )}

            {tab === "video" && (
              <div>
                <h3 style={{ marginTop: 0 }}>Editor de Vídeo (Estrutura)</h3>
                <p style={{ marginTop: 0, opacity: 0.85 }}>
                  Nesta etapa, a UI é um esqueleto. A timeline e importação/exportação entram no PASSO 16+ (submódulos).
                </p>
                <div style={placeholderBox()}>
                  <strong>Timeline</strong>
                  <p style={{ margin: 0, opacity: 0.85, fontSize: 12 }}>Clipes: (a definir)</p>
                </div>
              </div>
            )}

            {tab === "automation" && (
              <div>
                <h3 style={{ marginTop: 0 }}>Workflows IA (Estrutura)</h3>
                <div style={placeholderBox()}>
                  <strong>Builder (drag-and-drop)</strong>
                  <p style={{ margin: 0, opacity: 0.85, fontSize: 12 }}>
                    MVP: listagem de nós/edges no JSON do projeto. UI completa no próximo refinamento.
                  </p>
                </div>
              </div>
            )}

            {tab === "course" && (
              <div>
                <h3 style={{ marginTop: 0 }}>Criador de Cursos (Estrutura)</h3>
                <div style={placeholderBox()}>
                  <strong>Seções e aulas</strong>
                  <p style={{ margin: 0, opacity: 0.85, fontSize: 12 }}>MVP: estrutura salva no projeto</p>
                </div>
              </div>
            )}

            {tab === "website" && (
              <div>
                <h3 style={{ marginTop: 0 }}>Criador de Sites (Estrutura)</h3>
                <div style={placeholderBox()}>
                  <strong>Blocos</strong>
                  <p style={{ margin: 0, opacity: 0.85, fontSize: 12 }}>MVP: estrutura salva no projeto</p>
                </div>
              </div>
            )}

            {tab === "library" && (
              <div style={{ display: "grid", gap: 12 }}>
                <h3 style={{ marginTop: 0 }}>Biblioteca IA (MVP)</h3>

                <div style={cardInline()}>
                  <h4 style={{ marginTop: 0 }}>Fact-check (Anti Fake News)</h4>
                  <textarea
                    value={claim}
                    onChange={e => setClaim(e.target.value)}
                    rows={4}
                    style={textarea()}
                    placeholder="Cole aqui uma afirmação para verificar…"
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button style={btn()} onClick={runFactCheck}>
                      Verificar
                    </button>
                    <button style={btnAlt()} onClick={() => { setClaim(""); setFactResult(null); }}>
                      Limpar
                    </button>
                  </div>

                  {factResult && (
                    <div style={{ marginTop: 10 }}>
                      <pre style={pre()}>{JSON.stringify(factResult, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        }
        right={
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <h3 style={{ marginTop: 0 }}>Autocrie.ai</h3>
              <p style={{ marginTop: 0, opacity: 0.85, fontSize: 12 }}>
                Painel rápido para ações IA. Nesta etapa, priorizamos texto + fact-check.
              </p>
              <button style={btn()} onClick={runTextGenerate}>
                Gerar texto com IA
              </button>
            </div>

            <div style={divider()} />

            <div>
              <h4 style={{ marginTop: 0 }}>Modo Professor</h4>
              <p style={{ marginTop: 0, opacity: 0.85, fontSize: 12 }}>
                Explica o que a IA fez (passos). Ative o Modo Transparente para ver ao vivo.
              </p>
              <pre style={pre()}>{JSON.stringify({ professorMode, transparentMode }, null, 2)}</pre>
            </div>

            {(professorMode || transparentMode) && (
              <div>
                <h4 style={{ marginTop: 0 }}>Log de passos</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {aiSteps.length ? aiSteps.map(s => (
                    <div key={s.id} style={stepBox()}>
                      <div style={{ fontWeight: 700 }}>{s.title}</div>
                      <div style={{ opacity: 0.8, fontSize: 11 }}>{s.ts}</div>
                      {s.details && <div style={{ opacity: 0.9, fontSize: 12, marginTop: 6 }}>{s.details}</div>}
                    </div>
                  )) : <p style={{ margin: 0, opacity: 0.8, fontSize: 12 }}>Sem passos ainda.</p>}
                </div>
              </div>
            )}
          </div>
        }
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", width: "100%" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ opacity: 0.85, fontSize: 12 }}>Projeto:</span>
              <strong style={{ fontSize: 12 }}>{title}</strong>
            </div>
            <button style={btnAlt()} onClick={() => setAiSteps([])}>
              Limpar log
            </button>
          </div>
        }
      />
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

function cardInline(): React.CSSProperties {
  return {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)"
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

function btnAlt(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    cursor: "pointer"
  };
}

function textarea(): React.CSSProperties {
  return {
    width: "100%",
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)",
    color: "#fff",
    outline: "none",
    resize: "vertical"
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

function divider(): React.CSSProperties {
  return {
    height: 1,
    background: "rgba(255,255,255,0.12)",
    borderRadius: 999
  };
}

function placeholderBox(): React.CSSProperties {
  return {
    padding: 14,
    borderRadius: 16,
    border: "1px dashed rgba(255,255,255,0.20)",
    background: "rgba(0,0,0,0.18)"
  };
}

function stepBox(): React.CSSProperties {
  return {
    padding: 10,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.15)"
  };
}

