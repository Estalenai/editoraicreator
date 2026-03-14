import crypto from "crypto";
import express from "express";
import { z } from "zod";
import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { logger } from "../utils/logger.js";
import { resolveLang, t } from "../utils/i18n.js";
import { generateLimiter } from "../middlewares/rateLimit.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import { getAutoConvertEnabled, setAutoConvertEnabled } from "../services/autoConvertService.js";
import { getOrCreateStripeCustomer, stripe } from "../utils/stripe.js";
import {
  canPurchaseCoin,
  centsToBrl,
  getConversionFeePercent,
  getPurchaseFeePercent,
  getSaleUnitPriceCents,
  normalizeProductPlanCode,
} from "../utils/coinsProductRules.js";

const router = express.Router();
router.use(authMiddleware);

const PurchaseQuoteSchema = z.object({
  coin_type: z.enum(["common", "pro", "ultra"]),
  amount: z.number().int().positive().max(1_000_000),
});

const PurchaseCreateSchema = PurchaseQuoteSchema.extend({
  metadata: z.record(z.any()).optional(),
  idempotency_key: z.string().min(8).optional(),
});

const PurchaseConfirmSchema = z.object({
  intent_id: z.string().uuid(),
  idempotency_key: z.string().min(8).optional(),
});

const PACKAGE_TOTAL_PRESETS = [300, 1200, 3000];
const PACKAGE_CUSTOM_ENABLED = true;
const PACKAGE_TOTAL_MIN = 100;
const PACKAGE_TOTAL_HARD_MAX = 2_147_483_640;
const PACKAGE_QTY_STEP = 10;
const PACKAGE_QUOTE_TTL_MS = 10 * 60 * 1000;
const PACKAGE_QUOTE_STORE_MAX = 500;
const PACKAGE_QUOTE_DB_COOLDOWN_TABLE_MISSING_MS = 60 * 1000;
const PACKAGE_QUOTE_DB_COOLDOWN_GENERIC_MS = 15 * 1000;
const COIN_PACKAGE_QUOTES_TABLE = "coin_package_quotes";
const COIN_PACKAGE_QUOTE_SELECT =
  "quote_id,user_id,request_key,plan_code,package_total,breakdown,pricing,created_at,expires_at,used_at,checkout_session_id,payment_intent_id";
const COIN_PACKAGE_PRICING_VERSION = "sale_price_cents_v1";

const PackageBreakdownSchema = z.object({
  common: z.coerce.number().int().min(0),
  pro: z.coerce.number().int().min(0),
  ultra: z.coerce.number().int().min(0),
});

const PackageQuoteSchema = z.object({
  package_total: z.coerce.number().int(),
  breakdown: PackageBreakdownSchema,
});

const PackageCheckoutCreateSchema = z
  .object({
    quote_id: z.string().min(8).optional(),
    package_total: z.coerce.number().int().optional(),
    breakdown: PackageBreakdownSchema.optional(),
    success_url: z.string().url().optional(),
    cancel_url: z.string().url().optional(),
    metadata: z.record(z.any()).optional(),
    idempotency_key: z.string().min(8).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.quote_id && (!Number.isFinite(Number(value.package_total)) || !value.breakdown)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "quote_id_or_payload_required",
        path: ["quote_id"],
      });
    }
  });

const packageQuoteStore = new Map();
const packageQuoteRequestIndex = new Map();
let packageQuoteDbFallbackUntilMs = 0;
let packageQuoteDbFallbackReason = null;

function isPackageQuoteDbOnCooldown(nowMs = Date.now()) {
  return nowMs < packageQuoteDbFallbackUntilMs;
}

function activatePackageQuoteDbCooldown({ reason, error, cooldownMs }) {
  const nowMs = Date.now();
  packageQuoteDbFallbackUntilMs = Math.max(packageQuoteDbFallbackUntilMs, nowMs + Math.max(1000, Number(cooldownMs || 0)));
  packageQuoteDbFallbackReason = String(reason || "unknown");
  logger.warn("coins_package_quote_db_cooldown_activated", {
    reason: packageQuoteDbFallbackReason,
    retryAt: new Date(packageQuoteDbFallbackUntilMs).toISOString(),
    cooldownMs: Math.max(1000, Number(cooldownMs || 0)),
    code: error?.code || null,
    message: error?.message || String(error || "unknown"),
    hint: error?.hint || null,
    details: error?.details || null,
  });
}

function clearPackageQuoteDbCooldown() {
  if (packageQuoteDbFallbackUntilMs <= 0 && !packageQuoteDbFallbackReason) return;
  packageQuoteDbFallbackUntilMs = 0;
  packageQuoteDbFallbackReason = null;
  logger.info("coins_package_quote_db_cooldown_cleared");
}

function normalizeQuoteStore(value) {
  return String(value || "").toLowerCase() === "db" ? "db" : "memory";
}

function setQuoteStoreHeader(res, value) {
  res.set("X-Coins-Quote-Store", normalizeQuoteStore(value));
}

function stableJsonStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildRequestHash({ userId, endpoint, body }) {
  const canonical = stableJsonStringify(body || {});
  return crypto.createHash("sha256").update(`${userId}:${endpoint}:${canonical}`).digest("hex");
}

function idemPrefix(value) {
  return String(value || "").slice(0, 8);
}

function makeIdempotencyKey(req, bodyKey, endpoint) {
  const header = req.headers["idempotency-key"];
  if (typeof header === "string" && header.trim().length >= 8) return header.trim();
  if (typeof bodyKey === "string" && bodyKey.trim().length >= 8) return bodyKey.trim();

  const fallback = `${req.user?.id || "anonymous"}:${endpoint}:${stableJsonStringify(req.body || {})}`;
  return crypto.createHash("sha256").update(fallback).digest("hex");
}

function hasResponse(payload) {
  return Boolean(payload && typeof payload === "object" && Object.keys(payload).length > 0);
}

async function readReplay(db, { userId, endpoint, key, requestHash }) {
  const { data, error } = await db
    .from("request_idempotency")
    .select("response,status,request_hash")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return { kind: "none" };
  if (data.request_hash && requestHash && data.request_hash !== requestHash) return { kind: "conflict" };
  if (data.status === "processed" && hasResponse(data.response)) return { kind: "replay", payload: { ...data.response, replay: true } };
  return { kind: "none" };
}

async function saveReplay(db, { userId, endpoint, key, requestHash, response, status = "processed" }) {
  const { error } = await db.from("request_idempotency").upsert(
    {
      user_id: userId,
      endpoint,
      key,
      request_hash: requestHash,
      response,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint,key" }
  );
  if (error) {
    logger.warn("coins_idempotency_write_failed", {
      endpoint,
      userId,
      idempotencyKeyPrefix: idemPrefix(key),
      message: error.message,
    });
  }
}

async function loadPlanInfo(userId) {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_code,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    planCode: data?.plan_code || "FREE",
    status: data?.status || "inactive",
    normalizedPlan: normalizeProductPlanCode(data?.plan_code || "FREE"),
  };
}

