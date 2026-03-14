const ADMIN_EMAILS = ["desenvolvedordeappsai@gmail.com"];

export function isAdminUser(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return false;
  return ADMIN_EMAILS.includes(email);
}

export function adminOnly(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "not_authenticated" });
  }
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: "admin_forbidden" });
  }
  return next();
}
