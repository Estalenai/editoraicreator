import crypto from "crypto";
import express from "express";
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  GitHubApiError,
  createGitHubPullRequest,
  ensureGitHubBranch,
  getGitHubAuthenticatedUser,
  getGitHubBranch,
  getGitHubRepo,
  upsertGitHubJsonFile,
} from "../utils/githubClient.js";
import { decryptGitHubToken, encryptGitHubToken } from "../utils/githubCrypto.js";
import { recordProductEvent } from "../utils/eventsStore.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";

const router = express.Router();
router.use(authMiddleware);

const CONNECTION_PREFIX = "github_connection:";
const VERSION_LIMIT = 16;
const EXPORT_LIMIT = 16;

const ConnectionBodySchema = z.object({
  personalAccessToken: z.string().min(20),
});

const WorkspaceBodySchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1).default("main"),
  rootPath: z.string().optional().default("/"),
  target: z.enum(["app", "site"]).default("site"),
});

const PullRequestBodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(20000).optional(),
  baseBranch: z.string().min(1).max(200).optional(),
});

function configKey(userId) {
  return `${CONNECTION_PREFIX}${String(userId || "").trim()}`;
}

function badRequest(res, message, details) {
  return res.status(400).json({ error: message, details });
}

function notFound(res, message = "Registro não encontrado") {
  return res.status(404).json({ error: message });
}

function nowIso() {
  return new Date().toISOString();
}

function localId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRootPath(value) {
  const trimmed = asText(value);
  if (!trimmed) return "/";
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return prefixed.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function normalizeOwner(value) {
  return asText(value).replace(/^@+/, "").replace(/\s+/g, "");
}

function normalizeRepo(value) {
  const trimmed = asText(value).replace(/\.git$/i, "");
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (urlMatch) {
    return {
      owner: normalizeOwner(urlMatch[1]),
      repo: asText(urlMatch[2]),
    };
  }
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return {
      owner: normalizeOwner(parts[0]),
      repo: asText(parts[1]),
    };
  }
  return {
    owner: "",
    repo: trimmed,
  };
}

function normalizeBranch(value) {
  return asText(value).replace(/^refs\/heads\//i, "").replace(/\/+/g, "/") || "main";
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "project";
}

function buildRepoLabel(binding) {
  if (!binding?.owner || !binding?.repo) return null;
  return `${binding.owner}/${binding.repo}`;
}

function buildCommitMessage(project) {
  return `chore: sync ${slugify(project?.title || project?.id || "project")}`;
}

function buildPullRequestTitle(project) {
  const title = asText(project?.title) || "Projeto";
  return `Handoff ${title}`;
}

function buildPullRequestBody(project, binding, syncInfo) {
  const title = asText(project?.title) || "Projeto";
  return [
    `## ${title}`,
    "",
    "- Sincronizado pelo backend do Editor AI Creator",
    `- Repositório: \`${binding.owner}/${binding.repo}\``,
    `- Branch: \`${binding.branch}\``,
    `- Caminho: \`${syncInfo.filePath}\``,
    syncInfo.commitUrl ? `- Commit: ${syncInfo.commitUrl}` : null,
    "",
    "O projeto continua com a trilha operacional persistida no servidor.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSnapshotPath(binding, project) {
  const rootPath = normalizeRootPath(binding?.rootPath || "/");
  const base = rootPath === "/" ? "" : rootPath.slice(1);
  const fileName = `${slugify(project?.title || project?.id || "project")}-${project.id}.json`;
  const segments = [base, ".editor-ai-creator", "handoffs", fileName].filter(Boolean);
  return segments.join("/");
}

function buildGitHubProjectBundle(project, binding) {
  const exportedAt = nowIso();
  return {
    schema: "editor-ai-creator.github-sync.v1",
    exportedAt,
    sourceOfTruth: "backend",
    product: "Editor AI Creator",
    project: {
      id: project.id,
      title: project.title,
      kind: project.kind,
      updatedAt: project.updated_at || project.updatedAt || exportedAt,
      data: project.data || {},
    },
    github: {
      owner: binding.owner,
      repo: binding.repo,
      repositoryUrl: binding.repositoryUrl || `https://github.com/${binding.owner}/${binding.repo}`,
      defaultBranch: binding.defaultBranch || binding.branch,
      workingBranch: binding.branch,
      rootPath: binding.rootPath,
      target: binding.target,
    },
  };
}

function cloneJson(value) {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}

function ensureGitHubState(projectData) {
  const next = cloneJson(projectData);
  if (!next.integrations || typeof next.integrations !== "object") next.integrations = {};
  if (!next.integrations.github || typeof next.integrations.github !== "object") {
    next.integrations.github = { binding: null, versions: [], exports: [] };
  }
  if (!Array.isArray(next.integrations.github.versions)) next.integrations.github.versions = [];
  if (!Array.isArray(next.integrations.github.exports)) next.integrations.github.exports = [];
  if (!next.delivery || typeof next.delivery !== "object") {
    next.delivery = {
      stage: "draft",
      exportTarget: "device",
      connectedStorage: null,
      mediaRetention: "externalized",
      lastExportedAt: null,
      lastPublishedAt: null,
      history: [],
    };
  }
  if (!Array.isArray(next.delivery.history)) next.delivery.history = [];
  if (!next.deliverable || typeof next.deliverable !== "object") next.deliverable = {};
  return next;
}

function sanitizeConnectionRecord(value) {
  const metadata = value && typeof value === "object" ? value : {};
  return {
    connected: Boolean(metadata.encryptedToken),
    login: asText(metadata.login) || null,
    name: asText(metadata.name) || null,
    avatarUrl: asText(metadata.avatarUrl) || null,
    htmlUrl: asText(metadata.htmlUrl) || null,
    scopes: Array.isArray(metadata.scopes) ? metadata.scopes.map((item) => asText(item)).filter(Boolean) : [],
    updatedAt: asText(metadata.updatedAt) || null,
    mode: metadata.encryptedToken ? "token" : "none",
  };
}

async function requireConnectionRecord(userId) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    throw new Error("supabase_admin_unavailable");
  }

  const { data, error } = await supabaseAdmin
    .from("configs")
    .select("value")
    .eq("key", configKey(userId))
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "github_config_read_failed");
  }

  const value = data?.value && typeof data.value === "object" ? data.value : null;
  return {
    value,
    summary: sanitizeConnectionRecord(value),
    token:
      value?.encryptedToken && typeof value.encryptedToken === "object"
        ? decryptGitHubToken(value.encryptedToken)
        : null,
  };
}

