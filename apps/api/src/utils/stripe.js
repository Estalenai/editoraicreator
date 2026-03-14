import Stripe from "stripe";

const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2024-06-20";

export function getStripeClient() {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!key) return null;
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export const stripe = getStripeClient();

export function getStripeWebhookSecret() {
  return (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
}

export function isMissingStripeCustomersTableError(error) {
  const msg = String(error?.message || "").toLowerCase();
  if (!msg.includes("stripe_customers")) return false;
  return (
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

export async function getOrCreateStripeCustomer({ db, user }) {
  if (!db) throw new Error("db_client_required");
  if (!user?.id) throw new Error("user_required");
  if (!stripe) throw new Error("stripe_not_configured");

  let canPersistCustomer = true;
  const existing = await db
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing.error) {
    if (isMissingStripeCustomersTableError(existing.error)) {
      canPersistCustomer = false;
    } else {
      throw new Error(`stripe_customer_lookup_failed: ${existing.error.message}`);
    }
  }

  if (existing.data?.stripe_customer_id) {
    return { stripeCustomerId: existing.data.stripe_customer_id, created: false };
  }

  const customer = await stripe.customers.create({
    email: user.email || undefined,
    metadata: { user_id: user.id },
  });

  if (!canPersistCustomer) {
    return { stripeCustomerId: customer.id, created: true, persisted: false };
  }

  const { error: insertError } = await db.from("stripe_customers").upsert(
    {
      user_id: user.id,
      stripe_customer_id: customer.id,
      email: user.email || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (insertError) {
    if (isMissingStripeCustomersTableError(insertError)) {
      return { stripeCustomerId: customer.id, created: true, persisted: false };
    }

    const byCustomer = await db
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("stripe_customer_id", customer.id)
      .maybeSingle();

    if (byCustomer.error && !isMissingStripeCustomersTableError(byCustomer.error)) {
      throw new Error(`stripe_customer_lookup_failed: ${byCustomer.error.message}`);
    }

    if (!byCustomer.error && byCustomer.data?.stripe_customer_id) {
      return { stripeCustomerId: byCustomer.data.stripe_customer_id, created: false };
    }
    throw new Error(`stripe_customer_upsert_failed: ${insertError.message}`);
  }

  return { stripeCustomerId: customer.id, created: true };
}