function computePurchaseQuote({ coinType, amount, planCode }) {
  const normalizedPlan = normalizeProductPlanCode(planCode);
  const feePercent = getPurchaseFeePercent(normalizedPlan);
  const unitPriceCents = getSaleUnitPriceCents(coinType);
  const subtotalCents = Number(amount) * Number(unitPriceCents || 0);
  const feeCents = Math.ceil((subtotalCents * Number(feePercent || 0)) / 100);
  const totalCents = subtotalCents + feeCents;

  return {
    normalizedPlan,
    feePercent: Number(feePercent || 0),
    unitPriceCents,
    subtotalCents,
    feeCents,
    totalCents,
    subtotalBrl: centsToBrl(subtotalCents),
    feeBrl: centsToBrl(feeCents),
    totalBrl: centsToBrl(totalCents),
  };
}

function normalizeWallet(row, userId) {
  return {
    user_id: row?.user_id || userId,
    common: Number(row?.common ?? 0),
    pro: Number(row?.pro ?? 0),
    ultra: Number(row?.ultra ?? 0),
  };
}

async function getWalletSnapshotAuthed(accessToken, userId) {
  const supabase = createAuthedSupabaseClient(accessToken);
  const { data } = await supabase
    .from("creator_coins_wallet")
    .select("user_id, common, pro, ultra")
    .eq("user_id", userId)
    .maybeSingle();
  return normalizeWallet(data, userId);
}

function buildCreditPayload(coinType, amount) {
  const common = coinType === "common" ? amount : 0;
  const pro = coinType === "pro" ? amount : 0;
  const ultra = coinType === "ultra" ? amount : 0;
  return { common, pro, ultra };
}

function normalizeAbsoluteBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function getDefaultCheckoutBaseUrl(req) {
  const referer = req?.headers?.referer;
  const origin = req?.headers?.origin;
  const candidates = [
    origin,
    referer,
    process.env.WEB_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    "http://localhost:3001",
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAbsoluteBaseUrl(candidate);
    if (normalized) return normalized;
  }

  return "http://localhost:3001";
}

function buildPackageCheckoutUrls(req, body = {}) {
  const base = getDefaultCheckoutBaseUrl(req);
  return {
    successUrl: body.success_url || `${base}/dashboard?coins_package=success`,
    cancelUrl: body.cancel_url || `${base}/dashboard?coins_package=cancel`,
  };
}

function normalizePackageBreakdown(input = {}) {
  return {
    common: Math.max(0, Math.trunc(Number(input.common || 0))),
    pro: Math.max(0, Math.trunc(Number(input.pro || 0))),
    ultra: Math.max(0, Math.trunc(Number(input.ultra || 0))),
  };
}

function toNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.trunc(num));
}

function toStringOrNull(value) {
  const text = String(value == null ? "" : value).trim();
  return text || null;
}

function sanitizeCheckoutMetadata(rawMetadata = {}) {
  if (!rawMetadata || typeof rawMetadata !== "object") return {};
  const entries = Object.entries(rawMetadata).slice(0, 12);
  const cleaned = {};
  for (const [key, value] of entries) {
    const safeKey = String(key || "").trim();
    if (!safeKey) continue;
    const compactValue = String(value == null ? "" : value).trim();
    if (!compactValue) continue;
    cleaned[safeKey.slice(0, 40)] = compactValue.slice(0, 200);
  }
  return cleaned;
}

function purgeExpiredPackageQuotes(now = Date.now()) {
  for (const [quoteId, quoteRecord] of packageQuoteStore.entries()) {
    if (Number(quoteRecord?.expiresAtMs || 0) > now) continue;
    if (quoteRecord?.requestKey) packageQuoteRequestIndex.delete(quoteRecord.requestKey);
    packageQuoteStore.delete(quoteId);
  }
  while (packageQuoteStore.size > PACKAGE_QUOTE_STORE_MAX) {
    const oldest = packageQuoteStore.keys().next().value;
    if (!oldest) break;
    const removed = packageQuoteStore.get(oldest);
    if (removed?.requestKey) packageQuoteRequestIndex.delete(removed.requestKey);
    packageQuoteStore.delete(oldest);
  }
}

function createPackageQuoteId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildPackageQuoteRequestKey({ userId, normalizedPlan, packageTotal, breakdown }) {
  const canonical = stableJsonStringify({
    user_id: userId,
    plan: normalizedPlan,
    package_total: packageTotal,
    breakdown,
  });
  return `pkgqr_${crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 40)}`;
}

function computePackageQuote({ planCode, packageTotal, breakdown }) {
  const normalizedPlan = normalizeProductPlanCode(planCode);
  const purchaseFeePercent = Number(getPurchaseFeePercent(normalizedPlan) || 0);
  const conversionFeePercentRaw = getConversionFeePercent(normalizedPlan);
  const conversionFeePercent = Number.isFinite(Number(conversionFeePercentRaw)) ? Number(conversionFeePercentRaw) : 0;
  const unitAmounts = {
    common: Number(getSaleUnitPriceCents("common") || 0),
    pro: Number(getSaleUnitPriceCents("pro") || 0),
    ultra: Number(getSaleUnitPriceCents("ultra") || 0),
  };

  const lineItemsPreview = ["common", "pro", "ultra"]
    .map((coinType) => {
      const quantity = Number(breakdown?.[coinType] || 0);
      if (quantity <= 0) return null;
      const unitAmount = Number(unitAmounts[coinType] || 0);
      if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
        throw new Error(`pricing_not_available:${coinType}`);
      }
      return {
        coin_type: coinType,
        quantity,
        unit_amount: unitAmount,
        amount: quantity * unitAmount,
      };
    })
    .filter(Boolean);

  const subtotalBase = lineItemsPreview.reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const purchaseFeeAmount = Math.ceil((subtotalBase * purchaseFeePercent) / 100);
  // Conversion fee is tracked for compatibility/reporting, but package purchase does not perform conversion.
  const conversionFeeAmount = 0;
  const feesTotal = purchaseFeeAmount + conversionFeeAmount;
  const totalAmount = subtotalBase + feesTotal;
  const currency = "BRL";

  return {
    quote_id: createPackageQuoteId(),
    plan_code: planCode,
    normalized_plan: normalizedPlan,
    package_total: packageTotal,
    breakdown: { ...breakdown },
    line_items_preview: lineItemsPreview,
    line_items: lineItemsPreview.map((item) => ({
      coin_type: item.coin_type,
      quantity: item.quantity,
      unit_price_cents: item.unit_amount,
      subtotal_cents: item.amount,
    })),
    pricing: {
      unit_amounts: unitAmounts,
      subtotal_base: subtotalBase,
      purchase_fee_percent: purchaseFeePercent,
      purchase_fee_amount: purchaseFeeAmount,
      conversion_fee_percent: conversionFeePercent,
      conversion_fee_amount: conversionFeeAmount,
      fees_total: feesTotal,
      total_amount: totalAmount,
      currency,
      pricing_version: COIN_PACKAGE_PRICING_VERSION,
    },
    pricing_version: COIN_PACKAGE_PRICING_VERSION,
    subtotal_cents: subtotalBase,
    subtotal_brl: centsToBrl(subtotalBase),
    fee_percent: purchaseFeePercent,
    fee_cents: feesTotal,
    fee_brl: centsToBrl(feesTotal),
    total_cents: totalAmount,
    total_brl: centsToBrl(totalAmount),
    currency,
  };
}

