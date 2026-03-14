import { logger } from "./logger.js";

const MAX_METRIC_ENTRIES = 5000;
const MAX_USAGE_ENTRIES = 10000;

const metricEntries = [];
const usageEntries = [];

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function normalizeTagValue(value, fallback = "n/a") {
  if (value == null) return fallback;
  const raw = String(value).trim();
  return raw || fallback;
}

function normalizeTags(tags = {}) {
  if (!tags || typeof tags !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(tags)) {
    out[String(key)] = normalizeTagValue(value);
  }
  return out;
}

function pushBounded(target, item, maxSize) {
  target.push(item);
  if (target.length > maxSize) {
    target.splice(0, target.length - maxSize);
  }
}

function emitMetric(type, name, value, tags = {}) {
  const entry = {
    timestamp: nowIso(),
    type,
    name: String(name || "unknown_metric"),
    value: Number(value || 0),
    tags: normalizeTags(tags),
  };
  pushBounded(metricEntries, entry, MAX_METRIC_ENTRIES);
  logger.info("metric", { metric: entry });
  return entry;
}

export function metricIncrement(name, tags = {}) {
  return emitMetric("counter", name, 1, tags);
}

export function metricTiming(name, ms, tags = {}) {
  return emitMetric("timing", name, Number(ms || 0), tags);
}

export function metricGauge(name, value, tags = {}) {
  return emitMetric("gauge", name, Number(value || 0), tags);
}

export function recordUsageMetric({
  userId = null,
  feature = "unknown",
  plan = "FREE",
  mode = "quality",
  provider = "n/a",
  statusCode = 200,
  errorCode = null,
  totalCostScore = 0,
  timestamp = null,
} = {}) {
  const entry = {
    timestamp: timestamp || nowIso(),
    ts_ms: nowMs(),
    userId: userId ? String(userId) : null,
    feature: normalizeTagValue(feature, "unknown"),
    plan: normalizeTagValue(plan, "FREE"),
    mode: normalizeTagValue(mode, "quality"),
    provider: normalizeTagValue(provider, "n/a"),
    statusCode: Number(statusCode || 0),
    errorCode: errorCode == null ? null : String(errorCode),
    totalCostScore: Number(totalCostScore || 0),
  };
  pushBounded(usageEntries, entry, MAX_USAGE_ENTRIES);
  return entry;
}

function filterUsageEntries({ userId = null, sinceMs = null } = {}) {
  const cutoff = Number(sinceMs || 0);
  return usageEntries.filter((entry) => {
    if (userId && entry.userId !== String(userId)) return false;
    if (cutoff > 0 && Number(entry.ts_ms || 0) < cutoff) return false;
    return true;
  });
}

function aggregateUsage(entries, groupBy) {
  const map = new Map();
  for (const entry of entries) {
    let key = "";
    let date = null;
    if (groupBy === "plan") {
      key = `plan:${entry.plan}`;
    } else if (groupBy === "date") {
      date = String(entry.timestamp || "").slice(0, 10) || "unknown";
      key = `date:${date}:feature:${entry.feature}:plan:${entry.plan}`;
    } else {
      key = `feature:${entry.feature}:plan:${entry.plan}`;
    }

    const current = map.get(key) || {
      feature: entry.feature,
      plan: entry.plan,
      count: 0,
      totalCostScore: 0,
      ...(date ? { date } : {}),
    };
    current.count += 1;
    current.totalCostScore = Number((current.totalCostScore + Number(entry.totalCostScore || 0)).toFixed(4));
    map.set(key, current);
  }
  return Array.from(map.values());
}

export function getUsageSummary({ groupBy = "feature", userId = null } = {}) {
  const normalizedGroupBy = ["feature", "plan", "date"].includes(String(groupBy)) ? String(groupBy) : "feature";
  const entries = filterUsageEntries({ userId });
  const summary = aggregateUsage(entries, normalizedGroupBy);
  return summary.sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
}

function windowCount(entries, ms) {
  const cutoff = nowMs() - ms;
  return entries.filter((entry) => Number(entry.ts_ms || 0) >= cutoff);
}

export function getDashboardUsage({ userId = null } = {}) {
  const entries = filterUsageEntries({ userId });
  const last24hEntries = windowCount(entries, 24 * 60 * 60 * 1000);
  const last7dEntries = windowCount(entries, 7 * 24 * 60 * 60 * 1000);
  const last30dEntries = windowCount(entries, 30 * 24 * 60 * 60 * 1000);

  const byFeature = aggregateUsage(last30dEntries, "feature")
    .map((item) => ({
      feature: item.feature,
      count: item.count,
      totalCostScore: item.totalCostScore,
    }))
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));

  return {
    last24h: { total: last24hEntries.length },
    last7d: { total: last7dEntries.length },
    last30d: { total: last30dEntries.length },
    by_feature: byFeature,
  };
}

export function getDashboardErrors({ userId = null } = {}) {
  const entries = filterUsageEntries({ userId });
  const freq = new Map();

  for (const entry of entries) {
    const statusCode = Number(entry.statusCode || 0);
    const errorCode = entry.errorCode ? String(entry.errorCode) : null;
    if (statusCode < 400 && !errorCode) continue;
    const key = errorCode || String(statusCode || "unknown");
    freq.set(key, Number(freq.get(key) || 0) + 1);
  }

  const items = Array.from(freq.entries())
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));

  return { items };
}

export function getDashboardRouting({ userId = null } = {}) {
  const entries = filterUsageEntries({ userId });
  const modeCounts = { quality: 0, economy: 0, manual: 0, unknown: 0 };
  const providerCounts = new Map();

  for (const entry of entries) {
    const mode = String(entry.mode || "unknown").toLowerCase();
    if (mode in modeCounts) modeCounts[mode] += 1;
    else modeCounts.unknown += 1;

    const provider = normalizeTagValue(entry.provider, "n/a");
    providerCounts.set(provider, Number(providerCounts.get(provider) || 0) + 1);
  }

  const providers = Array.from(providerCounts.entries())
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => Number(b.count || 0) - Number(a.count || 0));

  return {
    modes: modeCounts,
    providers,
  };
}

export function getInternalCostTotals({ userId = null } = {}) {
  const entries = filterUsageEntries({ userId });
  const total = entries.reduce((sum, entry) => sum + Number(entry.totalCostScore || 0), 0);
  const last24h = windowCount(entries, 24 * 60 * 60 * 1000).reduce(
    (sum, entry) => sum + Number(entry.totalCostScore || 0),
    0
  );
  const last7d = windowCount(entries, 7 * 24 * 60 * 60 * 1000).reduce(
    (sum, entry) => sum + Number(entry.totalCostScore || 0),
    0
  );

  return {
    total_cost_score: Number(total.toFixed(4)),
    last24h_cost_score: Number(last24h.toFixed(4)),
    last7d_cost_score: Number(last7d.toFixed(4)),
  };
}

export function getMetricSnapshot() {
  return {
    total_metrics_logged: metricEntries.length,
    total_usage_samples: usageEntries.length,
    last_metric: metricEntries.length ? metricEntries[metricEntries.length - 1] : null,
  };
}

