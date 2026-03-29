import express from "express";
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../utils/adminAuth.js";
import {
  stripe,
  getStripeWebhookSecret,
  getOrCreateStripeCustomer,
  isMissingStripeCustomersTableError,
} from "../utils/stripe.js";
import {
  assertValidPlanCode,
  getGrantForPlan,
  getPlanCatalog,
  getPlanCodeByPriceId,
  getPriceIdByPlanCode,
} from "../utils/stripePlans.js";
import { getPlansCatalog } from "../utils/plansCatalog.js";
import { logger } from "../utils/logger.js";
import { recordProductEvent } from "../utils/eventsStore.js";
import { resolveLang } from "../utils/i18n.js";

const router = express.Router();
const IS_DEV = process.env.NODE_ENV === "development";

function trackBillingEvent({ event, req, planCode = null, additional = {} }) {
  try {
    recordProductEvent({
      event,
      userId: req?.user?.id || null,
      plan: planCode || null,
      additional,
    });
  } catch {
    // telemetry should never block billing
  }
}

const HANDLED_TYPES = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const COIN_PACKAGE_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "payment_intent.succeeded",
]);

const CheckoutSchema = z.object({
  mode: z.enum(["subscription", "payment"]).default("subscription"),
  plan_code: z.string().min(1).optional(),
  price_id: z.string().min(1).optional(), // legacy
  success_url: z.string().url(),
  cancel_url: z.string().url(),
  quantity: z.coerce.number().int().positive().max(20).default(1),
  metadata: z.record(z.any()).optional(),
}).refine((value) => Boolean(value.plan_code || value.price_id), {
  message: "plan_code_or_price_id_required",
  path: ["plan_code"],
});

const PortalSchema = z.object({
  return_url: z.string().url().optional(),
  locale: z.string().min(2).optional(),
});

function isDuplicateError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("unique") || msg.includes("23505");
}

function isCoinsCreditReplayError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("duplicate") ||
    msg.includes("unique") ||
    msg.includes("uq_coins_idempotency") ||
    msg.includes("already processed") ||
    msg.includes("idempotent replay")
  );
}

function isMissingCoinsCreditV1Error(error) {
  const msg = String(error?.message || "").toLowerCase();
  return (
    msg.includes("coins_credit_v1") &&
    (msg.includes("could not find the function") ||
      msg.includes("function") && msg.includes("does not exist") ||
      msg.includes("schema cache"))
  );
}

function isMissingStripePlanGrantV1Error(error) {
  const code = String(error?.code || "").toUpperCase();
  const msg = String(error?.message || "").toLowerCase();
  if (code === "PGRST202" && msg.includes("stripe_plan_grant_v1")) return true;
  return (
    msg.includes("stripe_plan_grant_v1") &&
    (msg.includes("could not find the function") ||
      (msg.includes("function") && msg.includes("does not exist")) ||
      msg.includes("schema cache"))
  );
}

function isAmbiguousCoinsCreditV1Error(error) {
  const code = String(error?.code || "").toUpperCase();
  const msg = String(error?.message || "").toLowerCase();
  return (
    code === "PGRST203" &&
    msg.includes("coins_credit_v1") &&
    msg.includes("could not choose the best candidate function")
  );
}

function isMissingCoinPackageGrantV1Error(error) {
  const code = String(error?.code || "").toUpperCase();
  const msg = String(error?.message || "").toLowerCase();
  if (code === "PGRST202" && msg.includes("coin_package_grant_v1")) return true;
  return (
    msg.includes("coin_package_grant_v1") &&
    (msg.includes("could not find the function") ||
      (msg.includes("function") && msg.includes("does not exist")) ||
      msg.includes("schema cache"))
  );
}

function isCoinsCreditV1FallbackCandidateError(error) {
  if (isMissingCoinsCreditV1Error(error)) return true;
  if (String(error?.code || "").toUpperCase() === "PGRST203") {
    const ambiguousMsg = String(error?.message || "").toLowerCase();
    if (
      ambiguousMsg.includes("could not choose the best candidate function") &&
      ambiguousMsg.includes("coins_credit_v1")
    ) {
      return true;
    }
  }
  const msg = String(error?.message || "").toLowerCase();
  if (!msg) return false;
  if (
    msg.includes("relation") &&
    msg.includes("does not exist") &&
    (msg.includes("stripe_grants") || msg.includes("coins_transactions"))
  ) {
    return true;
  }
  if (
    msg.includes("column") &&
    msg.includes("does not exist") &&
    msg.includes("stripe_grants")
  ) {
    return true;
  }
  if (
    msg.includes("permission denied") &&
    (msg.includes("stripe_grants") || msg.includes("coins_transactions"))
  ) {
    return true;
  }
  return false;
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function idPrefix(value) {
  if (!value || typeof value !== "string") return null;
  return value.slice(0, 8);
}

function maskUser(value) {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortId(value) {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function classifyCheckoutSessionCreateError(error) {
  const message = String(error?.message || "");
  const normalized = message.toLowerCase();
  const code = String(error?.code || error?.raw?.code || "").toLowerCase();
  const type = String(error?.type || error?.rawType || "").toLowerCase();
  const param = String(error?.param || error?.raw?.param || "").toLowerCase();

  if (isMissingStripeCustomersTableError(error) || normalized.includes("stripe_customer_upsert_failed")) {
    return {
      status: 503,
      error: "stripe_customer_link_unavailable",
      reason: "stripe_customers_table_missing",
    };
  }

  if (normalized.includes("stripe_customer_lookup_failed")) {
    return {
      status: 503,
      error: "stripe_customer_link_unavailable",
      reason: "stripe_customer_lookup_failed",
    };
  }

  if (
    normalized.includes("no such price") ||
    (code === "resource_missing" && param.includes("line_items")) ||
    (type === "invalid_request_error" && param.includes("line_items"))
  ) {
    return {
      status: 400,
      error: "plan_unavailable",
      reason: "price_id_not_found_in_stripe",
    };
  }

  if (
    normalized.includes("invalid url") ||
    code === "url_invalid" ||
    param === "success_url" ||
    param === "cancel_url"
  ) {
    return {
      status: 400,
      error: "checkout_url_invalid",
      reason: "invalid_checkout_redirect_url",
    };
  }

  if (normalized.includes("invalid api key")) {
    return {
      status: 503,
      error: "stripe_not_configured",
      reason: "invalid_api_key",
    };
  }

  return {
    status: 500,
    error: "stripe_checkout_failed",
    reason: "session_create_failed",
  };
}

async function loadKnownStripeCustomerIdForUser(db, userId) {
  const fromCustomerMap = await db
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!fromCustomerMap.error && fromCustomerMap.data?.stripe_customer_id) {
    return fromCustomerMap.data.stripe_customer_id;
  }

  if (fromCustomerMap.error && !isMissingStripeCustomersTableError(fromCustomerMap.error)) {
    throw new Error(`stripe_customer_lookup_failed: ${fromCustomerMap.error.message}`);
  }

  const fromSubscription = await db
    .from("subscriptions")
    .select("stripe_customer_id,created_at")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fromSubscription.error) {
    throw new Error(`stripe_subscription_lookup_failed: ${fromSubscription.error.message}`);
  }

  return fromSubscription.data?.stripe_customer_id || null;
}


function allowedInvoiceBillingReason(value) {
  const reason = String(value || "").trim();
  return (
    reason === "subscription_cycle" ||
    reason === "subscription_create" ||
    reason === "subscription_update"
  );
}

function getDb() {
  return isSupabaseAdminEnabled() && supabaseAdmin ? supabaseAdmin : null;
}

function isDebugForceDbUnavailable(req) {
  if (!IS_DEV) return false;
  const byHeader = String(req.headers["x-debug-force-db-unavailable"] || "").trim() === "1";
  const byQuery = String(req.query?.debug_force_db_unavailable || "").trim() === "1";
  return byHeader || byQuery;
}

async function assertWebhookDbReady(db) {
  if (!db) return { ok: false, reason: "supabase_admin_unavailable" };
  try {
    const probe = await db.from("stripe_webhook_events").select("event_id").limit(1);
    if (probe.error) return { ok: false, reason: probe.error.message || "db_probe_failed" };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error?.message || "db_probe_failed" };
  }
}

function getDefaultReturnUrl() {
  const base = String(process.env.WEB_URL || process.env.WEB_APP_URL || "http://localhost:3001").replace(/\/+$/, "");
  return `${base}/dashboard`;
}

async function insertWebhookEvent(row) {
  const db = getDb();
  if (!db) return { ok: false };
  const { error } = await db.from("stripe_webhook_events").insert(row);
  if (error) return { ok: false, error };
  return { ok: true };
}

async function updateWebhookEvent(eventId, patch) {
  const db = getDb();
  if (!db) return;
  const { error } = await db.from("stripe_webhook_events").update(patch).eq("event_id", eventId);
  if (error) {
    logger.error("stripe_webhook_event_update_failed", { eventIdPrefix: idPrefix(eventId), status: "error", message: error.message });
  }
}

async function mapUserFromStripeCustomer(customerId) {
  const db = getDb();
  if (!db || !customerId) return null;
  const { data, error } = await db
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) {
    if (!isMissingStripeCustomersTableError(error)) {
      throw new Error(`stripe_customer_lookup_failed: ${error.message}`);
    }
  } else if (isUuid(data?.user_id)) {
    return data.user_id;
  }

  const fallback = await db
    .from("subscriptions")
    .select("user_id,created_at")
    .eq("stripe_customer_id", customerId)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback.error) {
    throw new Error(`stripe_customer_subscription_lookup_failed: ${fallback.error.message}`);
  }
  if (!isUuid(fallback.data?.user_id)) return null;
  return fallback.data.user_id;
}