function isValidPackageTotal(packageTotal) {
  const total = Number(packageTotal);
  if (!Number.isInteger(total)) return false;
  if (total < PACKAGE_TOTAL_MIN) return false;
  if (total > PACKAGE_TOTAL_HARD_MAX) return false;
  if (total % PACKAGE_QTY_STEP !== 0) return false;
  return true;
}

function validatePackageInput({ lang, packageTotal, breakdown, planCode }) {
  const safePackageTotal = Number(packageTotal);
  if (!isValidPackageTotal(safePackageTotal)) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "package_total_invalid",
        message: t(lang, "package_total_invalid", {
          min: PACKAGE_TOTAL_MIN,
          step: PACKAGE_QTY_STEP,
        }),
        details: {
          package_totals: PACKAGE_TOTAL_PRESETS,
          min_total: PACKAGE_TOTAL_MIN,
          max_total: PACKAGE_TOTAL_HARD_MAX,
          step: PACKAGE_QTY_STEP,
        },
      },
    };
  }

  const safeBreakdown = normalizePackageBreakdown(breakdown);
  const amounts = [safeBreakdown.common, safeBreakdown.pro, safeBreakdown.ultra];
  if (amounts.some((value) => value % PACKAGE_QTY_STEP !== 0)) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "package_breakdown_step_invalid",
        message: t(lang, "package_breakdown_step_invalid", { step: PACKAGE_QTY_STEP }),
        details: { qty_step: PACKAGE_QTY_STEP },
      },
    };
  }

  if (amounts.every((value) => value <= 0)) {
    return {
      ok: false,
      status: 400,
      payload: { error: "package_breakdown_required", message: t(lang, "package_breakdown_required") },
    };
  }

  const sum = safeBreakdown.common + safeBreakdown.pro + safeBreakdown.ultra;
  if (sum !== safePackageTotal) {
    return {
      ok: false,
      status: 400,
      payload: {
        error: "package_breakdown_sum_invalid",
        message: t(lang, "package_breakdown_sum_invalid", { package_total: safePackageTotal }),
        details: { expected_total: safePackageTotal, current_total: sum },
      },
    };
  }

  for (const coinType of ["common", "pro", "ultra"]) {
    if (Number(safeBreakdown[coinType] || 0) <= 0) continue;
    if (!canPurchaseCoin(planCode, coinType)) {
      return {
        ok: false,
        status: 403,
        payload: {
          error: "coin_purchase_not_allowed_for_plan",
          message: t(lang, "feature_not_available_for_plan"),
          plan: planCode,
          coin_type: coinType,
        },
      };
    }
  }

  return { ok: true, packageTotal: safePackageTotal, breakdown: safeBreakdown };
}

function upsertPackageQuoteStore({ userId, requestKey, quote }) {
  purgeExpiredPackageQuotes();
  const now = Date.now();
  const knownQuoteId = requestKey ? packageQuoteRequestIndex.get(requestKey) : null;
  if (knownQuoteId) {
    const existing = packageQuoteStore.get(knownQuoteId);
    if (existing && existing.userId === userId && Number(existing.expiresAtMs || 0) > now) {
      if (existing.used_at) {
        if (requestKey) packageQuoteRequestIndex.delete(requestKey);
      } else {
        existing.source = "memory";
        existing.expiresAtMs = now + PACKAGE_QUOTE_TTL_MS;
        existing.expires_at = new Date(existing.expiresAtMs).toISOString();
        packageQuoteStore.set(knownQuoteId, existing);
        return existing;
      }
    }
    packageQuoteRequestIndex.delete(requestKey);
  }

  const expiresAtMs = Date.now() + PACKAGE_QUOTE_TTL_MS;
  const createdAtMs = Date.now();
  const record = {
    source: "memory",
    userId,
    requestKey: requestKey || null,
    quote,
    createdAtMs,
    created_at: new Date(createdAtMs).toISOString(),
    expiresAtMs,
    expires_at: new Date(expiresAtMs).toISOString(),
    used_at: null,
    checkout_session_id: null,
  };
  packageQuoteStore.set(String(quote.quote_id), record);
  if (requestKey) packageQuoteRequestIndex.set(requestKey, String(quote.quote_id));
  purgeExpiredPackageQuotes();
  return record;
}

function readPackageQuoteStore({ quoteId, userId }) {
  purgeExpiredPackageQuotes();
  const record = packageQuoteStore.get(quoteId);
  if (!record) return null;
  if (record.userId !== userId) return null;
  if (Number(record.expiresAtMs || 0) <= Date.now()) {
    if (record?.requestKey) packageQuoteRequestIndex.delete(record.requestKey);
    packageQuoteStore.delete(quoteId);
    return null;
  }
  record.source = "memory";
  return record;
}

function buildPackageCheckoutLineItems(quote) {
  const labels = {
    common: "Common credits package",
    pro: "Pro credits package",
    ultra: "Ultra credits package",
  };
  const currency = String(quote?.pricing?.currency || quote?.currency || "BRL").toLowerCase();

  const items = [];
  const sourceItems = Array.isArray(quote?.line_items_preview) ? quote.line_items_preview : quote?.line_items || [];
  for (const lineItem of sourceItems) {
    const coinType = String(lineItem.coin_type || "").trim().toLowerCase();
    const unitAmount = toNonNegativeInt(lineItem.unit_amount ?? lineItem.unit_price_cents);
    const quantity = toNonNegativeInt(lineItem.quantity);
    if (!coinType || quantity <= 0 || unitAmount <= 0) continue;
    items.push({
      quantity,
      price_data: {
        currency,
        unit_amount: unitAmount,
        product_data: {
          name: labels[coinType] || `Credits package (${coinType})`,
          description: `Package mix credits (${coinType})`,
        },
      },
    });
  }

  const feeCents = toNonNegativeInt(quote?.pricing?.fees_total ?? quote?.fee_cents);
  const purchaseFeePercent = Number(quote?.pricing?.purchase_fee_percent ?? (quote?.fee_percent || 0));
  if (feeCents > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency,
        unit_amount: feeCents,
        product_data: {
          name: "Package mix fee",
          description: `Purchase fee (${purchaseFeePercent}%)`,
        },
      },
    });
  }

  return items;
}

function isMissingStripeCustomersTableError(error) {
  const msg = String(error?.message || "").toLowerCase();
  if (!msg.includes("stripe_customers")) return false;
  return msg.includes("could not find the table") || msg.includes("schema cache") || msg.includes("does not exist");
}

