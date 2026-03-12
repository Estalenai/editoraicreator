export type Plan = {
  code: string;
  tier: number;
  name?: string;
  features?: Record<string, any>;
};

export type Wallet = {
  user_id: string;
  common: number;
  pro: number;
  ultra: number;
};

export type ApiError = {
  error: { code?: string; message: string; request_id?: string } | string;
};

export type FetchOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
};

async function fetchJson<T>(input: RequestInfo | URL, init: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    throw body;
  }
  return body as T;
}

export function createApiClient(opts: FetchOptions) {
  async function authedHeaders(extra?: Record<string, string>) {
    const token = await opts.getAccessToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extra || {})
    };
  }

  return {
    // Health
    async healthLive() {
      return fetchJson<{ ok: boolean }>(`${opts.baseUrl}/health/live`, { method: "GET" });
    },

    // User/plan
    async me() {
      return fetchJson<any>(`${opts.baseUrl}/me`, { method: "GET", headers: await authedHeaders() });
    },
    async myPlan() {
      return fetchJson<Plan>(`${opts.baseUrl}/api/plan/me`, { method: "GET", headers: await authedHeaders() });
    },

    // Coins
    async coinsBalance() {
      return fetchJson<{ wallet: Wallet }>(`${opts.baseUrl}/api/coins/balance`, { method: "GET", headers: await authedHeaders() });
    },
    async coinsTransactions(limit = 20) {
      const q = new URLSearchParams({ limit: String(limit) });
      return fetchJson<any>(`${opts.baseUrl}/api/coins/transactions?${q}`, { method: "GET", headers: await authedHeaders() });
    },

    // CRUD Projects
    async listProjects() {
      return fetchJson<any>(`${opts.baseUrl}/api/projects`, { method: "GET", headers: await authedHeaders() });
    },
    async createProject(payload: { title: string; kind: string; data?: any }) {
      return fetchJson<any>(`${opts.baseUrl}/api/projects`, {
        method: "POST",
        headers: await authedHeaders(),
        body: JSON.stringify(payload)
      });
    },
    async getProject(id: string) {
      return fetchJson<any>(`${opts.baseUrl}/api/projects/${id}`, { method: "GET", headers: await authedHeaders() });
    },
    async updateProject(id: string, payload: Partial<{ title: string; kind: string; data: any }>) {
      return fetchJson<any>(`${opts.baseUrl}/api/projects/${id}`, {
        method: "PATCH",
        headers: await authedHeaders(),
        body: JSON.stringify(payload)
      });
    },
    async deleteProject(id: string) {
      return fetchJson<any>(`${opts.baseUrl}/api/projects/${id}`, { method: "DELETE", headers: await authedHeaders() });
    },

    // AI
    async aiTextGenerate(payload: { prompt: string }) {
      return fetchJson<any>(`${opts.baseUrl}/api/ai/text-generate`, {
        method: "POST",
        headers: await authedHeaders(),
        body: JSON.stringify(payload)
      });
    },
    async aiFactCheck(payload: { claim: string }) {
      return fetchJson<any>(`${opts.baseUrl}/api/ai/fact-check`, {
        method: "POST",
        headers: await authedHeaders(),
        body: JSON.stringify(payload)
      });
    }
  };
}