async function mapUserFromStripeSubscription(subscriptionId) {
  const db = getDb();
  if (!db || !subscriptionId) return null;
  const { data, error } = await db
    .from("subscriptions")
    .select("user_id,created_at")
    .eq("stripe_subscription_id", subscriptionId)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`stripe_subscription_user_lookup_failed: ${error.message}`);
  }
  if (!isUuid(data?.user_id)) return null;
  return data.user_id;
}

async function ensureStripeCustomerLink({ userId, customerId, email = null }) {
  const db = getDb();
  if (!db || !isUuid(userId) || !customerId) return;

  const { error } = await db.from("stripe_customers").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_customer_id" }
  );
  if (error && isMissingStripeCustomersTableError(error)) {
    return;
  }
  if (error && !isDuplicateError(error)) {
    throw new Error(`stripe_customer_upsert_failed: ${error.message}`);
  }
}

async function resolveUserId(eventObject) {
  const fromMetadata = isUuid(eventObject?.metadata?.user_id) ? eventObject.metadata.user_id : null;
  if (fromMetadata) return fromMetadata;

  const fromClientRef = isUuid(eventObject?.client_reference_id) ? eventObject.client_reference_id : null;
  if (fromClientRef) return fromClientRef;

  const subscriptionId =
    (typeof eventObject?.subscription === "string" ? eventObject.subscription : null) ||
    (typeof eventObject?.parent?.subscription_details?.subscription === "string"
      ? eventObject.parent.subscription_details.subscription
      : null) ||
    (typeof eventObject?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription === "string"
      ? eventObject.lines.data[0].parent.subscription_item_details.subscription
      : null);
  if (subscriptionId) {
    const mappedFromSubscription = await mapUserFromStripeSubscription(subscriptionId);
    if (mappedFromSubscription) return mappedFromSubscription;
  }

  const customerId = typeof eventObject?.customer === "string" ? eventObject.customer : null;
  if (customerId) {
    const mapped = await mapUserFromStripeCustomer(customerId);
    if (mapped) return mapped;
  }

  return null;
}

async function extractCheckoutPriceId(session) {
  if (session?.metadata?.price_id) return session.metadata.price_id;
  const fromObj = session?.line_items?.data?.[0]?.price?.id || null;
  if (fromObj) return fromObj;
  if (!stripe || !session?.id) return null;
  try {
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    return lineItems?.data?.[0]?.price?.id || null;
  } catch {
    return null;
  }
}

function extractInvoicePriceId(invoice) {
  const lines = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  for (const line of lines) {
    const linePriceId =
      line?.price?.id ||
      line?.pricing?.price_details?.price ||
      line?.plan?.id ||
      null;
    if (linePriceId) return linePriceId;
  }
  return (
    invoice?.metadata?.price_id ||
    invoice?.parent?.subscription_details?.metadata?.price_id ||
    null
  );
}

function extractSubscriptionPriceId(subscription) {
  return subscription?.items?.data?.[0]?.price?.id || null;
}

function extractInvoiceSubscriptionId(invoice) {
  if (typeof invoice?.subscription === "string") return invoice.subscription;
  if (typeof invoice?.parent?.subscription_details?.subscription === "string") {
    return invoice.parent.subscription_details.subscription;
  }
  const lines = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  for (const line of lines) {
    const subscriptionId = line?.parent?.subscription_item_details?.subscription || null;
    if (typeof subscriptionId === "string" && subscriptionId) return subscriptionId;
  }
  return null;
}

function normalizePlanCodeOrNull(value) {
  try {
    return assertValidPlanCode(value);
  } catch {
    return null;
  }
}

async function resolvePlanCodeFromSubscriptionContext({ userId, subscriptionId }) {
  const db = getDb();

  if (db && subscriptionId) {
    const bySub = await db
      .from("subscriptions")
      .select("plan_code,created_at")
      .eq("stripe_subscription_id", subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bySub.error) {
      throw new Error(`subscription_plan_lookup_failed: ${bySub.error.message}`);
    }
    const normalizedBySub = normalizePlanCodeOrNull(bySub.data?.plan_code);
    if (normalizedBySub) return normalizedBySub;
  }

  if (db && userId) {
    const byUser = await db
      .from("subscriptions")
      .select("plan_code,status,created_at")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byUser.error) {
      throw new Error(`subscription_plan_user_lookup_failed: ${byUser.error.message}`);
    }
    const normalizedByUser = normalizePlanCodeOrNull(byUser.data?.plan_code);
    if (normalizedByUser) return normalizedByUser;
  }

  if (stripe && subscriptionId) {
    try {
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = extractSubscriptionPriceId(stripeSubscription);
      return priceId ? getPlanCodeByPriceId(priceId) : null;
    } catch (error) {
      logger.warn("stripe_subscription_plan_resolve_failed", {
        subscriptionIdPrefix: idPrefix(subscriptionId),
        message: error?.message || String(error),
      });
    }
  }

  return null;
}

let runtimePlansEnsured = false;

function runtimePlanCatalogRows() {
  return [
    {
      code: "EDITOR_FREE",
      name: "Iniciante",
      tier: 1,
      features: { family: "editor_ai_creator", alias_of: "INICIANTE" },
    },
    {
      code: "EDITOR_PRO",
      name: "Editor Pro",
      tier: 2,
      features: { family: "editor_ai_creator" },
    },
    {
      code: "EDITOR_ULTRA",
      name: "Creator Pro",
      tier: 3,
      features: { family: "editor_ai_creator", alias_of: "CREATOR_PRO" },
    },
    {
      code: "ENTERPRISE",
      name: "Empresarial",
      tier: 4,
      features: { family: "editor_ai_creator", alias_of: "EMPRESARIAL" },
    },
  ];
}

async function ensureRuntimePlanRows(db) {
  if (runtimePlansEnsured) return;
  const rows = runtimePlanCatalogRows();
  const { error } = await db.from("plans").upsert(rows, { onConflict: "code" });
  if (error) {
    throw new Error(`plans_runtime_seed_failed: ${error.message}`);
  }
  runtimePlansEnsured = true;
}

async function upsertSubscription({
  userId,
  planCode,
  status,
  stripeSubscriptionId = null,
  stripeCustomerId = null,
  currentPeriodStart = null,
  currentPeriodEnd = null,
  cancelAtPeriodEnd = false,
}) {
  const db = getDb();
  if (!db || !userId) return;
  await ensureRuntimePlanRows(db);

  const payload = {
    user_id: userId,
    plan_code: planCode,
    status,
    stripe_subscription_id: stripeSubscriptionId,
    stripe_customer_id: stripeCustomerId,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
  };

  if (stripeSubscriptionId) {
    const currentBySub = await db
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();
    if (currentBySub.data?.id) {
      const { error } = await db.from("subscriptions").update(payload).eq("id", currentBySub.data.id);
      if (error) throw new Error(`subscription_update_failed: ${error.message}`);
      return;
    }
  }

  const currentByUser = await db
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentByUser.data?.id) {
    const { error } = await db.from("subscriptions").update(payload).eq("id", currentByUser.data.id);
    if (error) throw new Error(`subscription_update_failed: ${error.message}`);
    return;
  }

  const { error } = await db.from("subscriptions").insert(payload);
  if (error) throw new Error(`subscription_insert_failed: ${error.message}`);
}

async function listStripeSubscriptions(customerId) {
  if (!stripe || !customerId) return [];
  const response = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });
  return Array.isArray(response?.data) ? response.data : [];
}

function chooseRelevantSubscription(subscriptions) {
  const priorities = {
    active: 0,
    trialing: 1,
    past_due: 2,
    unpaid: 3,
  };
  return subscriptions
    .filter((s) => Object.prototype.hasOwnProperty.call(priorities, s.status))
    .sort((a, b) => priorities[a.status] - priorities[b.status])[0] || null;
}

async function grantCoinsForPlan({ userId, planCode, kind, eventId }) {
  const grants = getGrantForPlan(planCode, kind);
  if (!grants.common && !grants.pro && !grants.ultra) {
    return { status: "skipped_zero_grant" };
  }

  const db = getDb();
  if (!db) throw new Error("supabase_admin_disabled");

  const rpcPayload = {
    p_user_id: userId,
    p_common: Number(grants.common || 0),
    p_pro: Number(grants.pro || 0),
    p_ultra: Number(grants.ultra || 0),
    p_source_event_id: eventId,
    p_meta: {
      provider: "stripe",
      kind,
      plan_code: planCode,
      event_type: "stripe_plan_grant",
    },
  };

  let data = null;
  let error = null;
  let grantRpcPath = "rpc:stripe_plan_grant_v1";

  const primary = await db.rpc("stripe_plan_grant_v1", rpcPayload);
  data = primary.data;
  error = primary.error;

  if (error && isMissingStripePlanGrantV1Error(error)) {
    grantRpcPath = "rpc:coins_credit_v1";
    const fallback = await db.rpc("coins_credit_v1", {
      ...rpcPayload,
      p_feature: "stripe_fulfillment",
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isAmbiguousCoinsCreditV1Error(error)) {
      throw new Error(`coins_credit_v1_ambiguous_signature: ${error.message}`);
    }
    throw new Error(`${grantRpcPath}_failed: ${error.message}`);
  }

  const rpcStatus = String(data?.status || "ok");
  return {
    status: rpcStatus === "replay" ? "replay" : "granted",
    grants,
    result: data,
    rpcStatus,
    grantRpcPath,
  };
}

function toIntegerOrNull(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function normalizeCurrency(value) {
  const raw = String(value || "").trim().toUpperCase();
  return raw || null;
}

function isEnterprisePurchaseMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  if (isUuid(metadata.enterprise_order_id)) return true;
  return String(metadata.purchase_kind || "").trim().toLowerCase() === "enterprise_credits";
}

function isCoinPackageMixMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  return String(metadata.purchase_kind || "").trim().toLowerCase() === "coin_package_mix";
}

function isRelevantCoinPackageEvent(eventType, eventObject) {
  return COIN_PACKAGE_EVENT_TYPES.has(String(eventType || "")) &&
    isCoinPackageMixMetadata(eventObject?.metadata || {});
}