function isMissingCoinPackageQuotesTableError(error) {
  const msg = String(error?.message || "").toLowerCase();
  if (!msg.includes("coin_package_quotes")) return false;
  return msg.includes("could not find the table") || msg.includes("schema cache") || msg.includes("does not exist");
}

function isUniqueConstraintError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "23505" || msg.includes("duplicate key");
}

function markCoinPackageQuotesFallback(error, reason = "coin_package_quotes_table_missing") {
  const isTableMissing = isMissingCoinPackageQuotesTableError(error);
  activatePackageQuoteDbCooldown({
    reason,
    error,
    cooldownMs: isTableMissing ? PACKAGE_QUOTE_DB_COOLDOWN_TABLE_MISSING_MS : PACKAGE_QUOTE_DB_COOLDOWN_GENERIC_MS,
  });
}

function coinPackageQuotesTable() {
  return supabaseAdmin.schema("public").from(COIN_PACKAGE_QUOTES_TABLE);
}

function hydratePackageQuoteFromPricingRow(row) {
  if (!row || typeof row !== "object") return null;
  const breakdown = normalizePackageBreakdown(row.breakdown || {});
  const pricing = row.pricing && typeof row.pricing === "object" ? row.pricing : {};
  const normalizedPlan = normalizeProductPlanCode(row.plan_code || "FREE");
  const unitAmounts = {
    common: toNonNegativeInt(pricing?.unit_amounts?.common ?? getSaleUnitPriceCents("common")),
    pro: toNonNegativeInt(pricing?.unit_amounts?.pro ?? getSaleUnitPriceCents("pro")),
    ultra: toNonNegativeInt(pricing?.unit_amounts?.ultra ?? getSaleUnitPriceCents("ultra")),
  };
  const lineItemsPreviewRaw = Array.isArray(pricing?.line_items_preview) ? pricing.line_items_preview : null;
  const lineItemsPreview = (lineItemsPreviewRaw || ["common", "pro", "ultra"].map((coinType) => ({
    coin_type: coinType,
    quantity: toNonNegativeInt(breakdown[coinType]),
    unit_amount: unitAmounts[coinType],
    amount: toNonNegativeInt(breakdown[coinType]) * unitAmounts[coinType],
  })))
    .map((item) => ({
      coin_type: String(item?.coin_type || "").trim().toLowerCase(),
      quantity: toNonNegativeInt(item?.quantity),
      unit_amount: toNonNegativeInt(item?.unit_amount ?? item?.unit_price_cents),
      amount: toNonNegativeInt(item?.amount ?? toNonNegativeInt(item?.quantity) * toNonNegativeInt(item?.unit_amount ?? item?.unit_price_cents)),
    }))
    .filter((item) => item.coin_type && item.quantity > 0);

  const subtotalBase = toNonNegativeInt(
    pricing?.subtotal_base ??
      lineItemsPreview.reduce((acc, item) => acc + toNonNegativeInt(item.amount), 0)
  );
  const purchaseFeePercent = Number(pricing?.purchase_fee_percent ?? getPurchaseFeePercent(normalizedPlan) ?? 0);
  const conversionFeePercentRaw = pricing?.conversion_fee_percent ?? getConversionFeePercent(normalizedPlan);
  const conversionFeePercent = Number.isFinite(Number(conversionFeePercentRaw)) ? Number(conversionFeePercentRaw) : 0;
  const purchaseFeeAmount = toNonNegativeInt(pricing?.purchase_fee_amount ?? Math.ceil((subtotalBase * purchaseFeePercent) / 100));
  const conversionFeeAmount = toNonNegativeInt(pricing?.conversion_fee_amount ?? 0);
  const feesTotal = toNonNegativeInt(pricing?.fees_total ?? purchaseFeeAmount + conversionFeeAmount);
  const totalAmount = toNonNegativeInt(pricing?.total_amount ?? subtotalBase + feesTotal);
  const currency = String(pricing?.currency || "BRL").toUpperCase();
  const pricingVersion = String(pricing?.pricing_version || COIN_PACKAGE_PRICING_VERSION);

  const quote = {
    quote_id: String(row.quote_id),
    plan_code: String(row.plan_code || "FREE"),
    normalized_plan: normalizedPlan,
    package_total: toNonNegativeInt(row.package_total),
    breakdown,
    line_items_preview: lineItemsPreview,
    line_items: lineItemsPreview.map((item) => ({
      coin_type: item.coin_type,
      quantity: item.quantity,
      unit_price_cents: item.unit_amount,
      subtotal_cents: item.amount,
    })),
    pricing: {
      unit_amounts: unitAmounts,
      subtotal_base: subtotalBase,
      purchase_fee_percent: purchaseFeePercent,
      purchase_fee_amount: purchaseFeeAmount,
      conversion_fee_percent: conversionFeePercent,
      conversion_fee_amount: conversionFeeAmount,
      fees_total: feesTotal,
      total_amount: totalAmount,
      currency,
      pricing_version: pricingVersion,
      line_items_preview: lineItemsPreview,
    },
    pricing_version: pricingVersion,
    subtotal_cents: subtotalBase,
    subtotal_brl: centsToBrl(subtotalBase),
    fee_percent: purchaseFeePercent,
    fee_cents: feesTotal,
    fee_brl: centsToBrl(feesTotal),
    total_cents: totalAmount,
    total_brl: centsToBrl(totalAmount),
    currency,
  };

  return {
    source: "db",
    userId: String(row.user_id),
    requestKey: row.request_key || null,
    quote,
    created_at: row.created_at || null,
    expires_at: row.expires_at || null,
    used_at: row.used_at || null,
    checkout_session_id: row.checkout_session_id || null,
    payment_intent_id: row.payment_intent_id || null,
  };
}

function buildCoinPackageQuoteDbRow({ userId, requestKey, quote, expiresAt }) {
  return {
    quote_id: quote.quote_id,
    user_id: userId,
    request_key: requestKey,
    plan_code: quote.plan_code,
    package_total: toNonNegativeInt(quote.package_total),
    breakdown: quote.breakdown,
    pricing: {
      ...(quote.pricing || {}),
      line_items_preview: quote.line_items_preview || [],
    },
    expires_at: expiresAt,
  };
}

async function tryReadPackageQuoteByRequestKeyDb({ userId, requestKey }) {
  if (isPackageQuoteDbOnCooldown() || !requestKey) return null;
  const { data, error } = await coinPackageQuotesTable()
    .select(COIN_PACKAGE_QUOTE_SELECT)
    .eq("user_id", userId)
    .eq("request_key", requestKey)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingCoinPackageQuotesTableError(error)) {
      markCoinPackageQuotesFallback(error, "coin_package_quotes_table_missing");
      return null;
    }
    markCoinPackageQuotesFallback(error, "coin_package_quotes_lookup_failed");
    logger.warn("coins_package_quote_db_lookup_failed", {
      userId,
      reason: "request_key_lookup",
      message: error.message,
    });
    return null;
  }
  clearPackageQuoteDbCooldown();
  return hydratePackageQuoteFromPricingRow(data);
}

