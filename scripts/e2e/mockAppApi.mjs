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

function createTransactionsFromBreakdown(breakdown, options = {}) {
  const quoteId = String(options?.quoteId || `quote_${Date.now()}`).trim();
  const checkoutSessionId = String(options?.checkoutSessionId || `cs_pkg_${quoteId}`).trim();
  const paymentIntentId = String(options?.paymentIntentId || `pi_pkg_${quoteId}`).trim();
  const supportRef = String(options?.supportRef || paymentIntentId || checkoutSessionId || quoteId).trim();
  const packageTotal = Number(options?.packageTotal || 0);
  return Object.entries(breakdown)
    .filter(([, amount]) => Number(amount) > 0)
    .map(([coinType, amount], index) => ({
      id: `tx_${Date.now()}_${coinType}_${index}`,
      coin_type: coinType,
      amount: Number(amount),
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: `${quoteId}_${index}`,
      meta: {
        provider: "stripe",
        kind: "package_mix",
        financial_state: "reconciled",
        settlement_status: "settled",
        reconciliation_status: "reconciled",
        reconciled_at: nowIso(),
        receipt_id: quoteId,
        quote_id: quoteId,
        stripe_checkout_session_id: checkoutSessionId,
        stripe_payment_intent_id: paymentIntentId,
        support_ref: supportRef,
        package_total: packageTotal,
        pricing: packageTotal ? { total_brl: packageTotal / 10 } : null,
      },
      created_at: nowIso(),
    }));
}

