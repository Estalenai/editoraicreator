"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { toUserFacingError } from "../../lib/uiFeedback";
import {
  clearGitHubWorkspace,
  downloadGitHubProjectBundle,
  formatGitHubRepoLabel,
  listGitHubProjectVersions,
  normalizeRootPath,
  readGitHubWorkspace,
  resolveGitHubConnection,
  saveGitHubProjectVersion,
  saveGitHubWorkspace,
  type GitHubProjectRef,
  type GitHubWorkspace,
  type GitHubWorkspaceTarget,
} from "../../lib/githubWorkspace";

type Props = {
  variant?: "full" | "compact";
  project?: GitHubProjectRef | null;
};

type WorkspaceDraft = {
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  target: GitHubWorkspaceTarget;
};

const DEFAULT_DRAFT: WorkspaceDraft = {
  owner: "",
  repo: "",
  branch: "main",
  rootPath: "/",
  target: "site",
};

function accountKeyFromUser(user: any): string | null {
  const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
  if (email) return email;
  const id = typeof user?.id === "string" ? user.id.trim() : "";
  return id || null;
}

function formatDateLabel(value: string | null): string {
  if (!value) return "Nenhuma versão salva ainda";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}

function draftFromWorkspace(workspace: GitHubWorkspace | null): WorkspaceDraft {
  if (!workspace) return DEFAULT_DRAFT;
  return {
    owner: workspace.owner,
    repo: workspace.repo,
    branch: workspace.branch,
    rootPath: workspace.rootPath,
    target: workspace.target,
  };
}

function targetLabel(target: GitHubWorkspaceTarget): string {
  return target === "app" ? "App" : "Site";
}