function parseMetadataQuantity(metadata, key) {
  const raw = Number(metadata?.[key] || 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.trunc(raw));
}

function parseMetadataMoney(metadata, key) {
  const raw = Number(metadata?.[key]);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.trunc(raw));
}

function parseCoinPackageBreakdownFromObject(value) {
  const breakdown = value && typeof value === "object" ? value : {};
  return {
    common: parseMetadataQuantity(breakdown, "common"),
    pro: parseMetadataQuantity(breakdown, "pro"),
    ultra: parseMetadataQuantity(breakdown, "ultra"),
  };
}

function buildMetadataTotals(eventType, eventObject, metadata) {
  const stripeTotalCents =
    eventType === "payment_intent.succeeded"
      ? toIntegerOrNull(eventObject?.amount_received ?? eventObject?.amount)
      : toIntegerOrNull(eventObject?.amount_total);
  return {
    subtotal_cents: parseMetadataMoney(metadata, "subtotal_cents") ?? parseMetadataMoney(metadata, "subtotal_base"),
    fee_cents: parseMetadataMoney(metadata, "fee_cents") ?? parseMetadataMoney(metadata, "fees_total"),
    total_cents: parseMetadataMoney(metadata, "total_cents") ?? parseMetadataMoney(metadata, "total_amount"),
    stripe_total_cents: stripeTotalCents,
  };
}

