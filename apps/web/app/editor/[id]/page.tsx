"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "../../../lib/api";
import { EditorShell, EditorTab } from "../../../components/editor/EditorShell";
import { GitHubWorkspaceCard } from "../../../components/projects/GitHubWorkspaceCard";
import { VercelPublishCard } from "../../../components/projects/VercelPublishCard";
import { toUserFacingError, toUserFacingGenerationSuccess } from "../../../lib/uiFeedback";

type Project = { id: string; title: string; kind: string; data?: any };

type AiStep = { id: string; ts: string; title: string; details?: string };

type CreatorSnapshot = {
  source: string;
  summary: string;
  details: string;
  prefillText?: string;
};

type EditorDoc = {
  mode: { professor: boolean; transparent: boolean };
  doc: { text: string };
  timeline: { clips: Array<{ id: string; name: string; start: number; end: number }> };
  workflow: { nodes: any[]; edges: any[] };
  course: { sections: any[] };
  website: { blocks: any[] };
  aiSteps: AiStep[];
  delivery: { exportTarget: "device" | "connected_storage"; connectedStorage: string | null; mediaRetention: "externalized" };
};

const PROJECT_KIND_LABEL: Record<string, string> = {
  video: "Projeto de Vídeo",
  text: "Projeto de Texto",
  automation: "Projeto de Automação",
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
    aiSteps: Array.isArray(e.aiSteps) ? e.aiSteps : [],
    delivery: {
      exportTarget: e.delivery?.exportTarget === "connected_storage" ? "connected_storage" : "device",
      connectedStorage: typeof e.delivery?.connectedStorage === "string" ? e.delivery.connectedStorage : null,
      mediaRetention: "externalized",
    }
  };
}

