const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";

export class GitHubApiError extends Error {
  constructor(message, { status = 500, code = "github_error", details = null } = {}) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function buildHeaders(token, extra = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Editor-AI-Creator",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    ...extra,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function parsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function githubRequest(path, { token = null, method = "GET", body, headers = {} } = {}) {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    method,
    headers: buildHeaders(token, headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parsePayload(response);

  if (!response.ok) {
    const fallbackMessage = typeof payload?.message === "string" ? payload.message : "github_request_failed";
    throw new GitHubApiError(fallbackMessage, {
      status: response.status,
      code: fallbackMessage,
      details: payload,
    });
  }

  return {
    data: payload,
    headers: response.headers,
    status: response.status,
  };
}

export async function getGitHubAuthenticatedUser(token) {
  const { data, headers } = await githubRequest("/user", { token });
  return {
    login: String(data?.login || ""),
    id: Number(data?.id || 0) || null,
    name: typeof data?.name === "string" ? data.name : null,
    avatarUrl: typeof data?.avatar_url === "string" ? data.avatar_url : null,
    htmlUrl: typeof data?.html_url === "string" ? data.html_url : null,
    scopes: String(headers.get("x-oauth-scopes") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

export async function getGitHubRepo({ owner, repo, token = null }) {
  const { data } = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { token });
  return {
    id: Number(data?.id || 0) || null,
    name: String(data?.name || repo),
    owner: String(data?.owner?.login || owner),
    private: Boolean(data?.private),
    defaultBranch: String(data?.default_branch || "main"),
    htmlUrl: typeof data?.html_url === "string" ? data.html_url : null,
  };
}

export async function getGitHubBranch({ owner, repo, branch, token = null }) {
  const { data } = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
    { token }
  );

  return {
    name: String(data?.name || branch),
    sha: String(data?.commit?.sha || ""),
  };
}

function normalizePullRequest(data, fallback = {}) {
  return {
    number: Number(data?.number || fallback.number || 0) || null,
    htmlUrl: typeof data?.html_url === "string" ? data.html_url : fallback.htmlUrl || null,
    state: typeof data?.state === "string" ? data.state : fallback.state || "open",
    mergedAt: typeof data?.merged_at === "string" ? data.merged_at : fallback.mergedAt || null,
    updatedAt: typeof data?.updated_at === "string" ? data.updated_at : fallback.updatedAt || null,
    head: typeof data?.head?.ref === "string" ? data.head.ref : fallback.head || null,
    base: typeof data?.base?.ref === "string" ? data.base.ref : fallback.base || null,
    existing: Boolean(fallback.existing),
  };
}

export async function getGitHubPullRequest({ owner, repo, number, token }) {
  const { data } = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(String(number || "").trim())}`,
    { token }
  );

  return normalizePullRequest(data, { number });
}

export async function findGitHubPullRequest({ owner, repo, head, base = null, state = "open", token }) {
  const search = new URLSearchParams();
  search.set("state", state);
  search.set("head", `${owner}:${head}`);
  if (base) search.set("base", base);

  const { data } = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?${search.toString()}`,
    { token }
  );

  const match = Array.isArray(data) ? data[0] : null;
  return match ? normalizePullRequest(match, { head, base, existing: true }) : null;
}

export async function ensureGitHubBranch({ owner, repo, baseBranch, targetBranch, token }) {
  const safeBase = String(baseBranch || "main").trim() || "main";
  const safeTarget = String(targetBranch || safeBase).trim() || safeBase;

  if (safeTarget === safeBase) {
    const branch = await getGitHubBranch({ owner, repo, branch: safeBase, token });
    return {
      baseBranch: safeBase,
      targetBranch: safeTarget,
      sha: branch.sha,
      created: false,
    };
  }

  try {
    const existing = await getGitHubBranch({ owner, repo, branch: safeTarget, token });
    return {
      baseBranch: safeBase,
      targetBranch: safeTarget,
      sha: existing.sha,
      created: false,
    };
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 404) {
      throw error;
    }
  }

  const base = await getGitHubBranch({ owner, repo, branch: safeBase, token });

  try {
    await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, {
      token,
      method: "POST",
      body: {
        ref: `refs/heads/${safeTarget}`,
        sha: base.sha,
      },
    });
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 422) {
      throw error;
    }
  }

  return {
    baseBranch: safeBase,
    targetBranch: safeTarget,
    sha: base.sha,
    created: true,
  };
}

export async function getGitHubFileSha({ owner, repo, branch, path, token }) {
  try {
    const { data } = await githubRequest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      { token }
    );

    return typeof data?.sha === "string" ? data.sha : null;
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function upsertGitHubJsonFile({ owner, repo, branch, path, content, message, token }) {
  const existingSha = await getGitHubFileSha({ owner, repo, branch, path, token });
  const { data } = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
    {
      token,
      method: "PUT",
      body: {
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
        sha: existingSha || undefined,
      },
    }
  );

  return {
    commitSha: String(data?.commit?.sha || ""),
    commitUrl: typeof data?.commit?.html_url === "string" ? data.commit.html_url : null,
    filePath: typeof data?.content?.path === "string" ? data.content.path : path,
    fileSha: typeof data?.content?.sha === "string" ? data.content.sha : existingSha,
  };
}

export async function createGitHubPullRequest({ owner, repo, title, body, head, base, token }) {
  try {
    const { data } = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`, {
      token,
      method: "POST",
      body: {
        title,
        body,
        head,
        base,
      },
    });

    return normalizePullRequest(data, {
      head,
      base,
      existing: false,
    });
  } catch (error) {
    if (!(error instanceof GitHubApiError) || error.status !== 422) {
      throw error;
    }

    const existing = await findGitHubPullRequest({
      owner,
      repo,
      head,
      base,
      state: "open",
      token,
    });
    if (!existing) throw error;
    return existing;
  }
}