async function processCoinPackageWebhookEvent({ eventId, eventType, eventObject }) {
  if (eventType !== "checkout.session.completed" && eventType !== "payment_intent.succeeded") {
    return { handled: false };
  }

  const db = getDb();
  if (!db) throw new Error("supabase_admin_disabled");

  const metadata = eventObject?.metadata && typeof eventObject.metadata === "object" ? eventObject.metadata : {};
  const metadataIsCoinPackage = isCoinPackageMixMetadata(metadata);
  let sessionId = eventType === "checkout.session.completed" && typeof eventObject?.id === "string" ? eventObject.id : null;
  let paymentIntentId =
    eventType === "payment_intent.succeeded"
      ? (typeof eventObject?.id === "string" ? eventObject.id : null)
      : (typeof eventObject?.payment_intent === "string" ? eventObject.payment_intent : null);
  const quoteId = typeof metadata?.quote_id === "string" ? metadata.quote_id : null;
  const metadataTotals = buildMetadataTotals(eventType, eventObject, metadata);
  const metadataSanity = {
    metadata_total_consistent:
      metadataTotals.subtotal_cents == null ||
      metadataTotals.fee_cents == null ||
      metadataTotals.total_cents == null ||
      metadataTotals.subtotal_cents + metadataTotals.fee_cents === metadataTotals.total_cents,
  };

  let quoteRow = null;
  let source = "metadata";
  let quoteLookupFailure = null;
  const coinPackageQuoteSelect =
    "quote_id,user_id,package_total,breakdown,pricing,used_at,checkout_session_id,payment_intent_id";

  async function readQuote(whereKey, whereValue) {
    if (!whereValue) return null;
    const { data, error } = await db
      .schema("public")
      .from("coin_package_quotes")
      .select(coinPackageQuoteSelect)
      .eq(whereKey, whereValue)
      .maybeSingle();
    if (error) {
      quoteLookupFailure = error;
      logger.warn("stripe_webhook_coin_package_quote_lookup_failed", {
        eventIdPrefix: idPrefix(eventId),
        eventType,
        lookup: whereKey,
        quoteId: shortId(quoteId),
        sessionId: shortId(sessionId),
        paymentIntentId: shortId(paymentIntentId),
        message: error.message,
      });
      return null;
    }
    return data || null;
  }

  if (isUuid(quoteId)) {
    quoteRow = await readQuote("quote_id", quoteId);
  }
  if (!quoteRow && eventType === "checkout.session.completed" && sessionId) {
    quoteRow = await readQuote("checkout_session_id", sessionId);
  }
  if (!quoteRow && eventType === "payment_intent.succeeded" && paymentIntentId) {
    quoteRow = await readQuote("payment_intent_id", paymentIntentId);
  }
  if (!quoteRow && quoteLookupFailure && (quoteId || sessionId || paymentIntentId)) {
    throw new Error(`coin_package_quote_lookup_failed: ${quoteLookupFailure.message || "unknown"}`);
  }
  if (!quoteRow && !metadataIsCoinPackage) {
    return { handled: false };
  }
  if (quoteRow) {
    source = "db";
  }
  const quoteUserExistsInAuthUsers = quoteRow?.user_id ? true : null;
  if (!sessionId && quoteRow?.checkout_session_id) {
    sessionId = String(quoteRow.checkout_session_id);
  }
  if (!paymentIntentId && quoteRow?.payment_intent_id) {
    paymentIntentId = String(quoteRow.payment_intent_id);
  }
  const quoteStableId = quoteRow?.quote_id || quoteId || null;
  const dedupeStableId =
    (quoteRow?.checkout_session_id ? String(quoteRow.checkout_session_id) : null) ||
    sessionId ||
    (quoteRow?.payment_intent_id ? String(quoteRow.payment_intent_id) : null) ||
    paymentIntentId ||
    quoteStableId ||
    eventId ||
    "unknown_event";
  const dedupeKey = `coin_package_mix:${dedupeStableId}`;

  const metadataUserId = isUuid(metadata.user_id) ? metadata.user_id : null;
  let userId = quoteRow && isUuid(quoteRow.user_id) ? quoteRow.user_id : null;
  if (userId && metadataUserId && metadataUserId !== userId) {
    logger.warn("stripe_webhook_coin_package_user_mismatch", {
      eventIdPrefix: idPrefix(eventId),
      quoteId: shortId(quoteStableId),
      sessionId: shortId(sessionId),
      metadataUserId: maskUser(metadataUserId),
      quoteUserId: maskUser(userId),
    });
  }

  const customerId = typeof eventObject?.customer === "string" ? eventObject.customer : null;
  if (!userId && metadataUserId) {
    userId = metadataUserId;
  }
  if (!userId && isUuid(eventObject?.client_reference_id)) {
    userId = eventObject.client_reference_id;
  }
  if (!userId && customerId) {
    const mapped = await mapUserFromStripeCustomer(customerId);
    if (mapped) userId = mapped;
  }
  if (!userId) {
    return {
      handled: true,
      processed: false,
      reason: "coin_package_invalid_user",
      userId: null,
      sessionId,
      paymentIntentId,
      quoteId: quoteStableId,
      source,
      totals: {
        ...metadataTotals,
        quote_total_cents: null,
      },
      sanity: {
        ...metadataSanity,
        stripe_total_matches_quote: null,
      },
      skippedReason: "missing_user",
      dedupeStatus: "ignored",
      grantStatus: "skipped",
      foundQuote: Boolean(quoteRow),
      quoteUserId: quoteRow?.user_id || null,
      quoteUserExistsInAuthUsers,
      resolvedUserId: null,
      grantAttempted: false,
      grantResult: "skipped",
      grantCallPath: "none",
      dedupeKey,
      errorCode: "missing_user",
      errorMessageShort: "missing_user",
    };
  }

  const isPaid =
    eventType === "payment_intent.succeeded"
      ? String(eventObject?.status || "").toLowerCase() === "succeeded"
      : String(eventObject?.payment_status || "").toLowerCase() === "paid";
  if (!isPaid) {
    return {
      handled: true,
      processed: false,
      reason: "coin_package_payment_not_paid",
      userId,
      sessionId,
      paymentIntentId,
      quoteId: quoteStableId,
      source,
      totals: {
        ...metadataTotals,
        quote_total_cents: quoteRow ? toIntegerOrNull(quoteRow?.pricing?.total_amount ?? quoteRow?.pricing?.total_cents) : null,
      },
      sanity: {
        ...metadataSanity,
        stripe_total_matches_quote: null,
      },
      skippedReason: "payment_not_paid",
      dedupeStatus: "ignored",
      grantStatus: "skipped",
      foundQuote: Boolean(quoteRow),
      quoteUserId: quoteRow?.user_id || null,
      quoteUserExistsInAuthUsers,
      resolvedUserId: userId,
      grantAttempted: false,
      grantResult: "skipped",
      grantCallPath: "none",
      dedupeKey,
      errorCode: "payment_not_paid",
      errorMessageShort: "payment_not_paid",
    };
  }

  const quoteBreakdown = quoteRow ? parseCoinPackageBreakdownFromObject(quoteRow.breakdown) : null;
  const fallbackMetadataBreakdown = {
    common: parseMetadataQuantity(metadata, "breakdown_common"),
    pro: parseMetadataQuantity(metadata, "breakdown_pro"),
    ultra: parseMetadataQuantity(metadata, "breakdown_ultra"),
  };
  const breakdown = quoteBreakdown || fallbackMetadataBreakdown;
  const common = breakdown.common;
  const pro = breakdown.pro;
  const ultra = breakdown.ultra;
  const quoteTotalCents = quoteRow ? toIntegerOrNull(quoteRow?.pricing?.total_amount ?? quoteRow?.pricing?.total_cents) : null;
  const totals = {
    ...metadataTotals,
    quote_total_cents: quoteTotalCents,
  };
  const sanity = {
    ...metadataSanity,
    stripe_total_matches_quote:
      quoteTotalCents == null || totals.stripe_total_cents == null || quoteTotalCents === totals.stripe_total_cents,
    stripe_total_matches_metadata:
      totals.total_cents == null || totals.stripe_total_cents == null || totals.total_cents === totals.stripe_total_cents,
  };

  const checkoutMismatch =
    Boolean(quoteRow?.checkout_session_id) && Boolean(sessionId) && String(quoteRow.checkout_session_id) !== String(sessionId);
  const paymentIntentMismatch =
    Boolean(quoteRow?.payment_intent_id) && Boolean(paymentIntentId) && String(quoteRow.payment_intent_id) !== String(paymentIntentId);

  if (checkoutMismatch || paymentIntentMismatch) {
    const mismatchReason = checkoutMismatch ? "checkout_session_mismatch" : "payment_intent_mismatch";
    if (quoteRow?.used_at) {
      return {
        handled: true,
        processed: true,
        replay: true,
        reason: `coin_package_${mismatchReason}_replay`,
        userId,
        sessionId,
        paymentIntentId,
        quoteId: quoteStableId,
        source,
        totals,
        sanity,
        breakdown,
        skippedReason: mismatchReason,
        dedupeStatus: "replay",
        grantStatus: "replay",
        grants: breakdown,
        foundQuote: Boolean(quoteRow),
        quoteUserId: quoteRow?.user_id || null,
        quoteUserExistsInAuthUsers,
        resolvedUserId: userId,
        grantAttempted: false,
        grantResult: "replay",
        grantCallPath: "none",
        dedupeKey,
        errorCode: null,
        errorMessageShort: null,
      };
    }
    return {
      handled: true,
      processed: false,
      reason: `coin_package_${mismatchReason}`,
      userId,
      sessionId,
      paymentIntentId,
      quoteId: quoteStableId,
      source,
      totals,
      sanity,
      breakdown,
      skippedReason: mismatchReason,
      dedupeStatus: "ignored",
      grantStatus: "skipped",
      foundQuote: Boolean(quoteRow),
      quoteUserId: quoteRow?.user_id || null,
      quoteUserExistsInAuthUsers,
      resolvedUserId: userId,
      grantAttempted: false,
      grantResult: "skipped",
      grantCallPath: "none",
      dedupeKey,
      errorCode: mismatchReason,
      errorMessageShort: mismatchReason,
    };
  }

  if (quoteRow?.used_at) {
    return {
      handled: true,
      processed: true,
      replay: true,
      reason: "coin_package_already_granted",
      userId,
      sessionId,
      paymentIntentId,
      quoteId: quoteStableId,
      source,
      totals,
      sanity,
      breakdown,
      skippedReason: null,
      dedupeStatus: "replay",
      grantStatus: "replay",
      grants: breakdown,
      foundQuote: Boolean(quoteRow),
      quoteUserId: quoteRow?.user_id || null,
      quoteUserExistsInAuthUsers,
      resolvedUserId: userId,
      grantAttempted: false,
      grantResult: "replay",
      grantCallPath: "none",
      dedupeKey,
      errorCode: null,
      errorMessageShort: null,
    };
  }

  if (common + pro + ultra <= 0) {
    return {
      handled: true,
      processed: false,
      reason: "coin_package_invalid_breakdown",
      userId,
      sessionId,
      paymentIntentId,
      quoteId,
      source,
      totals,
      sanity,
      breakdown,
      skippedReason: quoteRow ? "invalid_quote_breakdown" : "missing_quote_and_metadata_breakdown",
      dedupeStatus: "ignored",
      grantStatus: "skipped",
      foundQuote: Boolean(quoteRow),
      quoteUserId: quoteRow?.user_id || null,
      quoteUserExistsInAuthUsers,
      resolvedUserId: userId,
      grantAttempted: false,
      grantResult: "skipped",
      grantCallPath: "none",
      dedupeKey,
      errorCode: "invalid_breakdown",
      errorMessageShort: quoteRow ? "invalid_quote_breakdown" : "missing_quote_and_metadata_breakdown",
    };
  }

  const stableSessionId = sessionId || quoteRow?.checkout_session_id || null;
  const sourceEventId = dedupeKey;
  let grantCallPath = "rpc:coin_package_grant_v1";
  let grantData = null;
  let grantError = null;

  const grantMeta = {
    provider: "stripe",
    kind: "package_mix",
    source,
    stripe_checkout_session_id: sessionId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_event_id: eventId || null,
    package_total: quoteRow ? toIntegerOrNull(quoteRow.package_total) ?? parseMetadataQuantity(metadata, "package_total") : parseMetadataQuantity(metadata, "package_total"),
    quote_id: quoteStableId,
    totals,
    sanity,
  };

  const grantRpcVariants = [
    {
      path: "rpc:coin_package_grant_v1",
      payload: {
        p_user_id: userId,
        p_common: common,
        p_pro: pro,
        p_ultra: ultra,
        p_source_event_id: sourceEventId,
        p_meta: grantMeta,
      },
    },
    {
      path: "rpc:coin_package_grant_v1(feature)",
      payload: {
        p_user_id: userId,
        p_common: common,
        p_pro: pro,
        p_ultra: ultra,
        p_source_event_id: sourceEventId,
        p_feature: "coins_package_checkout",
        p_meta: grantMeta,
      },
    },
    {
      path: "rpc:coin_package_grant_v1(source_type)",
      payload: {
        p_user_id: userId,
        p_common: common,
        p_pro: pro,
        p_ultra: ultra,
        p_source_event_id: sourceEventId,
        p_source_type: "stripe_event",
        p_meta: grantMeta,
      },
    },
    {
      path: "rpc:coin_package_grant_v1(feature+source_type)",
      payload: {
        p_user_id: userId,
        p_common: common,
        p_pro: pro,
        p_ultra: ultra,
        p_source_event_id: sourceEventId,
        p_feature: "coins_package_checkout",
        p_source_type: "stripe_event",
        p_meta: grantMeta,
      },
    },
  ];

  for (const variant of grantRpcVariants) {
    const grantV1 = await db.rpc("coin_package_grant_v1", variant.payload);
    grantData = grantV1.data;
    grantError = grantV1.error;
    grantCallPath = variant.path;
    if (!grantError) break;
    if (!isMissingCoinPackageGrantV1Error(grantError)) break;
  }

  if (grantError && isCoinsCreditV1FallbackCandidateError(grantError)) {
    grantCallPath = "rpc:coins_credit (fallback)";
    let fallbackHadOk = false;
    let fallbackHadNoop = false;
    const fallbackItems = [
      { coinType: "common", amount: common },
      { coinType: "pro", amount: pro },
      { coinType: "ultra", amount: ultra },
    ].filter((item) => item.amount > 0);

    for (const item of fallbackItems) {
      const fallbackIdemKey = `${sourceEventId}:${item.coinType}`;
      const legacyGrant = await db.rpc("coins_credit", {
        p_user_id: userId,
        p_coin_type: item.coinType,
        p_amount: item.amount,
        p_reason: "stripe_grant",
        p_feature: "coins_package_checkout",
        p_ref_kind: "stripe_event",
        p_ref_id: sourceEventId,
        p_idempotency_key: fallbackIdemKey,
        p_meta: grantMeta,
      });
      if (legacyGrant.error) {
        grantError = legacyGrant.error;
        grantData = null;
        break;
      }
      const legacyStatus = String(legacyGrant?.data?.status || "ok").toLowerCase();
      if (legacyStatus === "noop") fallbackHadNoop = true;
      else fallbackHadOk = true;
      grantError = null;
      grantData = legacyGrant.data;
    }

    if (!grantError && !grantData) {
      grantData = {
        status: fallbackHadOk ? "ok" : (fallbackHadNoop ? "replay" : "noop"),
        delta: { common, pro, ultra },
      };
    }
  }

  if (grantError) {
    if (isCoinsCreditReplayError(grantError)) {
      return {
        handled: true,
        processed: true,
        replay: true,
        reason: "coin_package_already_granted",
        userId,
        grants: { common, pro, ultra },
        grantStatus: "replay",
        sessionId,
        paymentIntentId,
        quoteId: quoteStableId,
        source,
        totals,
        sanity,
        breakdown: { common, pro, ultra },
        skippedReason: null,
        dedupeStatus: "replay",
        foundQuote: Boolean(quoteRow),
        quoteUserId: quoteRow?.user_id || null,
        quoteUserExistsInAuthUsers,
        resolvedUserId: userId,
        grantAttempted: true,
        grantResult: "replay",
        grantCallPath,
        dedupeKey,
        errorCode: null,
        errorMessageShort: null,
      };
    }
    logger.error("stripe_webhook_coin_package_grant_failed", {
      eventIdPrefix: idPrefix(eventId),
      eventType,
      sessionId: shortId(stableSessionId),
      paymentIntentId: shortId(paymentIntentId),
      quoteId: shortId(quoteId),
      foundQuote: Boolean(quoteRow),
      quoteUserId: maskUser(quoteRow?.user_id || null),
      resolvedUserId: maskUser(userId),
      source,
      dedupeStatus: "error",
      grantAttempted: true,
      grantResult: "error",
      grantCallPath,
      dedupeKey,
      errorCode: grantError?.code || null,
      errorMessageShort: String(grantError?.message || "coins_credit_failed").slice(0, 220),
      breakdown: { common, pro, ultra },
      totals,
      sanity,
    });
    throw new Error(`coins_credit_package_mix_failed: ${grantError.message}`);
  }

  if (quoteRow && isUuid(quoteRow.quote_id)) {
    const { error: quoteUpdateError } = await db
      .schema("public")
      .from("coin_package_quotes")
      .update({
        used_at: new Date().toISOString(),
        checkout_session_id: sessionId || quoteRow.checkout_session_id || null,
        payment_intent_id: paymentIntentId || quoteRow.payment_intent_id || null,
      })
      .eq("quote_id", quoteRow.quote_id);
    if (quoteUpdateError) {
      logger.warn("stripe_webhook_coin_package_quote_update_failed", {
        eventIdPrefix: idPrefix(eventId),
        quoteId: shortId(quoteRow.quote_id),
        sessionId: shortId(sessionId),
        message: quoteUpdateError.message,
      });
    }
  }

  return {
    handled: true,
    processed: true,
    reason: null,
    userId,
    grants: { common, pro, ultra },
    grantStatus: String(grantData?.status || "granted"),
    sessionId,
    paymentIntentId,
    quoteId: quoteStableId,
    source,
    totals,
    sanity,
    breakdown: { common, pro, ultra },
    skippedReason: null,
    dedupeStatus: "granted",
    foundQuote: Boolean(quoteRow),
    quoteUserId: quoteRow?.user_id || null,
    quoteUserExistsInAuthUsers,
    resolvedUserId: userId,
    grantAttempted: true,
    grantResult: String(grantData?.status || "granted"),
    grantCallPath,
    dedupeKey,
    errorCode: null,
    errorMessageShort: null,
  };
}