async function tryInsertPackageQuoteDb({ userId, requestKey, quote }) {
  if (isPackageQuoteDbOnCooldown()) return null;
  const expiresAt = new Date(Date.now() + PACKAGE_QUOTE_TTL_MS).toISOString();
  const row = buildCoinPackageQuoteDbRow({ userId, requestKey, quote, expiresAt });
  const { data, error } = await coinPackageQuotesTable().insert(row).select(COIN_PACKAGE_QUOTE_SELECT).maybeSingle();
  if (error) {
    if (isMissingCoinPackageQuotesTableError(error)) {
      markCoinPackageQuotesFallback(error, "coin_package_quotes_table_missing");
      return null;
    }
    if (isUniqueConstraintError(error) && requestKey) {
      clearPackageQuoteDbCooldown();
      return await tryReadPackageQuoteByRequestKeyDb({ userId, requestKey });
    }
    markCoinPackageQuotesFallback(error, "coin_package_quotes_insert_failed");
    logger.warn("coins_package_quote_db_insert_failed", {
      userId,
      reason: "insert_failed",
      message: error.message,
    });
    return null;
  }
  clearPackageQuoteDbCooldown();
  return hydratePackageQuoteFromPricingRow(data);
}

function isPackageQuoteRecordExpired(record, nowMs = Date.now()) {
  const expiresAtMs = Number(new Date(record?.expires_at || 0).getTime() || 0);
  return expiresAtMs <= nowMs;
}

async function tryRefreshPackageQuoteDb({ quoteId, userId, requestKey, quote }) {
  if (isPackageQuoteDbOnCooldown()) return null;
  const expiresAt = new Date(Date.now() + PACKAGE_QUOTE_TTL_MS).toISOString();
  const payload = buildCoinPackageQuoteDbRow({ userId, requestKey, quote, expiresAt });
  const { data, error } = await coinPackageQuotesTable()
    .update({
      plan_code: payload.plan_code,
      package_total: payload.package_total,
      breakdown: payload.breakdown,
      pricing: payload.pricing,
      expires_at: payload.expires_at,
      used_at: null,
      checkout_session_id: null,
      payment_intent_id: null,
    })
    .eq("quote_id", quoteId)
    .eq("user_id", userId)
    .select(COIN_PACKAGE_QUOTE_SELECT)
    .maybeSingle();
  if (error) {
    if (isMissingCoinPackageQuotesTableError(error)) {
      markCoinPackageQuotesFallback(error, "coin_package_quotes_table_missing");
      return null;
    }
    markCoinPackageQuotesFallback(error, "coin_package_quotes_refresh_failed");
    logger.warn("coins_package_quote_db_refresh_failed", {
      userId,
      quoteIdPrefix: idemPrefix(quoteId),
      message: error.message,
    });
    return null;
  }
  clearPackageQuoteDbCooldown();
  return hydratePackageQuoteFromPricingRow(data);
}

async function upsertPackageQuote({ userId, requestKey, quote }) {
  purgeExpiredPackageQuotes();
  const nowMs = Date.now();
  if (!isPackageQuoteDbOnCooldown(nowMs) && isSupabaseAdminEnabled() && supabaseAdmin) {
    const existing = await tryReadPackageQuoteByRequestKeyDb({ userId, requestKey });
    if (existing && !existing.used_at && !isPackageQuoteRecordExpired(existing, nowMs)) {
      return existing;
    }
    if (existing?.quote?.quote_id && !existing.used_at) {
      const refreshed = await tryRefreshPackageQuoteDb({
        quoteId: existing.quote.quote_id,
        userId,
        requestKey,
        quote,
      });
      if (refreshed) return refreshed;
    }
    const inserted = await tryInsertPackageQuoteDb({ userId, requestKey, quote });
    if (inserted && !isPackageQuoteRecordExpired(inserted, nowMs)) return inserted;
  }
  return upsertPackageQuoteStore({ userId, requestKey, quote });
}

async function readPackageQuote({ quoteId, userId }) {
  purgeExpiredPackageQuotes();
  if (!isPackageQuoteDbOnCooldown() && isSupabaseAdminEnabled() && supabaseAdmin) {
    const { data, error } = await coinPackageQuotesTable()
      .select(COIN_PACKAGE_QUOTE_SELECT)
      .eq("quote_id", quoteId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      if (isMissingCoinPackageQuotesTableError(error)) {
        markCoinPackageQuotesFallback(error, "coin_package_quotes_table_missing");
      } else {
        markCoinPackageQuotesFallback(error, "coin_package_quotes_read_failed");
        logger.warn("coins_package_quote_db_read_failed", {
          userId,
          quoteIdPrefix: idemPrefix(quoteId),
          message: error.message,
        });
      }
    } else {
      clearPackageQuoteDbCooldown();
      const record = hydratePackageQuoteFromPricingRow(data);
      if (record && Number(new Date(record.expires_at).getTime() || 0) > Date.now()) {
        return record;
      }
      if (record && Number(new Date(record.expires_at).getTime() || 0) <= Date.now()) {
        return null;
      }
    }
  }
  return readPackageQuoteStore({ quoteId, userId });
}

async function markPackageQuoteUsed({ quoteId, userId, checkoutSessionId, paymentIntentId = null }) {
  const safeSessionId = toStringOrNull(checkoutSessionId);
  const safePaymentIntentId = toStringOrNull(paymentIntentId);
  const patch = {};
  if (safeSessionId) patch.checkout_session_id = safeSessionId;
  if (safePaymentIntentId) patch.payment_intent_id = safePaymentIntentId;
  if (Object.keys(patch).length === 0) return;

  if (!isPackageQuoteDbOnCooldown() && isSupabaseAdminEnabled() && supabaseAdmin) {
    const { error } = await coinPackageQuotesTable()
      .update(patch)
      .eq("quote_id", quoteId)
      .eq("user_id", userId);
    if (error) {
      if (isMissingCoinPackageQuotesTableError(error)) {
        markCoinPackageQuotesFallback(error, "coin_package_quotes_table_missing");
      } else {
        markCoinPackageQuotesFallback(error, "coin_package_quotes_mark_used_failed");
        logger.warn("coins_package_quote_db_mark_used_failed", {
          userId,
          quoteIdPrefix: idemPrefix(quoteId),
          sessionIdPrefix: idemPrefix(safeSessionId),
          message: error.message,
        });
      }
    } else {
      clearPackageQuoteDbCooldown();
    }
  }

  const memoryRecord = packageQuoteStore.get(String(quoteId));
  if (memoryRecord && memoryRecord.userId === userId) {
    if (safeSessionId) memoryRecord.checkout_session_id = safeSessionId;
    if (safePaymentIntentId) memoryRecord.payment_intent_id = safePaymentIntentId;
    packageQuoteStore.set(String(quoteId), memoryRecord);
  }
}

/**
 * GET /api/coins/balance
 */
