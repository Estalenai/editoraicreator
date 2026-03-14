// apps/api/src/config/supabaseAdmin.js
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
export const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

// ✅ Admin é opcional (dev/teste não deve crashar)
export const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const isSupabaseAdminEnabled = () => supabaseAdmin !== null;

// ✅ compat com imports antigos (default)
export default supabaseAdmin;