async function saveConnectionRecord(userId, value) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    throw new Error("supabase_admin_unavailable");
  }

  const { error } = await supabaseAdmin
    .from("configs")
    .upsert(
      {
        key: configKey(userId),
        value,
      },
      { onConflict: "key" }
    );

  if (error) {
    throw new Error(error.message || "github_config_write_failed");
  }
}

async function clearConnectionRecord(userId) {
  if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
    throw new Error("supabase_admin_unavailable");
  }

  const { error } = await supabaseAdmin.from("configs").delete().eq("key", configKey(userId));
  if (error) {
    throw new Error(error.message || "github_config_delete_failed");
  }
}

async function readProjectForUser(req, projectId) {
  const supabase = createAuthedSupabaseClient(req.access_token);
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "project_read_failed");
  }

  return data || null;
}

async function persistProjectData(req, projectId, nextData) {
  const supabase = createAuthedSupabaseClient(req.access_token);
  const { data, error } = await supabase
    .from("projects")
    .update({ data: nextData })
    .eq("id", projectId)
    .eq("user_id", req.user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "project_save_failed");
  }

  return data || null;
}

function handleGitHubError(res, error, defaultMessage) {
  if (error instanceof GitHubApiError) {
    const status =
      error.status === 404 ? 404 : error.status === 401 ? 401 : error.status === 403 ? 403 : error.status === 409 ? 409 : 400;
    return res.status(status).json({
      error: error.code || "github_request_failed",
      message: error.message || defaultMessage,
      details: error.details || null,
    });
  }

  return res.status(400).json({
    error: defaultMessage,
    details: error?.message || null,
  });
}

router.get("/connection", async (req, res) => {
  try {
    const record = await requireConnectionRecord(req.user.id);
    return res.json({ connection: record.summary });
  } catch (error) {
    return res.status(503).json({ error: error?.message || "github_connection_unavailable" });
  }
});

router.put("/connection", async (req, res) => {
  try {
    const body = ConnectionBodySchema.parse(req.body || {});
    const githubUser = await getGitHubAuthenticatedUser(body.personalAccessToken);
    const payload = {
      encryptedToken: encryptGitHubToken(body.personalAccessToken),
      login: githubUser.login,
      name: githubUser.name,
      avatarUrl: githubUser.avatarUrl,
      htmlUrl: githubUser.htmlUrl,
      scopes: githubUser.scopes,
      updatedAt: nowIso(),
    };

    await saveConnectionRecord(req.user.id, payload);
    recordProductEvent({
      event: "github.connection.saved",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "github.connection.put", status: "success" },
    });

    return res.json({ connection: sanitizeConnectionRecord(payload) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(res, "Token GitHub inválido", error.flatten());
    }
    if (error instanceof GitHubApiError) {
      return handleGitHubError(res, error, "Não foi possível validar o token GitHub.");
    }
    return res.status(503).json({ error: error?.message || "github_connection_failed" });
  }
});

