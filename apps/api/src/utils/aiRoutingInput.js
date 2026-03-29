export function normalizeRoutingMode(rawMode) {
  const mode = String(rawMode || "quality").trim().toLowerCase();
  if (mode === "economy" || mode === "manual") return mode;
  return "quality";
}

export function extractRoutingInput(body = {}) {
  const fromMultAi = body?.mult_ai && typeof body.mult_ai === "object" ? body.mult_ai : null;
  const fromMultAiCamel = body?.multAi && typeof body.multAi === "object" ? body.multAi : null;
  const fromRouting = body?.routing && typeof body.routing === "object" ? body.routing : null;
  const base = fromMultAi || fromMultAiCamel || fromRouting || {};
  const requestedObj =
    (base?.requested && typeof base.requested === "object" ? base.requested : null) ||
    (body?.requested && typeof body.requested === "object" ? body.requested : null) ||
    {};

  return {
    mode: normalizeRoutingMode(base?.mode || body?.ai_mode || body?.aiMode || body?.routing_mode),
    requested: {
      provider: requestedObj?.provider || body?.provider || null,
      model: requestedObj?.model || body?.model || null,
      tier: requestedObj?.tier || body?.model_tier || body?.modelTier || null,
    },
  };
}