export function GitHubWorkspaceCard({ variant = "full", project = null }: Props) {
  const projectId = project?.id || null;
  const [ready, setReady] = useState(false);
  const [accountKey, setAccountKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [identityLabel, setIdentityLabel] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<GitHubWorkspace | null>(null);
  const [draft, setDraft] = useState<WorkspaceDraft>(DEFAULT_DRAFT);
  const [versionCount, setVersionCount] = useState(0);
  const [projectVersionCount, setProjectVersionCount] = useState(0);
  const [lastVersionSavedAt, setLastVersionSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"connect" | "save" | "clear" | "version" | "export" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadState() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      const user = data.user;
      const nextAccountKey = accountKeyFromUser(user);
      const connection = resolveGitHubConnection(user);
      const storedWorkspace = nextAccountKey ? readGitHubWorkspace(nextAccountKey) : null;
      const versions = nextAccountKey ? listGitHubProjectVersions(nextAccountKey) : [];

      setAccountKey(nextAccountKey);
      setConnected(connection.connected);
      setIdentityLabel(connection.label);
      setWorkspace(storedWorkspace);
      setDraft(draftFromWorkspace(storedWorkspace));
      setVersionCount(versions.length);
      setProjectVersionCount(projectId ? versions.filter((item) => item.projectId === projectId).length : versions.length);
      setLastVersionSavedAt(versions[0]?.savedAt || null);
      setReady(true);

      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("github") === "connected" && connection.connected) {
          setSuccess("Conta GitHub conectada. Agora defina owner, repositório e branch para preparar o fluxo do app ou site.");
          params.delete("github");
          const nextQuery = params.toString();
          const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
          window.history.replaceState({}, "", nextUrl);
        }
      }
    }

    loadState();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadState();
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [projectId]);

  const repoLabel = useMemo(() => formatGitHubRepoLabel(workspace), [workspace]);
  const versionSummaryLabel = useMemo(() => {
    if (project) {
      return projectVersionCount > 0
        ? `${projectVersionCount} versão(ões) locais para este projeto`
        : "Nenhuma versão local salva para este projeto";
    }
    return versionCount > 0 ? `${versionCount} versão(ões) locais prontas para continuidade` : "Nenhuma versão local salva ainda";
  }, [project, projectVersionCount, versionCount]);

  function updateDraft(field: keyof WorkspaceDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleConnectGitHub() {
    setError(null);
    setSuccess(null);
    setBusyAction("connect");

    try {
      const authClient = supabase.auth as any;
      if (typeof window === "undefined") return;
      if (typeof authClient.linkIdentity !== "function") {
        throw new Error("O cliente atual ainda não expõe o link direto de identidade com GitHub.");
      }

      const redirectTo = `${window.location.origin}/projects?github=connected#github-workspace`;
      const { data, error: connectError } = await authClient.linkIdentity({
        provider: "github",
        options: {
          redirectTo,
          scopes: "read:user user:email",
        },
      });

      if (connectError) {
        throw connectError;
      }

      if (data?.url) {
        window.location.assign(data.url);
        return;
      }

      setSuccess("Solicitação enviada ao GitHub. Conclua a autorização para continuar.");
    } catch (connectError: any) {
      setError(
        toUserFacingError(
          connectError?.message,
          "Não foi possível iniciar a conexão com o GitHub agora."
        )
      );
    } finally {
      setBusyAction(null);
    }
  }

  function handleSaveWorkspace() {
    setError(null);
    setSuccess(null);

    if (!accountKey) {
      setError("Abra uma sessão válida para salvar a base GitHub deste workspace.");
      return;
    }

    if (!draft.owner.trim() || !draft.repo.trim()) {
      setError("Defina owner e repositório antes de salvar a base GitHub.");
      return;
    }

    setBusyAction("save");
    try {
      const now = new Date().toISOString();
      const nextWorkspace = saveGitHubWorkspace(accountKey, {
        provider: "github",
        owner: draft.owner.trim(),
        repo: draft.repo.trim(),
        branch: draft.branch.trim() || "main",
        rootPath: normalizeRootPath(draft.rootPath),
        target: draft.target,
        connectedAt: workspace?.connectedAt || now,
        updatedAt: now,
        accountLabel: identityLabel,
      });

      setWorkspace(nextWorkspace);
      setDraft(draftFromWorkspace(nextWorkspace));
      setSuccess("Base GitHub salva. O editor já pode registrar versões e exportar snapshots com owner/repositório definidos.");
    } catch (saveError: any) {
      setError(
        toUserFacingError(saveError?.message, "Não foi possível salvar a base GitHub agora.")
      );
    } finally {
      setBusyAction(null);
    }
  }

  function handleClearWorkspace() {
    if (!accountKey) return;

    setBusyAction("clear");
    try {
      clearGitHubWorkspace(accountKey);
      setWorkspace(null);
      setDraft(DEFAULT_DRAFT);
      setSuccess("Base GitHub removida deste navegador. A conexão da conta continua disponível para a próxima configuração.");
      setError(null);
    } finally {
      setBusyAction(null);
    }
  }

  function handleSaveVersion() {
    if (!accountKey || !project) {
      setError("Abra um projeto válido antes de registrar uma versão para GitHub.");
      return;
    }

    setBusyAction("version");
    try {
      const entry = saveGitHubProjectVersion(accountKey, project, workspace);
      const versions = listGitHubProjectVersions(accountKey);
      setVersionCount(versions.length);
      setProjectVersionCount(versions.filter((item) => item.projectId === project.id).length);
      setLastVersionSavedAt(entry.savedAt);
      setSuccess("Versão do projeto registrada. Agora você pode baixar o snapshot ou continuar a evolução fora da plataforma.");
      setError(null);
    } catch (versionError: any) {
      setError(toUserFacingError(versionError?.message, "Não foi possível registrar a versão local agora."));
    } finally {
      setBusyAction(null);
    }
  }

  function handleExportBundle() {
    if (!project) {
      setError("Abra um projeto antes de exportar o bundle GitHub beta.");
      return;
    }

    setBusyAction("export");
    try {
      downloadGitHubProjectBundle(project, workspace);
      setSuccess("Snapshot do projeto baixado. Use esse bundle para continuar o app ou site fora da plataforma enquanto push e PRs entram na próxima fase.");
      setError(null);
    } catch (exportError: any) {
      setError(toUserFacingError(exportError?.message, "Não foi possível exportar o snapshot agora."));
    } finally {
      setBusyAction(null);
    }
  }

  if (!ready) {
    return (
      <section className={`premium-card github-workspace-card github-workspace-card-${variant}`}>
        <div className="premium-skeleton premium-skeleton-line" style={{ width: "38%" }} />
        <div className="premium-skeleton premium-skeleton-line" style={{ width: "72%" }} />
        <div className="premium-skeleton premium-skeleton-card" />
      </section>
    );
  }

  if (variant === "compact") {
    return (
      <section className="premium-card-soft github-workspace-card github-workspace-card-compact">
        <div className="section-stack-tight">
          <p className="section-kicker">GitHub beta</p>
          <h4 className="heading-reset">Continuidade fora da plataforma</h4>
          <p className="helper-text-ea">
            Conecte a conta, defina o repositório base e registre versões do projeto para app ou site sem depender de um fluxo grande agora.
          </p>
        </div>

        <div className="hero-meta-row github-workspace-meta-row">
          <span className="premium-badge premium-badge-phase">
            {connected ? `Conta conectada${identityLabel ? ` • ${identityLabel}` : ""}` : "Conta GitHub pendente"}
          </span>
          <span className="premium-badge premium-badge-soon">{repoLabel || "Base do repositório ainda não definida"}</span>
        </div>

        <div className="github-workspace-status-list github-workspace-status-list-compact">
          <div className="github-workspace-status-item">
            <span className="github-workspace-status-label">Projeto atual</span>
            <strong>{project?.title || "Abra um projeto para preparar a continuidade"}</strong>
            <small>{project ? `${project.kind} • ${versionSummaryLabel}` : "O editor usa essa base para salvar versões e exportar snapshots."}</small>
          </div>
          <div className="github-workspace-status-item">
            <span className="github-workspace-status-label">Fluxo beta</span>
            <strong>{workspace ? `${targetLabel(workspace.target)} em ${workspace.branch}` : "Configure owner/repo/branch em Projetos"}</strong>
            <small>Push direto, branches e PRs ficam para a próxima fase.</small>
          </div>
        </div>

        {error ? (
          <div className="state-ea state-ea-error">
            <p className="state-ea-title">GitHub indisponível agora</p>
            <div className="state-ea-text">{error}</div>
          </div>
        ) : null}

        {success ? (
          <div className="state-ea state-ea-success">
            <p className="state-ea-title">GitHub beta pronto</p>
            <div className="state-ea-text">{success}</div>
          </div>
        ) : null}

        <div className="github-workspace-cta-row">
          <Link href="/projects#github-workspace" className="btn-link-ea btn-secondary btn-sm">
            Configurar base GitHub
          </Link>
          <button onClick={handleSaveVersion} disabled={!project || busyAction === "version"} className="btn-ea btn-ghost btn-sm">
            {busyAction === "version" ? "Salvando versão..." : "Salvar versão"}
          </button>
          <button onClick={handleExportBundle} disabled={!project || busyAction === "export"} className="btn-ea btn-primary btn-sm">
            {busyAction === "export" ? "Preparando snapshot..." : "Exportar snapshot .json"}
          </button>
        </div>

        <div className="github-workspace-inline-note">
          <strong>Última versão local</strong>
          <span>{formatDateLabel(lastVersionSavedAt)}</span>
        </div>
      </section>
    );
  }

  return (
    <section id="github-workspace" className="premium-card github-workspace-card github-workspace-card-full github-workspace-anchor">
      <div className="github-workspace-head">
        <div className="section-header-ea">
          <p className="section-kicker">GitHub beta</p>
          <h2 className="heading-reset">Conecte a conta e prepare o repositório base</h2>
          <p className="section-header-copy">
            A base inicial do beta conecta sua identidade GitHub, salva owner/repositório/branch e deixa o editor pronto para registrar versões e exportar bundles de app ou site.
          </p>
        </div>
        <div className="hero-meta-row github-workspace-meta-row">
          <span className="premium-badge premium-badge-phase">{connected ? "GitHub conectado" : "GitHub ainda não conectado"}</span>
          <span className="premium-badge premium-badge-warning">{repoLabel || "Base do repositório ainda não definida"}</span>
        </div>
      </div>

      {error ? (
        <div className="state-ea state-ea-error">
          <p className="state-ea-title">Não foi possível preparar o GitHub agora</p>
          <div className="state-ea-text">{error}</div>
        </div>
      ) : null}

      {success ? (
        <div className="state-ea state-ea-success">
          <p className="state-ea-title">GitHub beta atualizado</p>
          <div className="state-ea-text">{success}</div>
        </div>
      ) : null}

      <div className="github-workspace-grid">
        <article className="premium-card-soft github-workspace-pane">
          <div className="section-stack-tight">
            <p className="section-kicker">1. Conta conectada</p>
            <h3 className="heading-reset">Identidade GitHub</h3>
            <p className="helper-text-ea">
              Use a conexão para associar o seu workspace a uma conta real sem transformar o beta em um fluxo gigante de repositórios.
            </p>
          </div>

          <div className="github-workspace-status-list">
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Estado</span>
              <strong>{connected ? "Conta GitHub conectada" : "Conexão pendente"}</strong>
              <small>{connected ? (identityLabel ? `Conta identificada como ${identityLabel}.` : "Identidade disponível para continuidade do projeto.") : "Conecte a conta para reforçar continuidade e contexto fora da plataforma."}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Escopo atual</span>
              <strong>Identidade e base do projeto</strong>
              <small>Push direto, branches, PRs e CI entram na próxima fase do beta.</small>
            </div>
          </div>

          <div className="github-workspace-cta-row">
            <button onClick={handleConnectGitHub} disabled={busyAction === "connect" || connected} className="btn-ea btn-primary btn-sm">
              {connected ? "Conta conectada" : busyAction === "connect" ? "Conectando..." : "Conectar GitHub"}
            </button>
            <Link href="/editor/new" className="btn-link-ea btn-ghost btn-sm">
              Abrir projeto para app/site
            </Link>
          </div>
        </article>

        <article className="premium-card-soft github-workspace-pane">
          <div className="section-stack-tight">
            <p className="section-kicker">2. Base do repositório</p>
            <h3 className="heading-reset">Owner, branch e destino</h3>
            <p className="helper-text-ea">
              Salve uma base única para importar a referência do repositório e usar o editor como ponto de continuidade do app ou site.
            </p>
          </div>

          <div className="github-workspace-form-grid">
            <label className="field-label-ea">
              <span>Owner</span>
              <input className="field-ea" value={draft.owner} onChange={(event) => updateDraft("owner", event.target.value)} placeholder="empresa-ou-usuario" />
            </label>
            <label className="field-label-ea">
              <span>Repositório</span>
              <input className="field-ea" value={draft.repo} onChange={(event) => updateDraft("repo", event.target.value)} placeholder="meu-app-ou-site" />
            </label>
            <label className="field-label-ea">
              <span>Branch base</span>
              <input className="field-ea" value={draft.branch} onChange={(event) => updateDraft("branch", event.target.value)} placeholder="main" />
            </label>
            <label className="field-label-ea">
              <span>Raiz do projeto</span>
              <input className="field-ea" value={draft.rootPath} onChange={(event) => updateDraft("rootPath", event.target.value)} placeholder="/apps/web" />
            </label>
          </div>

          <div className="github-workspace-target-row" role="radiogroup" aria-label="Destino do handoff GitHub">
            {(["site", "app"] as GitHubWorkspaceTarget[]).map((target) => (
              <button
                key={target}
                type="button"
                className={`btn-ea btn-sm ${draft.target === target ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setDraft((current) => ({ ...current, target }))}
                aria-pressed={draft.target === target}
              >
                {targetLabel(target)}
              </button>
            ))}
          </div>

          <div className="github-workspace-cta-row">
            <button onClick={handleSaveWorkspace} disabled={busyAction === "save"} className="btn-ea btn-secondary btn-sm">
              {busyAction === "save" ? "Salvando base..." : "Salvar base GitHub"}
            </button>
            <button onClick={handleClearWorkspace} disabled={busyAction === "clear" || !workspace} className="btn-ea btn-ghost btn-sm">
              {busyAction === "clear" ? "Limpando..." : "Remover base local"}
            </button>
          </div>
        </article>

        <article className="premium-card-soft github-workspace-pane">
          <div className="section-stack-tight">
            <p className="section-kicker">3. Continuidade</p>
            <h3 className="heading-reset">Salvar versão e exportar bundle</h3>
            <p className="helper-text-ea">
              O beta já prepara continuidade fora da plataforma: abra um projeto no editor, registre versões locais e exporte um snapshot para seguir no app ou site.
            </p>
          </div>

          <div className="github-workspace-status-list">
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Versões locais</span>
              <strong>{versionSummaryLabel}</strong>
              <small>Última atualização: {formatDateLabel(lastVersionSavedAt)}</small>
            </div>
            <div className="github-workspace-status-item">
              <span className="github-workspace-status-label">Destino atual</span>
              <strong>{workspace ? `${targetLabel(workspace.target)} • ${workspace.branch}` : "Defina a base GitHub"}</strong>
              <small>{workspace ? `Raiz ${workspace.rootPath} em ${formatGitHubRepoLabel(workspace)}.` : "Configure owner/repositório/branch e depois exporte versões pelo editor."}</small>
            </div>
          </div>

          <ol className="github-workspace-checklist">
            <li>Conecte a conta GitHub ou mantenha a base local salva para este navegador.</li>
            <li>Abra um projeto em <Link href="/editor/new" className="text-link-ea">/editor/new</Link> ou retome um já salvo.</li>
            <li>Salve versões e exporte o snapshot .json enquanto push, PR e CI entram na próxima fase.</li>
          </ol>

          <div className="github-workspace-inline-note">
            <strong>Fluxo preparado para app/site</strong>
            <span>O handoff atual é leve e honesto: base do repositório, versões locais e bundle exportável para continuar fora da plataforma.</span>
          </div>
        </article>
      </div>
    </section>
  );
}