router.delete("/connection", async (req, res) => {
  try {
    await clearConnectionRecord(req.user.id);
    recordProductEvent({
      event: "github.connection.removed",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "github.connection.delete", status: "success" },
    });
    return res.json({ ok: true, connection: sanitizeConnectionRecord(null) });
  } catch (error) {
    return res.status(503).json({ error: error?.message || "github_connection_delete_failed" });
  }
});

router.post("/projects/:id/workspace", async (req, res) => {
  try {
    const body = WorkspaceBodySchema.parse(req.body || {});
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const repoInput = normalizeRepo(body.repo);
    const owner = normalizeOwner(body.owner || repoInput.owner);
    const repo = asText(repoInput.repo || body.repo);
    const branch = normalizeBranch(body.branch);
    const rootPath = normalizeRootPath(body.rootPath);
    const target = body.target === "app" ? "app" : "site";

    if (!owner || !repo) {
      return badRequest(res, "owner e repositório são obrigatórios");
    }

    let token = null;
    try {
      const connection = await requireConnectionRecord(req.user.id);
      token = connection.token;
    } catch {}

    let repoInfo;
    let branchInfo = null;
    let resolvedCommitSha = null;
    try {
      repoInfo = await getGitHubRepo({ owner, repo, token });
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404 && !token) {
        return res.status(412).json({
          error: "github_repo_not_verified",
          message: "Não foi possível verificar o repositório ou a branch sem uma credencial GitHub com acesso adequado.",
        });
      }
      return handleGitHubError(res, error, "Não foi possível validar o workspace GitHub.");
    }

    try {
      branchInfo = await getGitHubBranch({ owner, repo, branch, token });
      resolvedCommitSha = branchInfo.sha || null;
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) {
        return handleGitHubError(res, error, "Não foi possível validar a branch do workspace GitHub.");
      }

      try {
        const defaultBranchInfo = await getGitHubBranch({
          owner,
          repo,
          branch: repoInfo.defaultBranch || "main",
          token,
        });
        resolvedCommitSha = defaultBranchInfo.sha || null;
      } catch (defaultBranchError) {
        return handleGitHubError(defaultBranchError, "Não foi possível validar a branch base do repositório.");
      }
    }

    const nextData = ensureGitHubState(project.data);
    const previousBinding = nextData.integrations.github.binding || {};
    const nextBinding = {
      ...previousBinding,
      provider: "github",
      owner,
      repo,
      branch,
      rootPath,
      target,
      connectedAt: previousBinding.connectedAt || nowIso(),
      updatedAt: nowIso(),
      accountLabel: previousBinding.accountLabel || null,
      repositoryUrl: repoInfo.htmlUrl || `https://github.com/${owner}/${repo}`,
      defaultBranch: repoInfo.defaultBranch || branch,
      lastVerifiedAt: nowIso(),
      verificationStatus: "verified",
      tokenConfigured: Boolean(token),
      lastResolvedCommitSha: resolvedCommitSha,
      lastSyncStatus: previousBinding.lastSyncStatus || (branchInfo ? null : "pending"),
    };

    nextData.integrations.github.binding = nextBinding;

    const item = await persistProjectData(req, project.id, nextData);
    recordProductEvent({
      event: "github.workspace.saved",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "github.workspace.post", status: "success" },
    });

    return res.json({
      item,
      workspace: nextBinding,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(res, "Workspace GitHub inválido", error.flatten());
    }
    return res.status(400).json({ error: error?.message || "github_workspace_failed" });
  }
});

router.delete("/projects/:id/workspace", async (req, res) => {
  try {
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const nextData = ensureGitHubState(project.data);
    nextData.integrations.github.binding = null;
    const item = await persistProjectData(req, project.id, nextData);

    recordProductEvent({
      event: "github.workspace.cleared",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "github.workspace.delete", status: "success" },
    });

    return res.json({ item });
  } catch (error) {
    return res.status(400).json({ error: error?.message || "github_workspace_clear_failed" });
  }
});