router.get("/balance", async (req, res) => {
  try {
    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data, error } = await supabase
      .from("creator_coins_wallet")
      .select("user_id, common, pro, ultra, updated_at")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    logger.info("coins_balance_read", {
      userId: req.user?.id || null,
      balanceReadSource: "table:creator_coins_wallet",
      foundWallet: Boolean(data),
    });

    return res.json({
      wallet: data || { user_id: req.user.id, common: 0, pro: 0, ultra: 0 },
    });
  } catch {
    return res.status(500).json({ error: "Falha ao obter saldo" });
  }
});

/**
 * GET /api/coins/transactions?limit=50
 */
router.get("/transactions", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const supabase = createAuthedSupabaseClient(req.access_token);

    const { data, error } = await supabase
      .from("coins_transactions")
      .select("id, coin_type, amount, reason, feature, ref_kind, ref_id, meta, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ transactions: data });
  } catch {
    return res.status(500).json({ error: "Falha ao obter transacoes" });
  }
});

/**
 * GET /api/coins/auto-convert
 */
router.get("/auto-convert", async (req, res) => {
  try {
    const enabled = await getAutoConvertEnabled(req.user.id);
    return res.json({ enabled: Boolean(enabled) });
  } catch {
    return res.status(500).json({ error: "Falha ao obter auto-convert" });
  }
});

/**
 * PUT /api/coins/auto-convert
 * body: { enabled: boolean }
 */
router.put("/auto-convert", async (req, res) => {
  try {
    const Body = z.object({ enabled: z.boolean() });
    const { enabled } = Body.parse(req.body);
    const saved = await setAutoConvertEnabled(req.user.id, enabled);
    return res.json({ ok: true, enabled: Boolean(saved) });
  } catch (error) {
    return res.status(400).json({ error: "Falha ao salvar auto-convert", details: error?.message || String(error) });
  }
});

/**
 * POST /api/coins/packages/quote
 */
router.post("/packages/quote", generateLimiter, async (req, res) => {
  const lang = resolveLang(req);
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }

    const parsed = PackageQuoteSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

    const planInfo = await loadPlanInfo(req.user.id);
    const packageTotal = Number(parsed.data.package_total);
    const validation = validatePackageInput({
      lang,
      packageTotal,
      breakdown: parsed.data.breakdown,
      planCode: planInfo.planCode,
    });
    if (!validation.ok) {
      return res.status(validation.status).json(validation.payload);
    }

    const requestKey = buildPackageQuoteRequestKey({
      userId: req.user.id,
      normalizedPlan: planInfo.normalizedPlan,
      packageTotal,
      breakdown: validation.breakdown,
    });
    let quote;
    try {
      quote = computePackageQuote({
        planCode: planInfo.planCode,
        packageTotal,
        breakdown: validation.breakdown,
      });
    } catch (pricingError) {
      if (String(pricingError?.message || "").startsWith("pricing_not_available:")) {
        return res.status(503).json({ error: "pricing_not_available", message: t(lang, "pricing_not_available") });
      }
      throw pricingError;
    }
    const record = await upsertPackageQuote({
      userId: req.user.id,
      requestKey,
      quote,
    });
    const quoteStore = normalizeQuoteStore(record?.source);
    setQuoteStoreHeader(res, quoteStore);

    return res.json({
      ok: true,
      quote_store: quoteStore,
      quote: {
        ...record.quote,
        expires_at: record.expires_at,
      },
      rules: {
        package_totals: [...PACKAGE_TOTAL_PRESETS],
        qty_step: PACKAGE_QTY_STEP,
        custom_enabled: PACKAGE_CUSTOM_ENABLED,
        min_total: PACKAGE_TOTAL_MIN,
        max_total: PACKAGE_TOTAL_HARD_MAX,
        step: PACKAGE_QTY_STEP,
      },
    });
  } catch (error) {
    logger.error("coins_package_quote_failed", {
      userId: req.user?.id,
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error", message: error?.message || String(error) });
  }
});

/**
 * POST /api/coins/packages/checkout/create
 */