function createSeedFinancialTransactions() {
  const baseTime = Date.now();
  return [
    {
      id: "tx_seed_reconciled_purchase",
      coin_type: "pro",
      amount: 120,
      reason: "Compra avulsa concluída",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: "quote_seed_reconciled",
      meta: {
        provider: "stripe",
        kind: "package_mix",
        financial_state: "reconciled",
        settlement_status: "settled",
        reconciliation_status: "reconciled",
        reconciled_at: nowIso(),
        receipt_id: "quote_seed_reconciled",
        quote_id: "quote_seed_reconciled",
        stripe_checkout_session_id: "cs_seed_reconciled",
        stripe_payment_intent_id: "pi_seed_reconciled",
        support_ref: "pi_seed_reconciled",
        package_total: 120,
        pricing: { total_brl: 12 },
      },
      created_at: new Date(baseTime - 5 * 60 * 1000).toISOString(),
    },
    {
      id: "tx_seed_pending_purchase",
      coin_type: "common",
      amount: 60,
      reason: "Compra avulsa em processamento",
      feature: "Compra avulsa",
      ref_kind: "coins_package",
      ref_id: "quote_seed_pending",
      meta: {
        provider: "stripe",
        kind: "package_mix",
        financial_state: "pending",
        settlement_status: "pending",
        receipt_id: "quote_seed_pending",
        quote_id: "quote_seed_pending",
        stripe_checkout_session_id: "cs_seed_pending",
        stripe_payment_intent_id: "pi_seed_pending",
        support_ref: "pi_seed_pending",
        package_total: 60,
        pricing: { total_brl: 6 },
      },
      created_at: new Date(baseTime - 55 * 60 * 1000).toISOString(),
    },
    {
      id: "tx_seed_refunded_purchase",
      coin_type: "common",
      amount: -60,
      reason: "Estorno de compra",
      feature: "Reembolso",
      ref_kind: "coins_package",
      ref_id: "quote_seed_refunded",
      meta: {
        provider: "stripe",
        kind: "package_mix",
        financial_state: "refunded",
        settlement_status: "refunded",
        receipt_id: "quote_seed_refunded",
        quote_id: "quote_seed_refunded",
        stripe_checkout_session_id: "cs_seed_refunded",
        stripe_payment_intent_id: "pi_seed_refunded",
        support_ref: "pi_seed_refunded",
        package_total: 60,
        pricing: { total_brl: 6 },
      },
      created_at: new Date(baseTime - 26 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "tx_seed_disputed_purchase",
      coin_type: "ultra",
      amount: 20,
      reason: "Compra em disputa",
      feature: "Disputa",
      ref_kind: "coins_package",
      ref_id: "quote_seed_disputed",
      meta: {
        provider: "stripe",
        kind: "package_mix",
        financial_state: "disputed",
        settlement_status: "disputed",
        receipt_id: "quote_seed_disputed",
        quote_id: "quote_seed_disputed",
        stripe_checkout_session_id: "cs_seed_disputed",
        stripe_payment_intent_id: "pi_seed_disputed",
        support_ref: "pi_seed_disputed",
        package_total: 20,
        pricing: { total_brl: 2 },
      },
      created_at: new Date(baseTime - 52 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "tx_seed_failed_purchase",
      coin_type: "pro",
      amount: 0,
      reason: "Falha de processamento",
      feature: "Falha financeira",
      ref_kind: "coins_package",
      ref_id: "quote_seed_failed",
      meta: {
        provider: "stripe",
        kind: "package_mix",
        financial_state: "failed",
        settlement_status: "failed",
        receipt_id: "quote_seed_failed",
        quote_id: "quote_seed_failed",
        stripe_checkout_session_id: "cs_seed_failed",
        stripe_payment_intent_id: "pi_seed_failed",
        support_ref: "pi_seed_failed",
        package_total: 40,
        pricing: { total_brl: 4 },
      },
      created_at: new Date(baseTime - 79 * 60 * 60 * 1000).toISOString(),
    },
  ];
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

function buildAccountOverview(state) {
  const notifications = [];
  const supportItems = Array.isArray(state.supportRequests) ? state.supportRequests : [];
  const transactions = Array.isArray(state.transactions) ? state.transactions : [];
  const projects = state.projectOrder.map((id) => state.projects.get(id)).filter(Boolean);

  for (const item of supportItems.slice(0, 6)) {
    notifications.push({
      id: `support:${item.id}:${item.status}`,
      source: "support",
      title: `${String(item.metadata?.support_ref || item.id || "SUP").trim()} • ${String(item.subject || "Suporte").trim()}`,
      message:
        item.status === "resolved"
          ? String(item.metadata?.resolution_summary || item.admin_note || "Caso resolvido e documentado.")
          : item.status === "in_review"
            ? "Seu caso está em análise pela equipe."
            : "Seu caso foi aberto e aguarda triagem.",
      created_at: item.updated_at || item.created_at || nowIso(),
      status_code: item.status === "resolved" ? "manually_resolved" : item.status === "in_review" ? "running" : "queued",
      href: "/support",
      meta: {
        support_ref: item.metadata?.support_ref || item.id,
        queue_label: item.metadata?.queue_label || "Atendimento",
      },
    });
  }

  for (const tx of transactions.slice(0, 5)) {
    const stateCode = String(
      tx?.meta?.financial_state || tx?.meta?.settlement_status || tx?.meta?.reconciliation_status || "confirmed"
    ).toLowerCase();
    notifications.push({
      id: `credits:${tx.id}`,
      source: "credits",
      title: String(tx.feature || tx.reason || "Ledger"),
      message:
        stateCode.includes("pending")
          ? "Movimentação aguardando confirmação."
          : stateCode.includes("failed") || stateCode.includes("disputed")
            ? "Movimentação exige atenção financeira."
            : stateCode.includes("refunded")
              ? "Movimentação ajustada manualmente."
              : "Movimentação confirmada no ledger.",
      created_at: tx.created_at || nowIso(),
      status_code:
        stateCode.includes("pending")
          ? "queued"
          : stateCode.includes("failed") || stateCode.includes("disputed")
            ? "needs_attention"
            : stateCode.includes("refund")
              ? "manually_resolved"
              : "confirmed",
      href: "/credits#credits-history",
      meta: {
        coin_type: tx.coin_type,
        amount: tx.amount,
      },
    });
  }

  for (const project of projects.slice(0, 3)) {
    const githubStatus = String(project?.data?.integrations?.github?.exports?.[0]?.status || "").toLowerCase();
    if (githubStatus) {
      notifications.push({
        id: `project:${project.id}:github`,
        source: "projects",
        title: `${String(project.title || "Projeto")} • GitHub`,
        message:
          githubStatus.includes("retry")
            ? "A trilha GitHub está tentando novamente."
            : githubStatus.includes("partial")
              ? "A trilha GitHub avançou parcialmente e ainda exige revisão."
              : githubStatus.includes("fail") || githubStatus.includes("attention")
                ? "A trilha GitHub exige atenção."
                : githubStatus.includes("queued") || githubStatus.includes("running")
                  ? "A trilha GitHub continua em andamento."
                  : "A trilha GitHub foi confirmada.",
        created_at: project.updated_at || project.created_at || nowIso(),
        status_code:
          githubStatus.includes("retry")
            ? "retrying"
            : githubStatus.includes("partial")
              ? "partially_failed"
              : githubStatus.includes("fail") || githubStatus.includes("attention")
                ? "needs_attention"
                : githubStatus.includes("queued") || githubStatus.includes("running")
                  ? "running"
                  : "confirmed",
        href: `/editor/${project.id}`,
      });
    }
  }

  notifications.sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

  const counts = notifications.reduce((acc, item) => {
    const key = String(item.status_code || "confirmed");
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: true,
    profile: {
      id: "user_seed_1",
      email: "qa@editorai.test",
      created_at: nowIso(),
      last_sign_in_at: nowIso(),
      email_confirmed_at: nowIso(),
      is_admin: false,
    },
    plan: {
      plan_code: state.planCode,
      status: "active",
    },
    wallet: {
      ...state.wallet,
      total:
        Number(state.wallet?.common || 0) +
        Number(state.wallet?.pro || 0) +
        Number(state.wallet?.ultra || 0),
    },
    preferences: {
      ...state.promptPrefs,
    },
    beta_access: {
      approved: true,
      requested: true,
      status: "approved",
      request_id: "req_e2e",
      approved_at: nowIso(),
    },
    support: {
      unresolved_count: supportItems.filter((item) => item.status !== "resolved").length,
      recent: supportItems.slice(0, 6),
    },
    financial: {
      recent: transactions.slice(0, 8),
    },
    projects: {
      recent: projects.slice(0, 8),
    },
    notifications: {
      items: notifications.slice(0, 18),
      counts,
    },
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
    transactions: createSeedFinancialTransactions(),
    supportRequests: [
      {
        id: "support_seed_1",
        user_id: "user_seed_1",
        category: "problema_tecnico",
        subject: "Fila de exportação atrasada",
        message: "A exportação demorou mais do que o esperado e precisei revisar o status manualmente.",
        status: "in_review",
        admin_note: "Equipe acompanhando o publish.",
        metadata: {
          support_ref: "SUP-SEED-1",
          queue_label: "Publicação",
          owner_label: "Ops",
          resolution_summary: null,
          next_step: "Aguardar nova tentativa automática.",
          lifecycle: [
            { at: nowIso(), summary: "Caso aberto", queue_label: "Atendimento" },
            { at: nowIso(), summary: "Triagem iniciada", queue_label: "Publicação", owner_label: "Ops" },
          ],
        },
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    betaAccessRequests: [
      {
        id: "beta_seed_1",
        email: "beta@editorai.test",
        user_id: "user_seed_beta_1",
        status: "pending",
        admin_note: null,
        created_at: nowIso(),
        updated_at: nowIso(),
        approved_at: null,
      },
    ],
    promptPrefs: {
      prompt_auto_enabled: true,
      prompt_auto_apply: true,
      prompt_auto_dont_ask_again: false,
      ai_execution_mode_preference: "automatic_quality",
      language: "pt-BR",
      notification_inbox_enabled: true,
      notification_toasts_enabled: true,
      notification_support_updates: true,
      notification_financial_updates: true,
      notification_async_updates: true,
    },
  };
}

export async function attachMockApi(context, state) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === "/api/auth/session" || path === "/api/observability/frontend-error") {
      await route.continue();
      return;
    }

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

    if (path === "/api/account/overview" && method === "GET") {
      await route.fulfill(json(buildAccountOverview(state)));
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

    if (path === "/api/usage/limits") {
      await route.fulfill(
        json({
          items: state.usageItems.map((item) => ({
            feature: item.feature,
            used: item.used,
            limit: item.limit,
            remaining: Math.max(0, Number(item.limit || 0) - Number(item.used || 0)),
          })),
        })
      );
      return;
    }

    if (path === "/api/coins/transactions") {
      await route.fulfill(json({ transactions: state.transactions }));
      return;
    }

    if (path === "/api/coins/packages/status" && method === "GET") {
      const quoteId = String(url.searchParams.get("quote_id") || "").trim();
      const quote = quoteId ? state.quotes.get(quoteId) : null;
      await route.fulfill(
        json({
          ok: true,
          quote: quote
            ? {
                quote_id: quote.quote_id,
                package_total: quote.package_total,
                breakdown: quote.breakdown,
                source: "stripe_checkout",
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                used_at: nowIso(),
                checkout_session_id: `cs_pkg_status_${quoteId}`,
                payment_intent_id: `pi_pkg_status_${quoteId}`,
              }
            : null,
          wallet: { ...state.wallet },
          reconciliation: quote
            ? {
                ok: true,
                status: "reconciled",
                grant: {
                  status: "ok",
                  grantCallPath: "e2e_mock_ledger",
                },
              }
            : null,
        })
      );
      return;
    }

    if (path === "/api/github/connection" && method === "GET") {
      await route.fulfill(json({ connected: false, connection: null }));
      return;
    }

    if (path === "/api/vercel/connection" && method === "GET") {
      await route.fulfill(json({ connected: false, connection: null }));
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

    if (path === "/api/support/admin/requests" && method === "GET") {
      const statusFilter = String(url.searchParams.get("status") || "").trim();
      const categoryFilter = String(url.searchParams.get("category") || "").trim();
      const items = state.supportRequests.filter((item) => {
        if (statusFilter && item.status !== statusFilter) return false;
        if (categoryFilter && item.category !== categoryFilter) return false;
        return true;
      });
      await route.fulfill(json({ items }));
      return;
    }

    const supportAdminStatusMatch = path.match(/^\/api\/support\/admin\/requests\/([^/]+)\/status$/);
    if (supportAdminStatusMatch && method === "PATCH") {
      const body = parseJson(request);
      state.supportRequests = state.supportRequests.map((item) =>
        item.id === supportAdminStatusMatch[1]
          ? {
              ...item,
              status: String(body?.status || item.status),
              admin_note: String(body?.admin_note || item.admin_note || ""),
              updated_at: nowIso(),
            }
          : item
      );
      await route.fulfill(json({ ok: true }));
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
        metadata: {
          support_ref: `SUP-E2E-${state.nextSupportRequestId}`,
          queue_label: "Atendimento",
          owner_label: null,
          lifecycle: [{ at: nowIso(), summary: "Caso aberto", queue_label: "Atendimento" }],
        },
        created_at: nowIso(),
        updated_at: nowIso(),
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
        data: body?.data || {
          integrations: {
            github: {
              exports: [{ id: `gh_${id}`, status: "retrying", exportedAt: nowIso() }],
            },
          },
        },
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

    if (path === "/api/no-code/runtime" && method === "GET") {
      await route.fulfill(
        json({
          ok: true,
          automations: [],
          connectors: [],
          templates: [
            { id: "tpl_video", kind: "video", label: "Projeto de Vídeo" },
            { id: "tpl_text", kind: "text", label: "Projeto de Texto" },
          ],
        })
      );
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
      const quoteId = String(body?.quote_id || quote?.quote_id || `quote_${state.nextQuoteId++}`).trim();
      const checkoutSessionId = `cs_pkg_${state.nextCheckoutId++}`;
      const paymentIntentId = `pi_pkg_${state.nextCheckoutId++}`;
      state.wallet = {
        ...state.wallet,
        common: Number(state.wallet.common || 0) + Number(appliedBreakdown.common || 0),
        pro: Number(state.wallet.pro || 0) + Number(appliedBreakdown.pro || 0),
        ultra: Number(state.wallet.ultra || 0) + Number(appliedBreakdown.ultra || 0),
        updated_at: nowIso(),
      };
      state.transactions = [
        ...createTransactionsFromBreakdown(appliedBreakdown, {
          quoteId,
          checkoutSessionId,
          paymentIntentId,
          packageTotal: Number(quote?.package_total || body?.package_total || 0),
          supportRef: paymentIntentId,
        }),
        ...state.transactions,
      ];
      await route.fulfill(
        json({
          ok: true,
          checkout: {
            id: checkoutSessionId,
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
      const conversionRef = `conv_${Date.now()}`;
      state.wallet = {
        ...state.wallet,
        [from]: Number(state.wallet[from] || 0) - debited_amount,
        [to]: Number(state.wallet[to] || 0) + amount,
        updated_at: nowIso(),
      };
      state.transactions = [
        {
          id: `${conversionRef}_credit`,
          coin_type: to,
          amount,
          reason: "Conversão de créditos",
          feature: "Conversão",
          ref_kind: "conversion",
          ref_id: conversionRef,
          meta: {
            financial_state: "reconciled",
            reconciliation_status: "reconciled",
            support_ref: conversionRef,
            converted_amount: amount,
            fee_amount,
            debited_amount,
            fee_percent: fee_percent,
            leg: "credit",
          },
          created_at: nowIso(),
        },
        {
          id: `${conversionRef}_debit`,
          coin_type: from,
          amount: -debited_amount,
          reason: "Conversão de créditos",
          feature: "Conversão",
          ref_kind: "conversion",
          ref_id: conversionRef,
          meta: {
            financial_state: "reconciled",
            reconciliation_status: "reconciled",
            support_ref: conversionRef,
            converted_amount: amount,
            fee_amount,
            debited_amount,
            fee_percent: fee_percent,
            leg: "debit",
          },
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

    if (path === "/api/beta-access/admin/requests" && method === "GET") {
      const statusFilter = String(url.searchParams.get("status") || "").trim();
      const items = state.betaAccessRequests.filter((item) => !statusFilter || item.status === statusFilter);
      await route.fulfill(json({ items }));
      return;
    }

    const betaAdminRequestMatch = path.match(/^\/api\/beta-access\/admin\/requests\/([^/]+)$/);
    if (betaAdminRequestMatch && method === "PATCH") {
      const body = parseJson(request);
      const nextStatus = String(body?.status || "pending");
      state.betaAccessRequests = state.betaAccessRequests.map((item) =>
        item.id === betaAdminRequestMatch[1]
          ? {
              ...item,
              status: nextStatus,
              admin_note: String(body?.admin_note || item.admin_note || ""),
              updated_at: nowIso(),
              approved_at: nextStatus === "approved" ? nowIso() : null,
            }
          : item
      );
      await route.fulfill(
        json({
          ok: true,
          email_notification:
            nextStatus === "approved"
              ? { sent: true, provider: "e2e" }
              : null,
        })
      );
      return;
    }

    if (path === "/api/admin/overview" && method === "GET") {
      await route.fulfill(
        json({
          ok: true,
          metrics: {
            total_users: 42,
            active_users: 17,
            open_support_requests: state.supportRequests.filter((item) => item.status !== "resolved").length,
            pending_beta_requests: state.betaAccessRequests.filter((item) => item.status === "pending").length,
          },
          usage: state.usageItems,
          plans: [
            { plan_code: "EDITOR_FREE", total: 18 },
            { plan_code: "EDITOR_PRO", total: 16 },
            { plan_code: "EDITOR_ULTRA", total: 8 },
          ],
        })
      );
      return;
    }

    if (path === "/api/status" && method === "GET") {
      await route.fulfill(
        json({
          ok: true,
          uptime_seconds: 86400,
          routing_defaults: {
            default_mode: "balanced",
            recommended_mode: "balanced",
          },
          metrics_snapshot: {
            total_usage_samples: 120,
            total_metrics_logged: 312,
          },
          internal_cost_totals: {
            global: {
              total_cost_score: 0.42,
            },
          },
        })
      );
      return;
    }

    if (path === "/api/dashboard/errors" && method === "GET") {
      await route.fulfill(
        json({
          items: [
            { error: "timeout", count: 2 },
            { error: "provider_unavailable", count: 1 },
          ],
        })
      );
      return;
    }

    if (path === "/api/dashboard/routing" && method === "GET") {
      await route.fulfill(
        json({
          modes: {
            balanced: 18,
            fast: 9,
            premium: 6,
          },
          providers: [
            { provider: "openai", count: 20 },
            { provider: "fallback", count: 4 },
          ],
        })
      );
      return;
    }

    if (path === "/api/events/recent" && method === "GET") {
      await route.fulfill(
        json({
          items: [
            { event: "auth.login.success", userId: "user_seed_1", plan: "EDITOR_PRO", timestamp: nowIso() },
            { event: "project.exported", userId: "user_seed_1", plan: "EDITOR_PRO", timestamp: nowIso() },
          ],
        })
      );
      return;
    }

    if (path === "/api/admin/users/search" && method === "GET") {
      const query = String(url.searchParams.get("q") || "").trim();
      await route.fulfill(
        json({
          items: query
            ? [
                {
                  id: "user_seed_1",
                  email: "qa@editorai.test",
                  full_name: "QA Editor",
                  plan_code: state.planCode,
                },
              ]
            : [],
        })
      );
      return;
    }

    const adminUserTimelineMatch = path.match(/^\/api\/admin\/user\/([^/]+)\/timeline$/);
    if (adminUserTimelineMatch && method === "GET") {
      await route.fulfill(
        json({
          items: [
            {
              id: `timeline_${adminUserTimelineMatch[1]}_1`,
              event: "project.saved",
              created_at: nowIso(),
              metadata: { projectId: "proj_1" },
            },
            {
              id: `timeline_${adminUserTimelineMatch[1]}_2`,
              event: "credits.converted",
              created_at: nowIso(),
              metadata: { from: "common", to: "pro" },
            },
          ],
        })
      );
      return;
    }

    await route.fulfill(json({ error: `e2e_unhandled_route:${method}:${path}` }, 501));
  });
}