router.post("/projects/:id/checkpoints", async (req, res) => {
  try {
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const nextData = ensureGitHubState(project.data);
    const binding = nextData.integrations.github.binding;
    if (!binding?.owner || !binding?.repo) {
      return badRequest(res, "Salve a base GitHub no projeto antes de registrar um checkpoint.");
    }

    const versionRecord = {
      id: localId(),
      savedAt: nowIso(),
      handoffTarget: binding.target === "app" ? "app" : "site",
      repoLabel: buildRepoLabel(binding),
      branch: binding.branch,
      commitMessage: buildCommitMessage(project),
    };

    nextData.integrations.github.versions = [versionRecord, ...nextData.integrations.github.versions].slice(0, VERSION_LIMIT);
    nextData.deliverable.latestVersionId = versionRecord.id;

    const item = await persistProjectData(req, project.id, nextData);
    recordProductEvent({
      event: "github.checkpoint.saved",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "github.checkpoints.post", status: "success" },
    });

    return res.json({
      item,
      checkpoint: versionRecord,
    });
  } catch (error) {
    return res.status(400).json({ error: error?.message || "github_checkpoint_failed" });
  }
});

router.post("/projects/:id/sync", async (req, res) => {
  try {
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const nextData = ensureGitHubState(project.data);
    const binding = nextData.integrations.github.binding;
    if (!binding?.owner || !binding?.repo || !binding?.branch) {
      return badRequest(res, "A base GitHub do projeto ainda não está pronta.");
    }

    const connection = await requireConnectionRecord(req.user.id);
    if (!connection.token) {
      return res.status(412).json({
        error: "github_connection_required",
        message: "Conecte um token GitHub com acesso ao repositório antes de sincronizar commits e abrir PRs pelo backend.",
      });
    }

    const repoInfo = await getGitHubRepo({
      owner: binding.owner,
      repo: binding.repo,
      token: connection.token,
    });

    const branchInfo = await ensureGitHubBranch({
      owner: binding.owner,
      repo: binding.repo,
      baseBranch: repoInfo.defaultBranch || "main",
      targetBranch: binding.branch,
      token: connection.token,
    });

    const snapshot = buildGitHubProjectBundle(project, {
      ...binding,
      repositoryUrl: repoInfo.htmlUrl,
      defaultBranch: repoInfo.defaultBranch,
    });
    const filePath = buildSnapshotPath(binding, project);
    const syncInfo = await upsertGitHubJsonFile({
      owner: binding.owner,
      repo: binding.repo,
      branch: branchInfo.targetBranch,
      path: filePath,
      content: JSON.stringify(snapshot, null, 2),
      message: buildCommitMessage(project),
      token: connection.token,
    });

    const exportRecord = {
      id: localId(),
      exportedAt: nowIso(),
      handoffTarget: binding.target === "app" ? "app" : "site",
      repoLabel: buildRepoLabel(binding),
      branch: branchInfo.targetBranch,
      path: syncInfo.filePath,
      commitSha: syncInfo.commitSha,
      commitUrl: syncInfo.commitUrl,
      status: "synced",
    };

    nextData.integrations.github.binding = {
      ...binding,
      repositoryUrl: repoInfo.htmlUrl || binding.repositoryUrl || `https://github.com/${binding.owner}/${binding.repo}`,
      defaultBranch: repoInfo.defaultBranch || binding.defaultBranch || binding.branch,
      updatedAt: nowIso(),
      lastVerifiedAt: nowIso(),
      verificationStatus: "verified",
      tokenConfigured: true,
      lastResolvedCommitSha: syncInfo.commitSha,
      lastSyncStatus: "synced",
      lastSyncedAt: exportRecord.exportedAt,
      lastCommitSha: syncInfo.commitSha,
      lastCommitUrl: syncInfo.commitUrl,
      accountLabel: connection.summary.login || binding.accountLabel || null,
    };
    nextData.integrations.github.exports = [exportRecord, ...nextData.integrations.github.exports].slice(0, EXPORT_LIMIT);
    nextData.delivery = {
      ...nextData.delivery,
      stage: nextData.delivery.stage === "published" ? "published" : "exported",
      exportTarget: "connected_storage",
      connectedStorage: "github",
      lastExportedAt: exportRecord.exportedAt,
      history: [
        {
          id: localId(),
          ts: exportRecord.exportedAt,
          stage: "exported",
          channel: "github",
          title: "Sync GitHub concluído",
          note: `Commit ${syncInfo.commitSha.slice(0, 7)} registrado em ${buildRepoLabel(binding)} na branch ${branchInfo.targetBranch}.`,
        },
        ...nextData.delivery.history,
      ].slice(0, 16),
    };
    nextData.deliverable = {
      ...nextData.deliverable,
      nextAction:
        branchInfo.targetBranch !== (repoInfo.defaultBranch || "main")
          ? "Abra o pull request quando a revisão do snapshot estiver pronta."
          : "Revise o commit sincronizado no repositório antes de seguir para publish.",
    };

    const item = await persistProjectData(req, project.id, nextData);
    recordProductEvent({
      event: "github.sync.completed",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "github.sync.post", status: "success" },
    });

    return res.json({
      item,
      sync: {
        branch: branchInfo.targetBranch,
        baseBranch: repoInfo.defaultBranch || "main",
        repositoryUrl: repoInfo.htmlUrl,
        filePath: syncInfo.filePath,
        commitSha: syncInfo.commitSha,
        commitUrl: syncInfo.commitUrl,
      },
    });
  } catch (error) {
    return handleGitHubError(res, error, "Não foi possível sincronizar o projeto com o GitHub.");
  }
});