router.post("/packages/checkout/create", generateLimiter, async (req, res) => {
  const endpoint = "coins_packages_checkout_create";
  const lang = resolveLang(req);
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }
    if (!stripe) {
      return res.status(503).json({ error: "stripe_not_configured" });
    }

    const parsed = PackageCheckoutCreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

    const idempotencyKey = makeIdempotencyKey(req, parsed.data.idempotency_key, endpoint);
    const requestHash = buildRequestHash({ userId: req.user.id, endpoint, body: parsed.data });

    const replay = await readReplay(supabaseAdmin, {
      userId: req.user.id,
      endpoint,
      key: idempotencyKey,
      requestHash,
    });
    if (replay.kind === "conflict") {
      return res.status(409).json({
        error: "idempotency_conflict",
        message: t(lang, "idempotency_conflict"),
      });
    }
    if (replay.kind === "replay") {
      if (replay.payload?.quote_store) setQuoteStoreHeader(res, replay.payload.quote_store);
      return res.json(replay.payload);
    }

    const planInfo = await loadPlanInfo(req.user.id);
    let quoteRecord = null;

    if (parsed.data.quote_id) {
      quoteRecord = await readPackageQuote({
        quoteId: parsed.data.quote_id,
        userId: req.user.id,
      });
      if (!quoteRecord) {
        return res.status(404).json({
          error: "package_quote_not_found",
          message: t(lang, "package_quote_not_found"),
        });
      }
    } else {
      const packageTotal = Number(parsed.data.package_total || 0);
      const validation = validatePackageInput({
        lang,
        packageTotal,
        breakdown: parsed.data.breakdown,
        planCode: planInfo.planCode,
      });
      if (!validation.ok) {
        return res.status(validation.status).json(validation.payload);
      }
      const requestKey = buildPackageQuoteRequestKey({
        userId: req.user.id,
        normalizedPlan: planInfo.normalizedPlan,
        packageTotal,
        breakdown: validation.breakdown,
      });
      let quote;
      try {
        quote = computePackageQuote({
          planCode: planInfo.planCode,
          packageTotal,
          breakdown: validation.breakdown,
        });
      } catch (pricingError) {
        if (String(pricingError?.message || "").startsWith("pricing_not_available:")) {
          return res.status(503).json({ error: "pricing_not_available", message: t(lang, "pricing_not_available") });
        }
        throw pricingError;
      }
      quoteRecord = await upsertPackageQuote({
        userId: req.user.id,
        requestKey,
        quote,
      });
    }

    const quote = quoteRecord.quote;
    const quoteStore = normalizeQuoteStore(quoteRecord?.source);
    setQuoteStoreHeader(res, quoteStore);
    if (quoteRecord?.checkout_session_id) {
      let previousCheckoutUrl = null;
      try {
        const previousSession = await stripe.checkout.sessions.retrieve(String(quoteRecord.checkout_session_id));
        previousCheckoutUrl = previousSession?.url || null;
      } catch {}
      const replayPayload = {
        ok: true,
        replay: true,
        quote_store: quoteStore,
        message: t(lang, "package_checkout_created"),
        quote: {
          ...quote,
          expires_at: quoteRecord.expires_at,
        },
        checkout: {
          id: quoteRecord.checkout_session_id || null,
          url: previousCheckoutUrl,
        },
      };
      await saveReplay(supabaseAdmin, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: replayPayload,
      });
      return res.json(replayPayload);
    }

    const checkoutUrls = buildPackageCheckoutUrls(req, parsed.data);
    const lineItems = buildPackageCheckoutLineItems(quote);
    if (lineItems.length === 0) {
      return res.status(400).json({ error: "package_breakdown_required", message: t(lang, "package_breakdown_required") });
    }

    let stripeCustomerId = null;
    let useCustomerEmailFallback = false;
    try {
      const customer = await getOrCreateStripeCustomer({ db: supabaseAdmin, user: req.user });
      stripeCustomerId = customer?.stripeCustomerId || null;
    } catch (customerError) {
      if (!isMissingStripeCustomersTableError(customerError)) throw customerError;
      useCustomerEmailFallback = true;
      logger.warn("coins_package_checkout_customer_link_skipped", {
        userId: req.user?.id || null,
        reason: "stripe_customers_table_missing",
      });
    }

    const metadata = {
      ...sanitizeCheckoutMetadata(parsed.data.metadata),
      purchase_kind: "coin_package_mix",
      user_id: String(req.user.id),
      plan_code: String(quote.plan_code),
      package_total: String(quote.package_total),
      breakdown_common: String(quote.breakdown.common),
      breakdown_pro: String(quote.breakdown.pro),
      breakdown_ultra: String(quote.breakdown.ultra),
      fee_percent: String(quote.fee_percent),
      fee_cents: String(quote.fee_cents),
      total_cents: String(quote.total_cents),
      pricing_version: String(quote?.pricing?.pricing_version || quote?.pricing_version || COIN_PACKAGE_PRICING_VERSION),
      subtotal_base: String(quote?.pricing?.subtotal_base ?? quote.subtotal_cents),
      subtotal_cents: String(quote?.pricing?.subtotal_base ?? quote.subtotal_cents),
      purchase_fee_amount: String(quote?.pricing?.purchase_fee_amount ?? quote.fee_cents),
      conversion_fee_amount: String(quote?.pricing?.conversion_fee_amount ?? 0),
      fees_total: String(quote?.pricing?.fees_total ?? quote.fee_cents),
      total_amount: String(quote?.pricing?.total_amount ?? quote.total_cents),
      quote_id: String(quote.quote_id),
    };

    const checkoutSessionPayload = {
      mode: "payment",
      line_items: lineItems,
      success_url: checkoutUrls.successUrl,
      cancel_url: checkoutUrls.cancelUrl,
      client_reference_id: req.user.id,
      metadata,
      payment_intent_data: { metadata },
    };
    if (stripeCustomerId) {
      checkoutSessionPayload.customer = stripeCustomerId;
    } else if (useCustomerEmailFallback && req.user?.email) {
      checkoutSessionPayload.customer_email = req.user.email;
    }

    const session = await stripe.checkout.sessions.create(checkoutSessionPayload);
    const createdPaymentIntentId =
      typeof session?.payment_intent === "string"
        ? session.payment_intent
        : (typeof session?.payment_intent?.id === "string" ? session.payment_intent.id : null);
    await markPackageQuoteUsed({
      quoteId: quote.quote_id,
      userId: req.user.id,
      checkoutSessionId: session?.id || null,
      paymentIntentId: createdPaymentIntentId,
    });

    const responsePayload = {
      ok: true,
      quote_store: quoteStore,
      message: t(lang, "package_checkout_created"),
      quote: {
        ...quote,
        expires_at: quoteRecord.expires_at,
      },
      checkout: {
        id: session?.id || null,
        url: session?.url || null,
      },
    };

    await saveReplay(supabaseAdmin, {
      userId: req.user.id,
      endpoint,
      key: idempotencyKey,
      requestHash,
      response: responsePayload,
    });

    logger.info("coins_package_checkout_created", {
      userId: req.user.id,
      idempotencyKeyPrefix: idemPrefix(idempotencyKey),
      sessionIdPrefix: idemPrefix(session?.id),
      paymentIntentIdPrefix: idemPrefix(createdPaymentIntentId),
      quoteIdPrefix: idemPrefix(quote.quote_id),
      packageTotal: quote.package_total,
      common: quote.breakdown.common,
      pro: quote.breakdown.pro,
      ultra: quote.breakdown.ultra,
      totalCents: quote.total_cents,
      quoteStore,
    });

    return res.json(responsePayload);
  } catch (error) {
    logger.error("coins_package_checkout_create_failed", {
      userId: req.user?.id,
      idempotencyKeyPrefix: idemPrefix(req.headers["idempotency-key"]),
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error", message: error?.message || String(error) });
  }
});

/**
 * POST /api/coins/purchase/quote
 */
router.post("/purchase/quote", generateLimiter, async (req, res) => {
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }

    const parsed = PurchaseQuoteSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });

    const { coin_type, amount } = parsed.data;
    const planInfo = await loadPlanInfo(req.user.id);
    if (!canPurchaseCoin(planInfo.planCode, coin_type)) {
      const lang = resolveLang(req);
      return res.status(403).json({
        error: "coin_purchase_not_allowed_for_plan",
        message: t(lang, "feature_not_available_for_plan"),
        plan: planInfo.planCode,
        coin_type,
      });
    }

    const quote = computePurchaseQuote({ coinType: coin_type, amount, planCode: planInfo.planCode });
    return res.json({
      ok: true,
      quote: {
        coin_type,
        amount,
        plan_code: planInfo.planCode,
        normalized_plan: quote.normalizedPlan,
        unit_price_cents: quote.unitPriceCents,
        unit_price_brl: centsToBrl(quote.unitPriceCents),
        subtotal_cents: quote.subtotalCents,
        subtotal_brl: quote.subtotalBrl,
        fee_percent: quote.feePercent,
        fee_cents: quote.feeCents,
        fee_brl: quote.feeBrl,
        total_cents: quote.totalCents,
        total_brl: quote.totalBrl,
        currency: "BRL",
      },
    });
  } catch (error) {
    logger.error("coins_purchase_quote_failed", {
      userId: req.user?.id,
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error", message: error?.message || String(error) });
  }
});

/**
 * POST /api/coins/purchase/create
 */