async function findEnterpriseOrder({ orderId = null, sessionId = null, paymentIntentId = null } = {}) {
  const db = getDb();
  if (!db) return null;

  if (isUuid(orderId)) {
    const byId = await db.from("enterprise_orders").select("*").eq("id", orderId).maybeSingle();
    if (!byId.error && byId.data) return byId.data;
  }

  if (sessionId) {
    const bySession = await db
      .from("enterprise_orders")
      .select("*")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (!bySession.error && bySession.data) return bySession.data;
  }

  if (paymentIntentId) {
    const byPaymentIntent = await db
      .from("enterprise_orders")
      .select("*")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (!byPaymentIntent.error && byPaymentIntent.data) return byPaymentIntent.data;
  }

  return null;
}

async function patchEnterpriseOrder(orderId, patch) {
  const db = getDb();
  if (!db || !isUuid(orderId) || !patch || typeof patch !== "object") return;
  await db.from("enterprise_orders").update(patch).eq("id", orderId);
}

function extractEnterpriseAmounts(eventType, eventObject) {
  if (eventType === "checkout.session.completed") {
    return {
      amountTotal: toIntegerOrNull(eventObject?.amount_total),
      currency: normalizeCurrency(eventObject?.currency),
      sessionId: typeof eventObject?.id === "string" ? eventObject.id : null,
      paymentIntentId: typeof eventObject?.payment_intent === "string" ? eventObject.payment_intent : null,
      isPaid: String(eventObject?.payment_status || "").toLowerCase() === "paid",
    };
  }
  if (eventType === "payment_intent.succeeded") {
    return {
      amountTotal: toIntegerOrNull(eventObject?.amount_received ?? eventObject?.amount),
      currency: normalizeCurrency(eventObject?.currency),
      sessionId: null,
      paymentIntentId: typeof eventObject?.id === "string" ? eventObject.id : null,
      isPaid: true,
    };
  }
  return {
    amountTotal: null,
    currency: null,
    sessionId: null,
    paymentIntentId: null,
    isPaid: false,
  };
}

async function processEnterpriseWebhookEvent({ eventId, eventType, eventObject }) {
  if (eventType !== "checkout.session.completed" && eventType !== "payment_intent.succeeded") {
    return { handled: false };
  }

  const metadata = eventObject?.metadata && typeof eventObject.metadata === "object" ? eventObject.metadata : {};
  const metadataOrderId = isUuid(metadata.enterprise_order_id) ? metadata.enterprise_order_id : null;
  const metadataLooksEnterprise = isEnterprisePurchaseMetadata(metadata);

  const amounts = extractEnterpriseAmounts(eventType, eventObject);
  const order = await findEnterpriseOrder({
    orderId: metadataOrderId,
    sessionId: amounts.sessionId,
    paymentIntentId: amounts.paymentIntentId,
  });

  if (!order) {
    if (eventType === "payment_intent.succeeded") {
      return {
        handled: true,
        processed: false,
        reason: "payment_intent_not_enterprise",
        userId: null,
      };
    }
    if (!metadataLooksEnterprise) {
      return { handled: false };
    }
    return {
      handled: true,
      processed: false,
      reason: "enterprise_order_not_found",
      userId: null,
    };
  }

  const expectedTotal = toIntegerOrNull(order.total_cents);
  const expectedCurrency = normalizeCurrency(order.currency);
  const actualCurrency = amounts.currency;
  const actualTotal = amounts.amountTotal;

  if (actualTotal == null || expectedTotal == null || actualTotal !== expectedTotal) {
    await patchEnterpriseOrder(order.id, {
      status: "failed",
      updated_at: new Date().toISOString(),
    });
    return {
      handled: true,
      processed: false,
      reason: "enterprise_amount_mismatch",
      userId: order.user_id,
      orderId: order.id,
    };
  }

  if (expectedCurrency && actualCurrency && expectedCurrency !== actualCurrency) {
    await patchEnterpriseOrder(order.id, {
      status: "failed",
      updated_at: new Date().toISOString(),
    });
    return {
      handled: true,
      processed: false,
      reason: "enterprise_currency_mismatch",
      userId: order.user_id,
      orderId: order.id,
    };
  }

  if (!amounts.isPaid) {
    return {
      handled: true,
      processed: false,
      reason: "enterprise_payment_not_paid",
      userId: order.user_id,
      orderId: order.id,
    };
  }

  await patchEnterpriseOrder(order.id, {
    stripe_checkout_session_id: amounts.sessionId || order.stripe_checkout_session_id,
    stripe_payment_intent_id: amounts.paymentIntentId || order.stripe_payment_intent_id,
    status: order.status === "paid" ? "paid" : "pending",
    updated_at: new Date().toISOString(),
  });

  const db = getDb();
  if (!db) throw new Error("supabase_admin_disabled");

  const sourceEventId = `enterprise_order:${order.id}:grant`;
  const { data, error } = await db.rpc("enterprise_credit_grant_v1", {
    p_order_id: order.id,
    p_source_event_id: sourceEventId,
    p_payment_intent_id: amounts.paymentIntentId,
    p_meta: {
      provider: "stripe",
      event_type: eventType,
      stripe_event_id: eventId,
      stripe_checkout_session_id: amounts.sessionId || order.stripe_checkout_session_id,
      stripe_payment_intent_id: amounts.paymentIntentId || order.stripe_payment_intent_id,
    },
  });
  if (error) throw new Error(`enterprise_credit_grant_v1_failed: ${error.message}`);

  return {
    handled: true,
    processed: true,
    reason: null,
    userId: order.user_id,
    orderId: order.id,
    grantStatus: String(data?.status || "ok"),
  };
}

async function markIgnored(eventId, reason) {
  await updateWebhookEvent(eventId, {
    status: "ignored",
    processed_at: new Date().toISOString(),
    error: reason,
  });
}

async function markIgnoredForUser(eventId, userId, reason) {
  await updateWebhookEvent(eventId, {
    status: "ignored",
    processed_at: new Date().toISOString(),
    error: reason,
    user_id: userId || null,
  });
}

router.get("/plans", authMiddleware, async (req, res) => {
  const lang = resolveLang(req);
  const catalog = getPlansCatalog(lang);
  const stripeCatalogByCode = new Map(
    Object.values(getPlanCatalog()).map((row) => [String(row.plan_code || "").toUpperCase(), row])
  );
  const plans = (Array.isArray(catalog?.plans) ? catalog.plans : [])
    .filter((plan) => {
      const code = String(plan?.code || "").toUpperCase();
      if (code === "FREE" || code === "ENTERPRISE") return false;
      return true;
    })
    .map((plan) => {
      const code = String(plan?.code || "").toUpperCase();
      const stripePlan = stripeCatalogByCode.get(code) || null;
      const badgeLabel =
        plan?.badge_label && typeof plan.badge_label === "object"
          ? plan.badge_label
          : code === "EDITOR_PRO"
            ? { "pt-BR": "Mais popular", "en-US": "Most popular" }
            : { "pt-BR": null, "en-US": null };

      return {
        plan_code: code,
        name: plan?.name || code,
        price_id: stripePlan?.price_id || null,
        enabled: Boolean(stripePlan?.price_id) && plan?.purchasable !== false,
        visible: plan?.visible !== false,
        highlight: plan?.highlight || stripePlan?.highlight || null,
        badge_label: badgeLabel,
        price: plan?.price || null,
        credits: plan?.credits || null,
        credits_public_name: plan?.credits_public_name || null,
        credits_short_name: plan?.credits_short_name || null,
        credits_total: plan?.credits_total ?? null,
        credits_value_breakdown_brl: plan?.credits_value_breakdown_brl || null,
        credits_value_brl: plan?.credits_value_brl ?? null,
        features: Array.isArray(plan?.features) ? plan.features : [],
        quality_tier: plan?.quality_tier || null,
        providers_by_feature: plan?.providers_by_feature || null,
        monthly_usage_limits: plan?.monthly_usage_limits || null,
        commerce: plan?.commerce || null,
        availability: plan?.availability || null,
        public_status: plan?.public_status || null,
        runtime_rules: plan?.runtime_rules || null,
        honesty_notes: plan?.honesty_notes || [],
        short_description: plan?.short_description || null,
        expanded_description: plan?.expanded_description || null,
        stripe_description: plan?.stripe_description || null,
        audience: plan?.audience || null,
        highlights: plan?.highlights || [],
        limits_summary: plan?.limits_summary || [],
        status_note: plan?.status_note || null,
        limits: plan?.limits || null,
        addons: plan?.addons || null,
        coming_soon: plan?.coming_soon === true,
        purchasable: plan?.purchasable !== false,
      };
    });
  return res.json({ ok: true, plans });
});

