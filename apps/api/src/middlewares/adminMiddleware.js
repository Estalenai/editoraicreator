import supabaseAdmin from "../config/supabaseAdmin.js";

/**
 * Require admin role.
 *
 * - Assumes authMiddleware already ran and set req.user.
 * - Checks profiles.role === 'admin'.
 * - Uses service role client to avoid RLS edge cases, but always verifies caller.
 */
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: "Failed to verify admin role" });
    }

    if (data?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.isAdmin = true;
    return next();
  } catch {
    return res.status(500).json({ error: "Admin middleware failure" });
  }
};
