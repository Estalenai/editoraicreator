import test from "node:test";
import assert from "node:assert/strict";

import { getRecentProductEvents, recordProductEvent } from "../src/utils/eventsStore.js";
import {
  getDashboardErrors,
  getDashboardRouting,
  getDashboardUsage,
  getMetricSnapshot,
  recordUsageMetric,
} from "../src/utils/metrics.js";

test("operational events store sanitizes and records product events", () => {
  const marker = `operational-${Date.now()}`;

  recordProductEvent({
    event: "checkout.subscription.created",
    userId: "user-operational",
    plan: "EDITOR_PRO",
    additional: {
      source: "stripe.checkout",
      status: "success",
      reason: marker,
      prompt: "should-not-leak",
      token: "should-not-leak",
    },
  });

  const [latest] = getRecentProductEvents({ limit: 1 });
  assert.ok(latest);
  assert.equal(latest.event, "checkout.subscription.created");
  assert.equal(latest.userId, "user-operational");
  assert.equal(latest.plan, "EDITOR_PRO");
  assert.equal(latest.additional?.source, "stripe.checkout");
  assert.equal(latest.additional?.status, "success");
  assert.equal(latest.additional?.reason, marker);
  assert.equal(Object.prototype.hasOwnProperty.call(latest.additional || {}, "prompt"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(latest.additional || {}, "token"), false);
});

test("metrics store aggregates critical routing and error signals", () => {
  const before = getMetricSnapshot();

  recordUsageMetric({
    userId: "user-operational",
    feature: "creator_post",
    plan: "EDITOR_PRO",
    mode: "quality",
    provider: "openai",
    statusCode: 200,
    totalCostScore: 1.25,
  });
  recordUsageMetric({
    userId: "user-operational",
    feature: "checkout_subscription",
    plan: "EDITOR_PRO",
    mode: "manual",
    provider: "stripe",
    statusCode: 502,
    errorCode: "stripe_checkout_failed",
    totalCostScore: 0,
  });

  const usage = getDashboardUsage({});
  const errors = getDashboardErrors({});
  const routing = getDashboardRouting({});
  const after = getMetricSnapshot();

  assert.ok(Number(after.total_usage_samples) >= Number(before.total_usage_samples) + 2);
  assert.ok(Array.isArray(usage.by_feature));
  assert.ok(usage.by_feature.some((item) => item.feature === "creator_post"));
  assert.ok(Array.isArray(errors.items));
  assert.ok(errors.items.some((item) => item.error === "stripe_checkout_failed"));
  assert.ok(Number(routing.modes.quality) >= 1);
  assert.ok(Number(routing.modes.manual) >= 1);
  assert.ok(Array.isArray(routing.providers));
  assert.ok(routing.providers.some((item) => item.provider === "stripe"));
});
