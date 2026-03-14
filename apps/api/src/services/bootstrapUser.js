import supabaseAdmin, { isSupabaseAdminEnabled } from "../config/supabaseAdmin.js";

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
    // profiles
    await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email: email || null,
          display_name: null,
          plan_code: "FREE",
        },
        { onConflict: "id" }
      );
  } catch {
    // ignore
  }

  try {
    // carteira
    await supabaseAdmin
      .from("creator_coins_wallet")
      .upsert(
        {
          user_id: userId,
          common_balance: 0,
          pro_balance: 0,
          ultra_balance: 0,
        },
        { onConflict: "user_id" }
      );
  } catch {
    // ignore
  }

  try {
    // limites (pode não existir em ambientes antigos)
    await supabaseAdmin
      .from("credits_limits")
      .upsert(
        {
          user_id: userId,
          daily_common_limit: 100,
          daily_pro_limit: 25,
          daily_ultra_limit: 0,
        },
        { onConflict: "user_id" }
      );
  } catch {
    // ignore
  }
}
