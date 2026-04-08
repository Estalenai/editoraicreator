const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
};

function nowIso() {
  return new Date().toISOString();
}

function buildPlanCatalog() {
  return {
    plans: [
      {
        code: "EDITOR_FREE",
        name: "Iniciante",
        visible: true,
        purchasable: true,
        badge_label: "Entrada",
        credits: { common: 120, pro: 12, ultra: 0 },
        addons: { convert: { enabled: true, fee_percent: 8, pairs: ["common:pro", "common:ultra", "pro:ultra"] } },
        price: { amount_brl: 49, period: "month" },
      },
      {
        code: "EDITOR_PRO",
        name: "Editor Pro",
        visible: true,
        purchasable: true,
        highlight: "most_popular",
        badge_label: "Recomendado",
        credits: { common: 520, pro: 120, ultra: 20 },
        addons: { convert: { enabled: true, fee_percent: 4, pairs: ["common:pro", "common:ultra", "pro:ultra"] } },
        price: { amount_brl: 149, period: "month" },
      },
      {
        code: "EDITOR_ULTRA",
        name: "Editor Ultra",
        visible: true,
        purchasable: true,
        badge_label: "Escala",
        credits: { common: 1400, pro: 320, ultra: 80 },
        addons: { convert: { enabled: true, fee_percent: 2, pairs: ["common:pro", "common:ultra", "pro:ultra"] } },
        price: { amount_brl: 349, period: "month" },
      },
      {
        code: "ENTERPRISE",
        name: "Enterprise",
        visible: true,
        purchasable: false,
        coming_soon: true,
        badge_label: "Assistido",
        credits: { common: 0, pro: 0, ultra: 0 },
        addons: { convert: { enabled: true, fee_percent: 0, pairs: ["common:pro", "common:ultra", "pro:ultra"] } },
        price: { amount_brl: null, period: "month" },
      },
    ],
  };
}

function parseJson(request) {
  try {
    return JSON.parse(request.postData() || "{}");
  } catch {
    return {};
  }
}

function json(data, status = 200) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(data),
  };
}

function normalizeProject(project) {
  return {
    ...project,
    updated_at: project.updated_at || nowIso(),
    created_at: project.created_at || nowIso(),
  };
}

function createPostResult(body) {
  const theme = String(body?.theme || "Campanha criativa").trim();
  return {
    caption: `Gancho direto sobre ${theme}. Mostre o resultado, prove com um exemplo curto e feche com CTA para comentar.`,
    hashtags: ["#editorai", "#conteudo", "#criacao"],
    cta: "Comente QUERO para receber a próxima etapa.",
    mediaSuggestion: "Vídeo curto com hook inicial, cortes rápidos e sobreposição de texto.",
    variations: [
      `Primeira versão para ${theme} com gancho forte e CTA de comentários.`,
      `Segunda versão para ${theme} com tom mais direto e fechamento em prova social.`,
    ],
    platformChecklist: [
      "Gancho claro na primeira linha.",
      "CTA explícito no fechamento.",
      "Hashtags focadas em nicho e intenção.",
    ],
  };
}

function createScriptResult(body) {
  const theme = String(body?.prompt || body?.theme || "crescimento de audiência").trim();
  return {
    title: "Roteiro principal",
    opening: `Abra com uma pergunta forte sobre ${theme}.`,
    development_points: [
      "Contextualize o problema em uma frase.",
      "Apresente um passo prático com exemplo direto.",
      "Feche com um insight que prepare o CTA.",
    ],
    closing: "Amarre o argumento e reforce o ganho imediato.",
    cta: "Peça o próximo passo nos comentários.",
    final_script: `Você está travando em ${theme}? Então faça isto agora: primeiro enquadre o problema, depois entregue um passo claro com exemplo rápido e feche com um CTA objetivo para continuar a conversa.`,
  };
}