router.post("/purchase/create", generateLimiter, async (req, res) => {
  const endpoint = "coins_purchase_create";
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }

    const parsed = PurchaseCreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    const idempotencyKey = makeIdempotencyKey(req, parsed.data.idempotency_key, endpoint);
    const requestHash = buildRequestHash({ userId: req.user.id, endpoint, body: parsed.data });

    const replay = await readReplay(supabaseAdmin, {
      userId: req.user.id,
      endpoint,
      key: idempotencyKey,
      requestHash,
    });
    if (replay.kind === "conflict") {
      const lang = resolveLang(req);
      return res.status(409).json({
        error: "idempotency_conflict",
        message: t(lang, "idempotency_conflict"),
      });
    }
    if (replay.kind === "replay") return res.json(replay.payload);

    const { coin_type, amount, metadata } = parsed.data;
    const planInfo = await loadPlanInfo(req.user.id);
    if (!canPurchaseCoin(planInfo.planCode, coin_type)) {
      const lang = resolveLang(req);
      return res.status(403).json({
        error: "coin_purchase_not_allowed_for_plan",
        message: t(lang, "feature_not_available_for_plan"),
        plan: planInfo.planCode,
        coin_type,
      });
    }

    const quote = computePurchaseQuote({ coinType: coin_type, amount, planCode: planInfo.planCode });
    const payload = {
      user_id: req.user.id,
      coin_type,
      amount,
      plan_code: planInfo.planCode,
      normalized_plan: quote.normalizedPlan,
      unit_price_cents: quote.unitPriceCents,
      subtotal_cents: quote.subtotalCents,
      fee_percent: quote.feePercent,
      fee_cents: quote.feeCents,
      total_cents: quote.totalCents,
      status: "created",
      idempotency_key_create: idempotencyKey,
      metadata: metadata || {},
    };

    let intentRow = null;
    const insertResult = await supabaseAdmin.from("credit_purchase_intents").insert(payload).select("*").maybeSingle();
    if (insertResult.error) {
      const duplicate = String(insertResult.error.message || "").toLowerCase().includes("duplicate");
      if (!duplicate) {
        return res.status(400).json({ error: "purchase_intent_create_failed", details: insertResult.error.message });
      }

      const existing = await supabaseAdmin
        .from("credit_purchase_intents")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("idempotency_key_create", idempotencyKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing.error || !existing.data) {
        return res.status(409).json({ error: "idempotency_conflict", message: "Nao foi possivel recuperar o intent existente." });
      }
      intentRow = existing.data;
    } else {
      intentRow = insertResult.data;
    }

    const responsePayload = {
      ok: true,
      intent: {
        id: intentRow.id,
        status: intentRow.status,
        coin_type: intentRow.coin_type,
        amount: intentRow.amount,
        fee_percent: intentRow.fee_percent,
        total_cents: intentRow.total_cents,
        total_brl: centsToBrl(intentRow.total_cents),
        created_at: intentRow.created_at,
      },
      payment: {
        provider: "mock",
        requires_confirmation: true,
      },
    };

    await saveReplay(supabaseAdmin, {
      userId: req.user.id,
      endpoint,
      key: idempotencyKey,
      requestHash,
      response: responsePayload,
    });

    return res.json(responsePayload);
  } catch (error) {
    logger.error("coins_purchase_create_failed", {
      userId: req.user?.id,
      idempotencyKeyPrefix: idemPrefix(req.headers["idempotency-key"]),
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error", message: error?.message || String(error) });
  }
});

/**
 * POST /api/coins/purchase/confirm
 */
router.post("/purchase/confirm", generateLimiter, async (req, res) => {
  const endpoint = "coins_purchase_confirm";
  try {
    if (!isSupabaseAdminEnabled() || !supabaseAdmin) {
      return res.status(503).json({ error: "supabase_admin_unavailable" });
    }

    const parsed = PurchaseConfirmSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    const idempotencyKey = makeIdempotencyKey(req, parsed.data.idempotency_key, endpoint);
    const requestHash = buildRequestHash({ userId: req.user.id, endpoint, body: parsed.data });

    const replay = await readReplay(supabaseAdmin, {
      userId: req.user.id,
      endpoint,
      key: idempotencyKey,
      requestHash,
    });
    if (replay.kind === "conflict") {
      const lang = resolveLang(req);
      return res.status(409).json({
        error: "idempotency_conflict",
        message: t(lang, "idempotency_conflict"),
      });
    }
    if (replay.kind === "replay") return res.json(replay.payload);

    const { data: intent, error: intentError } = await supabaseAdmin
      .from("credit_purchase_intents")
      .select("*")
      .eq("id", parsed.data.intent_id)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (intentError) return res.status(400).json({ error: "purchase_intent_lookup_failed", details: intentError.message });
    if (!intent) return res.status(404).json({ error: "purchase_intent_not_found" });

    if (intent.status === "confirmed") {
      const alreadyConfirmedPayload = {
        ok: true,
        intent: {
          id: intent.id,
          status: intent.status,
          coin_type: intent.coin_type,
          amount: intent.amount,
          confirmed_at: intent.confirmed_at,
        },
        replay: true,
      };
      await saveReplay(supabaseAdmin, {
        userId: req.user.id,
        endpoint,
        key: idempotencyKey,
        requestHash,
        response: alreadyConfirmedPayload,
      });
      return res.json(alreadyConfirmedPayload);
    }

    if (intent.status !== "created") {
      return res.status(400).json({ error: "invalid_intent_status", status: intent.status });
    }

    const credit = buildCreditPayload(intent.coin_type, Number(intent.amount));
    const sourceEventId = `purchase_intent:${intent.id}`;

    const { data: creditData, error: creditError } = await supabaseAdmin.rpc("coins_credit_v1", {
      p_user_id: req.user.id,
      p_common: credit.common,
      p_pro: credit.pro,
      p_ultra: credit.ultra,
      p_feature: "coins_purchase_confirm",
      p_source_event_id: sourceEventId,
      p_meta: {
        intent_id: intent.id,
        coin_type: intent.coin_type,
        amount: intent.amount,
        total_cents: intent.total_cents,
      },
    });

    if (creditError) {
      await supabaseAdmin
        .from("credit_purchase_intents")
        .update({
          status: "failed",
          error: creditError.message,
          idempotency_key_confirm: idempotencyKey,
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.id);

      return res.status(400).json({ error: "purchase_credit_failed", details: creditError.message });
    }

    await supabaseAdmin
      .from("credit_purchase_intents")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        idempotency_key_confirm: idempotencyKey,
        updated_at: new Date().toISOString(),
      })
      .eq("id", intent.id);

    const wallet = await getWalletSnapshotAuthed(req.access_token, req.user.id);
    const responsePayload = {
      ok: true,
      intent: {
        id: intent.id,
        status: "confirmed",
        coin_type: intent.coin_type,
        amount: intent.amount,
        confirmed_at: new Date().toISOString(),
      },
      grant: {
        status: creditData?.status || "ok",
        delta: creditData?.delta || credit,
      },
      balance: wallet,
    };

    await saveReplay(supabaseAdmin, {
      userId: req.user.id,
      endpoint,
      key: idempotencyKey,
      requestHash,
      response: responsePayload,
    });

    logger.info("coins_purchase_confirm_success", {
      userId: req.user.id,
      idempotencyKeyPrefix: idemPrefix(idempotencyKey),
      intentId: intent.id,
      coinType: intent.coin_type,
      amount: intent.amount,
    });

    return res.json(responsePayload);
  } catch (error) {
    logger.error("coins_purchase_confirm_failed", {
      userId: req.user?.id,
      idempotencyKeyPrefix: idemPrefix(req.headers["idempotency-key"]),
      message: error?.message || String(error),
    });
    return res.status(500).json({ error: "server_error", message: error?.message || String(error) });
  }
});

export default router;