router.post("/projects/:id/pull-request", async (req, res) => {
  try {
    const body = PullRequestBodySchema.parse(req.body || {});
    const project = await readProjectForUser(req, req.params.id);
    if (!project) return notFound(res);

    const nextData = ensureGitHubState(project.data);
    const binding = nextData.integrations.github.binding;
    if (!binding?.owner || !binding?.repo || !binding?.branch) {
      return badRequest(res, "A base GitHub do projeto ainda não está pronta.");
    }

    const connection = await requireConnectionRecord(req.user.id);
    if (!connection.token) {
      return res.status(412).json({
        error: "github_connection_required",
        message: "Conecte um token GitHub com acesso ao repositório antes de abrir PRs pelo backend.",
      });
    }

    const repoInfo = await getGitHubRepo({
      owner: binding.owner,
      repo: binding.repo,
      token: connection.token,
    });
    const baseBranch = normalizeBranch(body.baseBranch || binding.defaultBranch || repoInfo.defaultBranch || "main");
    const headBranch = normalizeBranch(binding.branch);

    if (headBranch === baseBranch) {
      return res.status(409).json({
        error: "github_pr_not_applicable",
        message: "A branch configurada já é a branch base do repositório. Use uma branch dedicada antes de abrir PR.",
      });
    }

    const latestExport = Array.isArray(nextData.integrations.github.exports) ? nextData.integrations.github.exports[0] || null : null;
    const pr = await createGitHubPullRequest({
      owner: binding.owner,
      repo: binding.repo,
      title: body.title || buildPullRequestTitle(project),
      body: body.body || buildPullRequestBody(project, binding, {
        filePath: latestExport?.path || buildSnapshotPath(binding, project),
        commitUrl: latestExport?.commitUrl || null,
      }),
      head: headBranch,
      base: baseBranch,
      token: connection.token,
    });

    if (latestExport) {
      latestExport.pullRequestNumber = pr.number;
      latestExport.pullRequestUrl = pr.htmlUrl;
      latestExport.status = "pr_open";
    }

    nextData.integrations.github.binding = {
      ...binding,
      defaultBranch: baseBranch,
      updatedAt: nowIso(),
      tokenConfigured: true,
      lastPullRequestNumber: pr.number,
      lastPullRequestUrl: pr.htmlUrl,
      lastPullRequestState: pr.state,
      lastSyncStatus: pr.state === "open" ? "pr_open" : binding.lastSyncStatus || null,
    };

    nextData.delivery.history = [
      {
        id: localId(),
        ts: nowIso(),
        stage: nextData.delivery.stage === "published" ? "published" : "exported",
        channel: "github",
        title: pr.existing ? "Pull request já existente" : "Pull request aberto",
        note: `PR ${pr.number || ""} em ${buildRepoLabel(binding)} (${headBranch} -> ${baseBranch}).`.trim(),
      },
      ...nextData.delivery.history,
    ].slice(0, 16);

    const item = await persistProjectData(req, project.id, nextData);
    recordProductEvent({
      event: "github.pull_request.created",
      userId: req.user.id,
      plan: req.plan?.code || null,
      additional: { source: "github.pull-request.post", status: pr.existing ? "reused" : "success" },
    });

    return res.json({
      item,
      pullRequest: pr,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return badRequest(res, "Pull request GitHub inválido", error.flatten());
    }
    return handleGitHubError(res, error, "Não foi possível abrir o pull request no GitHub.");
  }
});

export default router;