function createTransactionsFromBreakdown(breakdown) {
  return Object.entries(breakdown)
    .filter(([, amount]) => Number(amount) > 0)
    .map(([coinType, amount], index) => ({
      id: `tx_${Date.now()}_${coinType}_${index}`,
      coin_type: coinType,
      amount: Number(amount),
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: `pkg_${Date.now()}_${index}`,
      created_at: nowIso(),
    }));
}

function buildQuote(body, quoteId) {
  const breakdown = {
    common: Number(body?.breakdown?.common || 0),
    pro: Number(body?.breakdown?.pro || 0),
    ultra: Number(body?.breakdown?.ultra || 0),
  };
  const pricingByType = {
    common: 4,
    pro: 9,
    ultra: 15,
  };
  const line_items = Object.entries(breakdown)
    .filter(([, quantity]) => Number(quantity) > 0)
    .map(([coin_type, quantity]) => {
      const unit_price_cents = pricingByType[coin_type] || 0;
      return {
        coin_type,
        quantity,
        unit_price_cents,
        subtotal_cents: Number(quantity) * unit_price_cents,
      };
    });
  const subtotal_cents = line_items.reduce((sum, item) => sum + Number(item.subtotal_cents || 0), 0);
  const fee_percent = 4;
  const fee_cents = Math.round(subtotal_cents * (fee_percent / 100));
  const total_cents = subtotal_cents + fee_cents;

  return {
    quote_id: quoteId,
    package_total: Number(body?.package_total || 0),
    breakdown,
    line_items,
    subtotal_brl: subtotal_cents / 100,
    fee_percent,
    fee_brl: fee_cents / 100,
    total_brl: total_cents / 100,
    currency: "BRL",
  };
}

export function createMockApiState() {
  return {
    planCode: "EDITOR_FREE",
    wallet: {
      common: 960,
      pro: 120,
      ultra: 24,
      updated_at: nowIso(),
    },
    usageItems: [
      { feature: "creator_post", used: 2, limit: 30 },
      { feature: "creator_scripts", used: 1, limit: 20 },
    ],
    projects: new Map(),
    projectOrder: [],
    nextProjectId: 1,
    nextQuoteId: 1,
    nextCheckoutId: 1,
    nextJobId: 1,
    nextSupportRequestId: 1,
    pendingPlanCode: null,
    quotes: new Map(),
    clipJobs: new Map(),
    transactions: [],
    supportRequests: [],
    promptPrefs: {
      prompt_auto_enabled: true,
      prompt_auto_apply: true,
    },
  };
}

