import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";

async function insertIfMissing(table, values, onConflict) {
  const { error } = await supabaseAdmin
    .from(table)
    .upsert(values, {
      onConflict,
      ignoreDuplicates: true,
    });

  if (error) throw error;
}

/**
 * Garante que o usuário tenha:
 * - profile
 * - creator_coins_wallet
 * - credits_limits
 *
 * Falhas são silenciosas para não bloquear o login.
 */
export async function bootstrapUser({ userId, email }) {
  if (!isSupabaseAdminEnabled()) return;
  if (!userId) return;

  try {
    await insertIfMissing(
      "profiles",
      {
        id: userId,
        email: email || null,
        display_name: null,
        plan_code: "FREE",
      },
      "id"
    );
  } catch {
    // ignore
  }

  try {
    await insertIfMissing(
      "creator_coins_wallet",
      {
        user_id: userId,
        common: 0,
        pro: 0,
        ultra: 0,
      },
      "user_id"
    );
  } catch {
    try {
      await insertIfMissing(
        "creator_coins_wallet",
        {
          user_id: userId,
          common_balance: 0,
          pro_balance: 0,
          ultra_balance: 0,
        },
        "user_id"
      );
    } catch {
      // ignore
    }
  }

  try {
    await insertIfMissing(
      "credits_limits",
      {
        user_id: userId,
        daily_common_limit: 100,
        daily_pro_limit: 25,
        daily_ultra_limit: 0,
      },
      "user_id"
    );
  } catch {
    // ignore
  }
}