router.post("/checkout/session", express.json({ limit: "1mb" }), authMiddleware, async (req, res) => {
  if (!stripe || !getDb()) {
    return res.status(503).json({ error: "stripe_not_configured" });
  }

  const parsed = CheckoutSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const body = parsed.data;
  let planCode;
  try {
    if (body.plan_code) {
      planCode = assertValidPlanCode(body.plan_code);
    } else if (body.price_id) {
      planCode = getPlanCodeByPriceId(body.price_id);
      if (!planCode) {
        return res.status(400).json({ error: "invalid_plan_code" });
      }
    }
  } catch {
    return res.status(400).json({ error: "invalid_plan_code" });
  }

  const priceId = getPriceIdByPlanCode(planCode);
  if (!priceId) {
    return res.status(400).json({ error: "plan_unavailable", plan_code: planCode });
  }

  try {
    const user = req.user;
    const db = getDb();
    let stripeCustomerId = await loadKnownStripeCustomerIdForUser(db, user.id);
    if (!stripeCustomerId) {
      const customer = await getOrCreateStripeCustomer({ db, user });
      stripeCustomerId = customer?.stripeCustomerId || null;
    }
    if (!stripeCustomerId) {
      return res.status(503).json({ error: "stripe_customer_link_unavailable", reason: "missing_customer_id" });
    }
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: body.mode,
      line_items: [{ price: priceId, quantity: body.quantity }],
      success_url: body.success_url,
      cancel_url: body.cancel_url,
      client_reference_id: user.id,
      metadata: {
        ...(body.metadata || {}),
        user_id: user.id,
        plan_code: planCode,
        price_id: priceId,
        env: process.env.NODE_ENV || "development",
      },
    });

    logger.info("stripe_checkout_session_created", {
      userId: maskUser(user.id),
      status: "success",
      mode: body.mode,
      planCode,
      sessionIdPrefix: idPrefix(session.id),
    });
    trackBillingEvent({
      event: "checkout.subscription.created",
      req,
      planCode,
      additional: {
        source: "stripe.checkout",
        status: "success",
        mode: body.mode,
      },
    });
    return res.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (error) {
    const checkoutError = classifyCheckoutSessionCreateError(error);
    logger.error("stripe_checkout_session_failed", {
      userId: maskUser(req.user?.id),
      status: "error",
      planCode,
      priceIdPrefix: idPrefix(priceId),
      reason: checkoutError.reason,
      stripeCode: error?.code || error?.raw?.code || null,
      stripeType: error?.type || error?.rawType || null,
      stripeParam: error?.param || error?.raw?.param || null,
      message: error?.message || String(error),
    });
    trackBillingEvent({
      event: "checkout.subscription.failed",
      req,
      planCode,
      additional: {
        source: "stripe.checkout",
        status: "error",
        reason: checkoutError.reason,
        code: checkoutError.error,
      },
    });
    return res.status(checkoutError.status).json({
      error: checkoutError.error,
      reason: checkoutError.reason,
      plan_code: planCode,
    });
  }
});

router.post("/portal/session", express.json({ limit: "1mb" }), authMiddleware, async (req, res) => {
  if (!stripe || !getDb()) {
    return res.status(503).json({ error: "stripe_not_configured" });
  }

  const parsed = PortalSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  try {
    const db = getDb();
    let stripeCustomerId = await loadKnownStripeCustomerIdForUser(db, req.user.id);
    if (!stripeCustomerId) {
      const customer = await getOrCreateStripeCustomer({ db, user: req.user });
      stripeCustomerId = customer?.stripeCustomerId || null;
    }
    if (!stripeCustomerId) {
      return res.status(503).json({ error: "stripe_customer_link_unavailable", reason: "missing_customer_id" });
    }
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: parsed.data.return_url || getDefaultReturnUrl(),
      ...(parsed.data.locale ? { locale: parsed.data.locale } : {}),
    });
    logger.info("stripe_portal_session_created", {
      userId: maskUser(req.user.id),
      status: "success",
      customerIdPrefix: idPrefix(stripeCustomerId),
      portalSessionIdPrefix: idPrefix(portalSession.id),
    });
    trackBillingEvent({
      event: "billing.portal.opened",
      req,
      additional: {
        source: "stripe.portal",
        status: "success",
      },
    });
    return res.json({ ok: true, url: portalSession.url });
  } catch (error) {
    logger.error("stripe_portal_session_failed", {
      userId: maskUser(req.user?.id),
      status: "error",
      message: error?.message || String(error),
    });
    trackBillingEvent({
      event: "billing.portal.failed",
      req,
      additional: {
        source: "stripe.portal",
        status: "error",
        reason: "portal_session_failed",
      },
    });
    return res.status(500).json({ error: "stripe_portal_failed", details: "Nao foi possivel abrir o portal." });
  }
});