function parseCreatorProjectData(project: Project): any | null {
  const rawData = project.data;
  if (!rawData || typeof rawData !== "object") return null;

  if (typeof rawData.content === "string") {
    try {
      const parsed = JSON.parse(rawData.content);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      return {
        type: "legacy_content",
        raw_text: String(rawData.content || "").trim(),
      };
    }
  }

  if (
    rawData.type ||
    rawData.generated ||
    rawData.result ||
    rawData.projectName ||
    rawData.clipIdea
  ) {
    return rawData;
  }

  return null;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function buildCreatorSnapshot(project: Project): CreatorSnapshot | null {
  const payload = parseCreatorProjectData(project);
  if (!payload || typeof payload !== "object") return null;

  if (payload.type === "creator_post") {
    const result = payload.result || {};
    const caption = String(result.caption || "").trim();
    const cta = String(result.cta || "").trim();
    const hashtags = normalizeStringList(result.hashtags).join(" ");
    const variations = normalizeStringList(result.variations);
    return {
      source: "Creator Post",
      summary: "Post salvo a partir de Creators com contexto pronto para continuidade.",
      details: [
        caption ? `Legenda\n${caption}` : "",
        hashtags ? `Hashtags\n${hashtags}` : "",
        cta ? `CTA\n${cta}` : "",
        variations.length ? `Variacoes\n- ${variations.join("\n- ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [caption, hashtags, cta ? `CTA: ${cta}` : ""].filter(Boolean).join("\n\n"),
    };
  }

  if (payload.type === "creator_music") {
    const result = payload.result || {};
    const lyrics = String(result.lyrics || "").trim();
    const audioUrl = String(result.audio_url || "").trim();
    return {
      source: "Creator Music",
      summary: "Trilha salva a partir de Creators com metadados e referencia de audio.",
      details: [
        result.title ? `Titulo\n${String(result.title).trim()}` : "",
        audioUrl ? `Audio\n${audioUrl}` : "",
        result.provider ? `Provedor\n${String(result.provider).trim()}` : "",
        lyrics ? `Letras / direcao\n${lyrics}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [
        result.title ? `Titulo: ${String(result.title).trim()}` : "",
        audioUrl ? `Audio: ${audioUrl}` : "",
        lyrics,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  if (payload.type === "creator_scripts") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const finalScript = String(structured.final_script || generated.raw_text || "").trim();
    return {
      source: "Creator Scripts",
      summary: "Roteiro salvo a partir de Creators para continuar refinando no editor.",
      details: [
        structured.title ? `Titulo\n${String(structured.title).trim()}` : "",
        finalScript ? `Roteiro final\n${finalScript}` : "",
        structured.cta ? `CTA\n${String(structured.cta).trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: finalScript,
    };
  }

  if (payload.type === "creator_ads") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const fullVersion = String(structured.full_version || generated.raw_text || "").trim();
    return {
      source: "Creator Ads",
      summary: "Peca de anuncio salva a partir de Creators com copy pronta para refinamento.",
      details: [
        structured.headline ? `Headline\n${String(structured.headline).trim()}` : "",
        fullVersion ? `Versao completa\n${fullVersion}` : "",
        structured.cta ? `CTA\n${String(structured.cta).trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: fullVersion,
    };
  }

  if (payload.type === "creator_clips") {
    const generated = payload.generated || {};
    const result = generated.result || {};
    const clipUrl = String(generated.clip_url || result?.output?.video_url || "").trim();
    return {
      source: "Creator Clips",
      summary: "Job de vídeo salvo a partir de Creators com status e referência do clipe.",
      details: [
        payload.clipIdea ? `Ideia do clipe\n${String(payload.clipIdea).trim()}` : "",
        result.jobId ? `Job ID\n${String(result.jobId).trim()}` : "",
        result.status ? `Status\n${String(result.status).trim()}` : "",
        clipUrl ? `URL do vídeo\n${clipUrl}` : "",
        generated.prompt_used ? `Prompt usado\n${String(generated.prompt_used).trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [
        payload.clipIdea ? `Ideia: ${String(payload.clipIdea).trim()}` : "",
        clipUrl ? `Video: ${clipUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  if (payload.type === "creator_no_code") {
    const generated = payload.generated || {};
    const structured = generated.structured || {};
    const overview = String(structured.product_overview || generated.raw_text || "").trim();
    const modules = normalizeStringList(structured.core_modules);
    return {
      source: "Creator No Code",
      summary: "Blueprint salvo a partir de Creators com estrutura inicial do produto.",
      details: [
        payload.projectName ? `Projeto\n${String(payload.projectName).trim()}` : "",
        overview ? `Visao do produto\n${overview}` : "",
        modules.length ? `Modulos principais\n- ${modules.join("\n- ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      prefillText: [payload.projectName ? `Projeto: ${String(payload.projectName).trim()}` : "", overview]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  if (payload.type === "legacy_content") {
    const rawText = String(payload.raw_text || "").trim();
    if (!rawText) return null;
    return {
      source: "Contexto importado",
      summary: "Projeto salvo antes da estrutura atual do editor.",
      details: rawText,
      prefillText: rawText,
    };
  }

  return null;
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
  const [creatorSnapshot, setCreatorSnapshot] = useState<CreatorSnapshot | null>(null);
  const [tab, setTab] = useState<EditorTab>("text");

  const [professorMode, setProfessorMode] = useState(false);
  const [transparentMode, setTransparentMode] = useState(false);

  const [text, setText] = useState("");
  const [claim, setClaim] = useState("");
  const [factResult, setFactResult] = useState<any>(null);

  const [aiSteps, setAiSteps] = useState<AiStep[]>([]);
  const [aiBusy, setAiBusy] = useState<"text" | "fact" | null>(null);
  const [aiFeedback, setAiFeedback] = useState<{ tone: "success" | "warning"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const p = await api.getProject(id);
        const proj = extractProjectPayload(p);
        setProject(proj);
        const snapshot = buildCreatorSnapshot(proj);
        setCreatorSnapshot(snapshot);

        const ed = ensureEditor(proj);
        setProfessorMode(ed.mode.professor);
        setTransparentMode(ed.mode.transparent);
        setText(ed.doc.text || snapshot?.prefillText || "");
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
        aiSteps,
        delivery: current.delivery
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
            aiSteps: next.aiSteps,
            delivery: next.delivery
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
    setAiBusy("text");
    setAiFeedback(null);
    setErr(null);
    setFactResult(null);
    setAiSteps(pushStep(aiSteps, "EditexAI: gerar texto", "Chamando /api/ai/text-generate"));

    try {
      const res = await api.aiTextGenerate({ prompt: text.trim() || "Gere um texto curto." });
      const content = res?.text || res?.output || res?.content || JSON.stringify(res);
      const provider = typeof res?.provider === "string" ? res.provider : null;
      const model = typeof res?.model === "string" ? res.model : null;
      setText(String(content));
      setAiFeedback({
        tone: provider === "mock" ? "warning" : "success",
        text: toUserFacingGenerationSuccess({
          provider,
          model,
          defaultMessage: "Texto gerado e aplicado ao editor.",
          mockMessage: "Texto entregue em modo beta simulado. Revise antes de publicar.",
        }),
      });
      setAiSteps(pushStep(aiSteps, "EditexAI: texto gerado", "Texto atualizado no editor"));
    } catch (e: any) {
      const message = toUserFacingError(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha ao gerar texto"), "Falha ao gerar texto.");
      setErr(message);
      setAiSteps(pushStep(aiSteps, "Erro ao gerar texto", String(e?.error?.message || e)));
    } finally {
      setAiBusy((current) => (current === "text" ? null : current));
    }
  }

  async function runFactCheck() {
    setAiBusy("fact");
    setAiFeedback(null);
    setErr(null);
    setFactResult(null);
    setAiSteps(pushStep(aiSteps, "EditexAI: verificação editorial", "Chamando /api/ai/fact-check"));

    try {
      const res = await api.aiFactCheck({ claim });
      const provider = typeof res?.provider === "string" ? res.provider : null;
      const model = typeof res?.model === "string" ? res.model : null;
      setFactResult(res);
      setAiFeedback({
        tone: provider === "mock" ? "warning" : "success",
        text: toUserFacingGenerationSuccess({
          provider,
          model,
          defaultMessage: "Verificação editorial concluída. Revise o veredito antes de seguir.",
          mockMessage: "Verificação editorial entregue em modo beta simulado. Revise antes de tratar o retorno como definitivo.",
        }),
      });
      const verdict = res?.verdict || res?.result?.verdict || "(sem veredito)";
      setAiSteps(pushStep(aiSteps, `Verificação editorial: ${verdict}`, "Resultado disponível no painel"));
    } catch (e: any) {
      const message = toUserFacingError(typeof e === "string" ? e : (e?.message || e?.error?.message || "Falha na verificação editorial"), "Falha na verificação editorial.");
      setErr(message);
      setAiSteps(pushStep(aiSteps, "Erro na verificação editorial", String(e?.error?.message || e)));
    } finally {
      setAiBusy((current) => (current === "fact" ? null : current));
    }
  }

  if (loading) {
    return (
      <div className="page-shell editor-project-page">
        <div className="premium-card editor-loading-shell">
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "40%" }} />
          <div className="premium-skeleton premium-skeleton-line" style={{ width: "76%" }} />
          <div className="premium-skeleton premium-skeleton-card" style={{ height: 160 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell editor-project-page">
      {err && (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível carregar o editor</p>
          <div className="state-ea-text">{err}</div>
        </div>
      )}

      {aiBusy ? (
        <div className="state-ea">
          <p className="state-ea-title">{aiBusy === "text" ? "Gerando texto com IA" : "Executando verificação editorial"}</p>
          <div className="state-ea-text">A IA está processando sua solicitação. Aguarde alguns instantes antes de tentar outra ação.</div>
        </div>
      ) : null}

      {aiFeedback ? (
        <div className={`state-ea ${aiFeedback.tone === "warning" ? "state-ea-warning" : "state-ea-success"}`}>
          <p className="state-ea-title">{aiFeedback.tone === "warning" ? "Resposta da IA em modo beta" : "Atualização da IA concluída"}</p>
          <div className="state-ea-text">{aiFeedback.text}</div>
        </div>
      ) : null}

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
                  <strong>{professorMode ? "Explicação ativa" : "Explicação opcional"}</strong>
                </div>
              </div>

              <div className="editor-shell-cta-group">
                <button onClick={save} disabled={saving} className="btn-ea btn-primary">
                  {saving ? "Salvando..." : "Salvar projeto"}
                </button>
                <a href="/projects" className="btn-link-ea btn-ghost btn-sm">Projetos</a>
              </div>
            </section>

            {creatorSnapshot ? (
              <section className="editor-shell-inline-card">
                <div className="editor-shell-panel-head">
                  <p className="section-kicker">Contexto importado</p>
                  <h4>{creatorSnapshot.source}</h4>
                  <p className="editor-shell-note">{creatorSnapshot.summary}</p>
                </div>
                <pre className="editor-shell-pre editor-shell-pre-compact">{creatorSnapshot.details}</pre>
              </section>
            ) : null}

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Guia rápido</p>
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
                <li>Modo Transparente: acompanhe o passo a passo quando houver execução de IA.</li>
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
                  <span>Conteúdo em edição</span>
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
                  <h3>Editor de Vídeo</h3>
                  <p className="editor-shell-note">
                    Base do fluxo pronta para continuidade. Timeline completa entra na próxima etapa.
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
                  <h3>Validação e apoio editorial</h3>
                  <p className="editor-shell-note">
                    Use a verificação editorial e registre o resultado no mesmo contexto do projeto.
                  </p>
                </div>

                <div className="editor-shell-inline-card">
                  <div className="editor-shell-panel-head">
                    <h4>Verificação editorial (anti fake news)</h4>
                    <p className="editor-shell-note">
                      Cole uma afirmação, valide o resultado e mantenha o contexto no projeto.
                    </p>
                  </div>
                  <label className="field-label-ea">
                    <span>Afirmação para verificar</span>
                    <textarea
                      className="field-ea editor-shell-textarea editor-shell-textarea-sm"
                      value={claim}
                      onChange={e => setClaim(e.target.value)}
                      rows={4}
                      placeholder="Cole aqui uma afirmação para verificar..."
                    />
                  </label>
                  <div className="editor-shell-cta-group">
                    <button className="btn-ea btn-primary" onClick={runFactCheck} disabled={aiBusy !== null || !claim.trim()}>
                      {aiBusy === "fact" ? "Verificando..." : "Verificar"}
                    </button>
                    <button className="btn-ea btn-ghost" onClick={() => { setClaim(""); setFactResult(null); }} disabled={aiBusy !== null}>
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
                          <strong>{factConfidence || "Não informada"}</strong>
                        </div>
                        <p className="editor-shell-note editor-shell-result-note">
                          O resumo acima ajuda na decisão rápida. O retorno completo permanece logo abaixo.
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
                  Acione a IA sem sair do fluxo principal. O painel lateral serve como apoio, não como distração.
                </p>
              </div>
              <div className="editor-shell-cta-group">
                <button className="btn-ea btn-primary" onClick={runTextGenerate} disabled={aiBusy !== null}>
                  {aiBusy === "text" ? "Gerando texto..." : "Gerar texto com IA"}
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
                  <strong>{professorMode ? "Explicação ativa" : "Explicação opcional"}</strong>
                </div>
                <div className="editor-shell-status-item">
                  <span>Transparência</span>
                  <strong>{transparentMode ? "Passos visíveis" : "Passos sob demanda"}</strong>
                </div>
              </div>
            </section>

            <section className="editor-shell-inline-card">
              <div className="editor-shell-panel-head">
                <p className="section-kicker">Log do projeto</p>
                <h4>Passos registrados</h4>
                <p className="editor-shell-note">
                  Histórico rápido do que já foi salvo ou executado no contexto deste editor.
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
                    <span>Salve um bloco ou execute uma ação IA para registrar novos passos aqui.</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        }
        footer={
          <div className="editor-shell-footer-stack">
            <div className="editor-shell-footer-wrap">
              <div className="editor-shell-footer-copy">
                <p className="section-kicker">Projeto atual</p>
                <strong className="editor-shell-footer-title">{title}</strong>
                <p className="editor-shell-note">
                  Continue salvando blocos-chave. Saída padrão: exportação no dispositivo; GitHub e Vercel já preparam o handoff beta de continuidade e publicação do projeto para app ou site.
                </p>
              </div>
              <div className="editor-shell-cta-group">
                <button className="btn-ea btn-ghost btn-sm" onClick={() => setAiSteps([])}>
                  Limpar log
                </button>
              </div>
            </div>
            <GitHubWorkspaceCard
              variant="compact"
              project={project ? { id: project.id, title, kind: project.kind, data: project.data } : null}
            />
            <VercelPublishCard
              variant="compact"
              project={project ? { id: project.id, title, kind: project.kind } : null}
            />
          </div>
        }
      />
    </div>
  );
}