export async function attachMockApi(context, state) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: JSON_HEADERS, body: "" });
      return;
    }

    if (path === "/api/preferences" && method === "GET") {
      await route.fulfill(json({ prefs: state.promptPrefs }));
      return;
    }

    if (path === "/api/preferences" && method === "PATCH") {
      state.promptPrefs = {
        ...state.promptPrefs,
        ...parseJson(request),
      };
      await route.fulfill(json({ ok: true, prefs: state.promptPrefs }));
      return;
    }

    if (path === "/api/beta-access/me") {
      await route.fulfill(
        json({
          access: {
            approved: true,
            requested: true,
            status: "approved",
            request_id: "req_e2e",
            approved_at: nowIso(),
          },
        })
      );
      return;
    }

    if (path === "/api/subscriptions/me") {
      await route.fulfill(json({ plan_code: state.planCode }));
      return;
    }

    if (path === "/api/coins/balance") {
      await route.fulfill(json({ wallet: { ...state.wallet } }));
      return;
    }

    if (path === "/api/usage/summary") {
      await route.fulfill(json({ items: state.usageItems }));
      return;
    }

    if (path === "/api/coins/transactions") {
      await route.fulfill(json({ transactions: state.transactions }));
      return;
    }

    if (path === "/api/plans/catalog") {
      await route.fulfill(json({ plans: [] }));
      return;
    }

    if (path === "/api/admin/visibility") {
      await route.fulfill(json({ visible: true, allowed: true }));
      return;
    }

    if (path === "/api/health/ready") {
      await route.fulfill(
        json({
          ok: true,
          deps: {
            db: true,
            supabaseAdmin: true,
          },
        })
      );
      return;
    }

    if (path === "/api/support/requests/me" && method === "GET") {
      await route.fulfill(json({ items: state.supportRequests }));
      return;
    }

    if (path === "/api/support/requests" && method === "POST") {
      const body = parseJson(request);
      const item = {
        id: `support_${state.nextSupportRequestId++}`,
        category: String(body?.category || "duvida"),
        subject: String(body?.subject || "Solicitação sem assunto"),
        message: String(body?.message || ""),
        status: "open",
        admin_note: null,
        created_at: nowIso(),
      };
      state.supportRequests = [item, ...state.supportRequests];
      await route.fulfill(json({ ok: true, item }));
      return;
    }

    if (path === "/api/projects" && method === "GET") {
      const items = state.projectOrder.map((id) => state.projects.get(id)).filter(Boolean);
      await route.fulfill(json({ items }));
      return;
    }

    if (path === "/api/projects" && method === "POST") {
      const body = parseJson(request);
      const id = `proj_${state.nextProjectId++}`;
      const item = normalizeProject({
        id,
        title: String(body?.title || "Projeto sem título"),
        kind: String(body?.kind || "text"),
        data: body?.data || {},
        content: body?.content || null,
      });
      state.projects.set(id, item);
      state.projectOrder.unshift(id);
      await route.fulfill(json({ ok: true, item }));
      return;
    }

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === "GET") {
      const item = state.projects.get(projectMatch[1]);
      await route.fulfill(item ? json({ ok: true, item }) : json({ error: "project_not_found" }, 404));
      return;
    }

    if (projectMatch && method === "PATCH") {
      const current = state.projects.get(projectMatch[1]);
      if (!current) {
        await route.fulfill(json({ error: "project_not_found" }, 404));
        return;
      }
      const body = parseJson(request);
      const updated = normalizeProject({
        ...current,
        title: body?.title ?? current.title,
        kind: body?.kind ?? current.kind,
        data: body?.data ?? current.data,
        content: body?.content ?? current.content,
        updated_at: nowIso(),
      });
      state.projects.set(projectMatch[1], updated);
      await route.fulfill(json({ ok: true, item: updated }));
      return;
    }

    if (path === "/api/creator-post/prompt" && method === "POST") {
      const body = parseJson(request);
      await route.fulfill(json({ prompt: `Prompt otimizado para ${String(body?.theme || "post").trim()}` }));
      return;
    }

    if (path === "/api/creator-post/generate" && method === "POST") {
      const body = parseJson(request);
      const result = createPostResult(body);
      await route.fulfill(json({ ok: true, provider: "e2e", result, text: JSON.stringify(result, null, 2) }));
      return;
    }

    if (path === "/api/ai/text-generate" && method === "POST") {
      const body = parseJson(request);
      const structured = createScriptResult(body);
      await route.fulfill(json({ ok: true, provider: "e2e", text: JSON.stringify(structured, null, 2) }));
      return;
    }

    if (path === "/api/ai/fact-check" && method === "POST") {
      await route.fulfill(
        json({
          ok: true,
          verdict: "Verificado",
          confidence: "Alta",
          summary: "A afirmação está consistente com o contexto de teste.",
          sources: ["Fonte de teste E2E"],
        })
      );
      return;
    }

    if (path === "/api/ai/video-generate" && method === "POST") {
      const jobId = `clip_job_${state.nextJobId++}`;
      state.clipJobs.set(jobId, { pollCount: 0 });
      await route.fulfill(
        json({
          ok: true,
          jobId,
          status: "processing",
          provider: "runway",
          model: "gen4-turbo",
          estimated_seconds: 18,
          replay: false,
        })
      );
      return;
    }

    if (path === "/api/ai/video-status" && method === "POST") {
      const body = parseJson(request);
      const jobId = String(body?.jobId || "").trim();
      const jobState = state.clipJobs.get(jobId) || { pollCount: 0 };
      jobState.pollCount += 1;
      state.clipJobs.set(jobId, jobState);
      await route.fulfill(
        json({
          ok: true,
          jobId,
          status: "completed",
          provider: "runway",
          model: "gen4-turbo",
          estimated_seconds: 18,
          output: {
            video_url: `https://example.com/${jobId}.mp4`,
            thumbnail_url: `https://example.com/${jobId}.jpg`,
          },
        })
      );
      return;
    }

    if (path === "/api/plans/catalog" && method === "GET") {
      await route.fulfill(json(buildPlanCatalog()));
      return;
    }

    if (path === "/api/stripe/checkout/session" && method === "POST") {
      const body = parseJson(request);
      state.pendingPlanCode = String(body?.plan_code || "").trim() || null;
      await route.fulfill(
        json({
          ok: true,
          id: `cs_plan_${state.nextCheckoutId++}`,
          url: String(body?.success_url || ""),
        })
      );
      return;
    }

    if (path === "/api/stripe/subscription/refresh" && method === "POST") {
      if (state.pendingPlanCode) {
        state.planCode = state.pendingPlanCode;
        state.pendingPlanCode = null;
      }
      await route.fulfill(json({ ok: true, plan_code: state.planCode }));
      return;
    }

    if (path === "/api/coins/packages/quote" && method === "POST") {
      const body = parseJson(request);
      const quoteId = `quote_${state.nextQuoteId++}`;
      const quote = buildQuote(body, quoteId);
      state.quotes.set(quoteId, quote);
      await route.fulfill(json({ quote }));
      return;
    }

    if (path === "/api/coins/packages/checkout/create" && method === "POST") {
      const body = parseJson(request);
      const quote = body?.quote_id ? state.quotes.get(String(body.quote_id)) : null;
      const appliedBreakdown = quote?.breakdown || body?.breakdown || { common: 0, pro: 0, ultra: 0 };
      state.wallet = {
        ...state.wallet,
        common: Number(state.wallet.common || 0) + Number(appliedBreakdown.common || 0),
        pro: Number(state.wallet.pro || 0) + Number(appliedBreakdown.pro || 0),
        ultra: Number(state.wallet.ultra || 0) + Number(appliedBreakdown.ultra || 0),
        updated_at: nowIso(),
      };
      state.transactions = [...createTransactionsFromBreakdown(appliedBreakdown), ...state.transactions];
      await route.fulfill(
        json({
          ok: true,
          checkout: {
            id: `cs_pkg_${state.nextCheckoutId++}`,
            url: String(body?.success_url || ""),
          },
        })
      );
      return;
    }

    if (path === "/api/coins/convert" && method === "POST") {
      const body = parseJson(request);
      const from = String(body?.from || "common");
      const to = String(body?.to || "pro");
      const amount = Number(body?.amount || 0);
      const fee_percent = state.planCode === "EDITOR_FREE" ? 8 : state.planCode === "EDITOR_PRO" ? 4 : 2;
      const fee_amount = Math.ceil(amount * (fee_percent / 100));
      const debited_amount = amount + fee_amount;
      state.wallet = {
        ...state.wallet,
        [from]: Number(state.wallet[from] || 0) - debited_amount,
        [to]: Number(state.wallet[to] || 0) + amount,
        updated_at: nowIso(),
      };
      state.transactions = [
        {
          id: `tx_conv_${Date.now()}`,
          coin_type: to,
          amount,
          reason: "Conversão de créditos",
          feature: "Conversão",
          ref_kind: "conversion",
          ref_id: `conv_${Date.now()}`,
          created_at: nowIso(),
        },
        ...state.transactions,
      ];
      await route.fulfill(
        json({
          ok: true,
          conversion: { from, to, converted_amount: amount, fee_amount, debited_amount, fee_percent, plan: state.planCode },
        })
      );
      return;
    }

    await route.fulfill(json({ error: `e2e_unhandled_route:${method}:${path}` }, 501));
  });
}