router.post("/subscription/refresh", authMiddleware, async (req, res) => {
  const db = getDb();
  if (!db || !stripe) {
    return res.status(503).json({ error: "stripe_not_configured" });
  }

  const userId = req.user.id;
  try {
    const customerId = await loadKnownStripeCustomerIdForUser(db, userId);
    if (!customerId) {
      await upsertSubscription({
        userId,
        planCode: "FREE",
        status: "canceled",
      });
      trackBillingEvent({
        event: "checkout.subscription.refresh",
        req,
        planCode: "FREE",
        additional: {
          source: "stripe.subscription_refresh",
          status: "success",
          reason: "missing_customer_downgraded",
        },
      });
      return res.json({ ok: true, subscription: null, downgraded: true });
    }

    let subscriptions;
    try {
      subscriptions = await listStripeSubscriptions(customerId);
    } catch (error) {
      logger.warn("stripe_subscription_refresh_fetch_failed", {
        userId: maskUser(userId),
        status: "error",
        message: error?.message || String(error),
      });
      return res.status(502).json({ error: "stripe_fetch_failed" });
    }

    const chosen = chooseRelevantSubscription(subscriptions);
    if (!chosen) {
      await upsertSubscription({
        userId,
        planCode: "FREE",
        status: "canceled",
        stripeCustomerId: customerId,
      });
      trackBillingEvent({
        event: "checkout.subscription.refresh",
        req,
        planCode: "FREE",
        additional: {
          source: "stripe.subscription_refresh",
          status: "success",
          reason: "no_active_subscription",
        },
      });
      return res.json({ ok: true, subscription: null, downgraded: true });
    }

    const priceId = extractSubscriptionPriceId(chosen);
    const mappedPlan = getPlanCodeByPriceId(priceId) || "FREE";
    const normalizedStatus = String(chosen.status || "canceled");

    await upsertSubscription({
      userId,
      planCode: mappedPlan,
      status: normalizedStatus,
      stripeSubscriptionId: chosen.id || null,
      stripeCustomerId: customerId,
      currentPeriodStart: chosen.current_period_start ? new Date(chosen.current_period_start * 1000).toISOString() : null,
      currentPeriodEnd: chosen.current_period_end ? new Date(chosen.current_period_end * 1000).toISOString() : null,
      cancelAtPeriodEnd: Boolean(chosen.cancel_at_period_end),
    });

    trackBillingEvent({
      event: "checkout.subscription.refresh",
      req,
      planCode: mappedPlan,
      additional: {
        source: "stripe.subscription_refresh",
        status: "success",
      },
    });

    return res.json({
      ok: true,
      subscription: {
        plan_code: mappedPlan,
        status: normalizedStatus,
        stripe_subscription_id: chosen.id || null,
        stripe_customer_id: customerId,
        current_period_start: chosen.current_period_start ? new Date(chosen.current_period_start * 1000).toISOString() : null,
        current_period_end: chosen.current_period_end ? new Date(chosen.current_period_end * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(chosen.cancel_at_period_end),
      },
    });
  } catch (error) {
    logger.error("stripe_subscription_refresh_failed", {
      userId: maskUser(userId),
      status: "error",
      message: error?.message || String(error),
    });
    trackBillingEvent({
      event: "checkout.subscription.refresh_failed",
      req,
      additional: {
        source: "stripe.subscription_refresh",
        status: "error",
        reason: "refresh_failed",
      },
    });
    return res.status(500).json({ error: "stripe_refresh_failed" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "stripe_not_configured" });
  try {
    const customerId = await loadKnownStripeCustomerIdForUser(db, req.user.id);
    const sub = await db
      .from("subscriptions")
      .select("plan_code,status,created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return res.json({
      ok: true,
      hasCustomer: Boolean(customerId),
      customer: customerId ? { id: shortId(customerId) } : null,
      subscription: sub.data
        ? {
            plan_code: sub.data.plan_code || "FREE",
            status: sub.data.status || "inactive",
          }
        : null,
    });
  } catch {
    return res.status(500).json({ error: "stripe_me_failed" });
  }
});

router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = typeof req.headers["stripe-signature"] === "string" ? req.headers["stripe-signature"] : "";
  const webhookSecret = getStripeWebhookSecret();
  const requestId = typeof req.headers["request-id"] === "string" ? req.headers["request-id"] : null;

  if (!stripe || !webhookSecret) {
    return res.status(503).json({ error: "stripe_not_configured" });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    logger.warn("stripe_webhook_invalid_signature", {
      status: "invalid_signature",
      message: error?.message || String(error),
    });
    await insertWebhookEvent({
      event_id: `invalid_signature:${Date.now()}`,
      event_type: "invalid_signature",
      livemode: false,
      status: "failed",
      request_id: requestId,
      signature: signature || null,
      payload: {},
      error: "invalid_signature",
    }).catch(() => null);
    return res.status(400).json({ error: "invalid_signature", message: error?.message || "invalid_signature" });
  }

  const eventId = event.id;
  const eventType = event.type;
  const eventObject = event.data?.object || {};
  req.stripeEventMeta = { eventId, eventType };
  const coinPackageRelevant = isRelevantCoinPackageEvent(eventType, eventObject);
  const db = getDb();

  if (!HANDLED_TYPES.has(eventType)) {
    logger.info("stripe_webhook_ignored", {
      eventIdPrefix: idPrefix(eventId),
      eventType,
      reason: "event_not_handled",
    });
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (isDebugForceDbUnavailable(req)) {
    logger.error("stripe_webhook_db_unavailable", {
      eventIdPrefix: idPrefix(eventId),
      eventType,
      status: "debug_forced",
    });
    return res.status(503).json({ error: "stripe_webhook_db_unavailable" });
  }

  const dbState = await assertWebhookDbReady(db);
  if (!dbState.ok) {
    logger.error("stripe_webhook_db_unavailable", {
      eventIdPrefix: idPrefix(eventId),
      eventType,
      status: "unavailable",
      message: dbState.reason,
    });
    return res.status(503).json({ error: "stripe_webhook_db_unavailable" });
  }

  const inserted = await insertWebhookEvent({
    event_id: eventId,
    event_type: eventType,
    livemode: Boolean(event.livemode),
    status: "received",
    request_id: requestId,
    signature: signature || null,
    payload: event,
  });

  const duplicateWebhookEvent = Boolean(inserted.error && isDuplicateError(inserted.error));
  let shouldReprocessFailedEvent = false;
  if (duplicateWebhookEvent) {
    if (db) {
      const { data: existingEventRow } = await db
        .from("stripe_webhook_events")
        .select("status,error,processed_at")
        .eq("event_id", eventId)
        .maybeSingle();
      const shouldRetryFailed = existingEventRow?.status === "failed";
      const shouldRetryStuckReceived =
        existingEventRow?.status === "received" &&
        !existingEventRow?.processed_at;
      if (shouldRetryFailed || shouldRetryStuckReceived) {
        shouldReprocessFailedEvent = true;
        logger.warn("stripe_webhook_retry_failed_event", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          scope: coinPackageRelevant ? "coin_package" : "subscription",
          previousStatus: existingEventRow.status,
          previousProcessedAt: existingEventRow.processed_at || null,
          previousError: String(existingEventRow.error || "").slice(0, 220),
        });
      }
    }

    if (!shouldReprocessFailedEvent) {
      logger.info("stripe_webhook", { eventIdPrefix: idPrefix(eventId), eventType, status: "replay" });
      return res.status(200).json({ ok: true, replay: true });
    }
  }
  if (inserted.error && !(duplicateWebhookEvent && shouldReprocessFailedEvent)) {
    logger.error("stripe_webhook_db_unavailable", {
      eventIdPrefix: idPrefix(eventId),
      eventType,
      status: "insert_failed",
      message: inserted.error.message || "stripe_webhook_event_insert_failed",
    });
    return res.status(503).json({ error: "stripe_webhook_db_unavailable" });
  }

  let resolvedUserIdForAudit = null;
  try {
    const enterpriseResult = await processEnterpriseWebhookEvent({ eventId, eventType, eventObject });
    if (enterpriseResult.handled) {
      if (enterpriseResult.processed) {
        await updateWebhookEvent(eventId, {
          status: "processed",
          processed_at: new Date().toISOString(),
          error: null,
          user_id: enterpriseResult.userId || null,
        });
      } else {
        await updateWebhookEvent(eventId, {
          status: "ignored",
          processed_at: new Date().toISOString(),
          error: enterpriseResult.reason || "enterprise_ignored",
          user_id: enterpriseResult.userId || null,
        });
      }

      logger.info("stripe_webhook_enterprise", {
        eventIdPrefix: idPrefix(eventId),
        eventType,
        status: enterpriseResult.processed ? "processed" : "ignored",
        reason: enterpriseResult.reason,
        grantStatus: enterpriseResult.grantStatus || null,
        userId: maskUser(enterpriseResult.userId),
        orderIdPrefix: idPrefix(enterpriseResult.orderId),
      });
      return res.status(200).json({ ok: true });
    }

    if (coinPackageRelevant) {
      const coinPackageResult = await processCoinPackageWebhookEvent({ eventId, eventType, eventObject });
      if (coinPackageResult.handled) {
        if (coinPackageResult.processed) {
          await updateWebhookEvent(eventId, {
            status: "processed",
            processed_at: new Date().toISOString(),
            error: null,
            user_id: coinPackageResult.userId || null,
          });
        } else {
          await updateWebhookEvent(eventId, {
            status: "ignored",
            processed_at: new Date().toISOString(),
            error: coinPackageResult.reason || "coin_package_ignored",
            user_id: coinPackageResult.userId || null,
          });
        }

        logger.info("stripe_webhook_coin_package", {
          eventId,
          eventIdPrefix: idPrefix(eventId),
          eventType,
          status: coinPackageResult.processed ? "processed" : "ignored",
          reason: coinPackageResult.reason,
          sessionId: shortId(coinPackageResult.sessionId),
          paymentIntentId: shortId(coinPackageResult.paymentIntentId),
          quoteId: shortId(coinPackageResult.quoteId),
          foundQuote: Boolean(coinPackageResult.foundQuote),
          quoteStore: coinPackageResult.source === "db" ? "db" : "fallback",
          quoteUserId: maskUser(coinPackageResult.quoteUserId),
          exists_in_auth_users:
            typeof coinPackageResult.quoteUserExistsInAuthUsers === "boolean"
              ? coinPackageResult.quoteUserExistsInAuthUsers
              : (coinPackageResult.foundQuote ? true : null),
          resolvedUserId: maskUser(coinPackageResult.resolvedUserId || coinPackageResult.userId),
          userId: maskUser(coinPackageResult.userId),
          source: coinPackageResult.source || null,
          grant_attempted: Boolean(coinPackageResult.grantAttempted),
          grant_result: coinPackageResult.grantResult || coinPackageResult.grantStatus || null,
          dedupe_key:
            coinPackageResult.dedupeKey ||
            (coinPackageResult.sessionId
              ? `coin_package_mix:${coinPackageResult.sessionId}`
              : (coinPackageResult.paymentIntentId
                ? `coin_package_mix:${coinPackageResult.paymentIntentId}`
                : (coinPackageResult.quoteId ? `coin_package_mix:${coinPackageResult.quoteId}` : null))),
          grant_call_path:
            coinPackageResult.grantCallPath || (coinPackageResult.grantAttempted ? "rpc:coin_package_grant_v1" : "none"),
          error_code: coinPackageResult.errorCode || null,
          error_message_short: coinPackageResult.errorMessageShort || null,
          totals: coinPackageResult.totals || null,
          breakdown: coinPackageResult.breakdown || coinPackageResult.grants || null,
          dedupe_status: coinPackageResult.dedupeStatus || null,
          skipped_reason: coinPackageResult.skippedReason || null,
          grant_status: coinPackageResult.grantStatus || null,
          sanity_total_match:
            coinPackageResult.sanity?.stripe_total_matches_quote ??
            coinPackageResult.sanity?.stripe_total_matches_metadata ??
            null,
          sanity: coinPackageResult.sanity || null,
          grants: coinPackageResult.grants || null,
          grantStatus: coinPackageResult.grantStatus || null,
        });
        return res.status(200).json({ ok: true });
      }
    }

    const userId = await resolveUserId(eventObject);
    resolvedUserIdForAudit = isUuid(userId) ? userId : null;
    if (!isUuid(userId)) {
      await markIgnored(eventId, "missing_or_invalid_user");
      logger.info("stripe_webhook", {
        eventIdPrefix: idPrefix(eventId),
        eventType,
        status: "ignored",
        reason: "missing_or_invalid_user",
      });
      return res.status(200).json({ ok: true });
    }

    const customerId = typeof eventObject.customer === "string" ? eventObject.customer : null;
    const subscriptionId =
      eventType === "invoice.paid"
        ? extractInvoiceSubscriptionId(eventObject)
        : (typeof eventObject.subscription === "string" ? eventObject.subscription : eventObject.id || null);
    await ensureStripeCustomerLink({
      userId,
      customerId,
      email: typeof eventObject.customer_email === "string" ? eventObject.customer_email : null,
    });

    let priceId = null;
    if (eventType === "checkout.session.completed") priceId = await extractCheckoutPriceId(eventObject);
    if (eventType === "invoice.paid") priceId = extractInvoicePriceId(eventObject);
    if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
      priceId = extractSubscriptionPriceId(eventObject);
    }

    let planCode = null;
    if (eventObject?.metadata?.plan_code) {
      try {
        planCode = assertValidPlanCode(eventObject.metadata.plan_code);
      } catch {
        planCode = null;
      }
    }
    if (!planCode && priceId) {
      planCode = getPlanCodeByPriceId(priceId);
    }
    if (!planCode && eventType === "invoice.paid") {
      planCode = await resolvePlanCodeFromSubscriptionContext({ userId, subscriptionId });
    }
    if (!planCode && eventType === "customer.subscription.updated") {
      planCode = await resolvePlanCodeFromSubscriptionContext({ userId, subscriptionId });
    }

    const planFromPrice = priceId ? getPlanCodeByPriceId(priceId) : null;
    if (planCode && priceId && planFromPrice && planCode !== planFromPrice) {
      await markIgnoredForUser(eventId, userId, "plan_price_mismatch");
      logger.info("stripe_webhook", {
        eventIdPrefix: idPrefix(eventId),
        eventType,
        status: "ignored",
        reason: "plan_price_mismatch",
        userId: maskUser(userId),
        planCode,
        priceIdPrefix: idPrefix(priceId),
      });
      return res.status(200).json({ ok: true });
    }
    if (planCode) {
      try {
        planCode = assertValidPlanCode(planCode);
      } catch {
        await markIgnoredForUser(eventId, userId, "invalid_plan_code");
        logger.info("stripe_webhook", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          status: "ignored",
          reason: "invalid_plan_code",
          userId: maskUser(userId),
          planCode: null,
          priceIdPrefix: idPrefix(priceId),
        });
        return res.status(200).json({ ok: true });
      }
    }
    if (eventType === "invoice.paid" && !planCode) {
      await markIgnoredForUser(eventId, userId, "invoice_plan_unresolved");
      logger.info("stripe_webhook", {
        eventIdPrefix: idPrefix(eventId),
        eventType,
        status: "ignored",
        reason: "invoice_plan_unresolved",
        userId: maskUser(userId),
        priceIdPrefix: idPrefix(priceId),
      });
      return res.status(200).json({ ok: true });
    }

    logger.info("stripe_webhook", {
      eventIdPrefix: idPrefix(eventId),
      eventType,
      status: "resolved",
      userId: maskUser(userId),
      planCode,
      priceIdPrefix: idPrefix(priceId),
    });
    const periodStart =
      Number.isFinite(Number(eventObject.current_period_start)) && eventObject.current_period_start
        ? new Date(Number(eventObject.current_period_start) * 1000).toISOString()
        : null;
    const periodEnd =
      Number.isFinite(Number(eventObject.current_period_end)) && eventObject.current_period_end
        ? new Date(Number(eventObject.current_period_end) * 1000).toISOString()
        : null;

    if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
      const incomingStatus = eventType === "customer.subscription.deleted" ? "canceled" : String(eventObject.status || "active");
      const shouldDowngrade =
        eventType === "customer.subscription.deleted" ||
        incomingStatus === "canceled" ||
        incomingStatus === "incomplete_expired" ||
        incomingStatus === "unpaid";
      if (!shouldDowngrade && !planCode) {
        await markIgnoredForUser(eventId, userId, "subscription_plan_unresolved");
        logger.info("stripe_webhook", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          status: "ignored",
          reason: "subscription_plan_unresolved",
          userId: maskUser(userId),
          priceIdPrefix: idPrefix(priceId),
        });
        return res.status(200).json({ ok: true });
      }
      await upsertSubscription({
        userId,
        planCode: shouldDowngrade ? "FREE" : planCode || "FREE",
        status: incomingStatus,
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(eventObject.cancel_at_period_end),
      });
    }

    if (eventType === "checkout.session.completed") {
      const isSubscription = eventObject.mode === "subscription";
      const isPaid = String(eventObject.payment_status || "").toLowerCase() === "paid";
      if (!isSubscription && !isPaid) {
        await markIgnoredForUser(eventId, userId, "payment_not_paid");
        logger.info("stripe_webhook", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          status: "ignored",
          reason: "payment_not_paid",
          userId: maskUser(userId),
          planCode,
          priceIdPrefix: idPrefix(priceId),
        });
        return res.status(200).json({ ok: true });
      }

      await upsertSubscription({
        userId,
        planCode: planCode || "FREE",
        status: isSubscription ? "active" : "inactive",
        stripeSubscriptionId: isSubscription && typeof eventObject.subscription === "string" ? eventObject.subscription : null,
        stripeCustomerId: customerId,
      });

      if (!isSubscription && planCode) {
        const grantResult = await grantCoinsForPlan({
          userId,
          planCode,
          kind: "one_time",
          eventId,
        });
        logger.info("stripe_plan_grant", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          userId: maskUser(userId),
          planCode,
          kind: "one_time",
          grantStatus: grantResult.status,
          rpcStatus: grantResult.rpcStatus || null,
          grantRpcPath: grantResult.grantRpcPath || null,
          grants: grantResult.grants,
        });
      }
    }

    if (eventType === "invoice.paid") {
      const invoicePaid = String(eventObject.status || "").toLowerCase() === "paid";
      if (!invoicePaid) {
        await markIgnoredForUser(eventId, userId, "invoice_not_paid");
        logger.info("stripe_webhook", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          status: "ignored",
          reason: "invoice_not_paid",
          userId: maskUser(userId),
          planCode,
          priceIdPrefix: idPrefix(priceId),
        });
        return res.status(200).json({ ok: true });
      }
      if (!subscriptionId) {
        await markIgnoredForUser(eventId, userId, "invoice_without_subscription");
        logger.info("stripe_webhook", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          status: "ignored",
          reason: "invoice_without_subscription",
          userId: maskUser(userId),
          planCode,
          priceIdPrefix: idPrefix(priceId),
        });
        return res.status(200).json({ ok: true });
      }
      if (!allowedInvoiceBillingReason(eventObject.billing_reason)) {
        await markIgnoredForUser(eventId, userId, "invalid_billing_reason");
        logger.info("stripe_webhook", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          status: "ignored",
          reason: "invalid_billing_reason",
          billingReason: String(eventObject.billing_reason || ""),
          userId: maskUser(userId),
          planCode,
          priceIdPrefix: idPrefix(priceId),
        });
        return res.status(200).json({ ok: true });
      }

      await upsertSubscription({
        userId,
        planCode: planCode || "FREE",
        status: "active",
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: customerId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });
      if (planCode) {
        const grantResult = await grantCoinsForPlan({
          userId,
          planCode,
          kind: "monthly",
          eventId,
        });
        logger.info("stripe_plan_grant", {
          eventIdPrefix: idPrefix(eventId),
          eventType,
          userId: maskUser(userId),
          planCode,
          kind: "monthly",
          grantStatus: grantResult.status,
          rpcStatus: grantResult.rpcStatus || null,
          grantRpcPath: grantResult.grantRpcPath || null,
          grants: grantResult.grants,
        });
      }
    }

    await updateWebhookEvent(eventId, {
      status: "processed",
      processed_at: new Date().toISOString(),
      error: null,
      user_id: userId,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    const errorMessage = error?.message || String(error);
    const codeMatch = /\b(\d{5})\b/.exec(String(errorMessage));
    await updateWebhookEvent(eventId, {
      status: "failed",
      processed_at: new Date().toISOString(),
      error: errorMessage || "processing_failed",
      user_id: resolvedUserIdForAudit,
    });
    logger.error("stripe_webhook_failed", {
      eventIdPrefix: idPrefix(eventId),
      eventType,
      status: "failed",
      message: errorMessage,
      errorCode: error?.code || codeMatch?.[1] || null,
      stack: typeof error?.stack === "string" ? error.stack.split("\n").slice(0, 5).join(" | ") : null,
    });
    const shouldReturnStripeRetry =
      coinPackageRelevant ||
      (COIN_PACKAGE_EVENT_TYPES.has(String(eventType || "")) &&
        String(error?.message || "").includes("coin_package"));
    if (shouldReturnStripeRetry) {
      const errorCode = error?.code || codeMatch?.[1] || null;
      const errorMessageShort = errorMessage.slice(0, 220);
      logger.error("stripe_webhook_coin_package_failed", {
        eventIdPrefix: idPrefix(eventId),
        eventType,
        quoteId: shortId(eventObject?.metadata?.quote_id || null),
        sessionId:
          eventType === "checkout.session.completed"
            ? shortId(eventObject?.id || null)
            : shortId(eventObject?.metadata?.checkout_session_id || null),
        paymentIntentId:
          eventType === "payment_intent.succeeded"
            ? shortId(eventObject?.id || null)
            : shortId(eventObject?.payment_intent || eventObject?.metadata?.payment_intent_id || null),
        errorCode,
        errorMessageShort,
        stack: typeof error?.stack === "string" ? error.stack.split("\n").slice(0, 5).join(" | ") : null,
        path: "coin_package_mix",
      });
      console.error("[STRIPE_WEBHOOK_500]", {
        eventType,
        eventId,
        path: "coin_package_mix",
        errorCode,
        errorMessageShort,
      });
      console.error("[STRIPE_WEBHOOK_500_STACK]", error?.stack || null);
    }
    if (shouldReturnStripeRetry) {
      return res.status(500).json({ error: "coin_package_webhook_failed" });
    }
    return res.status(200).json({ ok: true });
  }
});

router.get("/_debug/env", authMiddleware, adminOnly, (req, res) => {
  if (process.env.NODE_ENV !== "development") {
    return res.status(404).json({ error: "not_found" });
  }
  return res.json({
    hasSecretKey: Boolean((process.env.STRIPE_SECRET_KEY || "").trim()),
    hasWebhookSecret: Boolean((process.env.STRIPE_WEBHOOK_SECRET || "").trim()),
  });
});

router.use((err, req, res, next) => {
  const eventMeta = req?.stripeEventMeta || {};
  const errorMessageShort = String(err?.message || "stripe_route_unhandled").slice(0, 220);
  const errorCode = err?.code || null;

  console.error("[STRIPE_WEBHOOK_UNHANDLED]", {
    route: req?.originalUrl || req?.url || "/api/stripe",
    eventType: eventMeta.eventType || null,
    eventId: eventMeta.eventId || null,
    errorCode,
    errorMessageShort,
  });
  console.error("[STRIPE_WEBHOOK_UNHANDLED_STACK]", err?.stack || null);

  if (res?.headersSent) {
    return next(err);
  }
  return res.status(500).json({ error: "stripe_route_unhandled" });
});

/*
PowerShell quick tests:

$token = "SEU_ACCESS_TOKEN"
$apiBase = "http://127.0.0.1:3000"

# Plans
curl.exe -s "$apiBase/api/stripe/plans" -H "Authorization: Bearer $token"

# Checkout by plan_code
@'
{
  "plan_code":"EDITOR_PRO",
  "success_url":"http://localhost:3001/dashboard?ok=1",
  "cancel_url":"http://localhost:3001/dashboard?canceled=1"
}
'@ | Set-Content .\checkout.json

curl.exe -s -X POST "$apiBase/api/stripe/checkout/session" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  --data-binary "@checkout.json"

# Webhook smoke
stripe listen --forward-to http://127.0.0.1:3000/api/stripe/webhook
stripe trigger checkout.session.completed
stripe trigger invoice.paid

# SQL checks (Supabase SQL editor):
# select event_id,event_type,status,error,processed_at from public.stripe_webhook_events order by received_at desc limit 20;
# select user_id,stripe_customer_id,updated_at from public.stripe_customers order by updated_at desc limit 20;
# select event_id,event_type,status,error from public.stripe_webhook_events where event_type in ('checkout.session.completed','invoice.paid') order by received_at desc limit 20;

# Portal + refresh + subscriptions/me
curl.exe -s -X POST "$apiBase/api/stripe/portal/session" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{`"return_url`":`"http://localhost:3001/dashboard`"}"

curl.exe -s -X POST "$apiBase/api/stripe/subscription/refresh" `
  -H "Authorization: Bearer $token"

curl.exe -s "$apiBase/api/subscriptions/me" `
  -H "Authorization: Bearer $token"
*/

export default router;
