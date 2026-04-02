import crypto from "crypto";

function resolveSecret() {
  const raw =
    String(process.env.GITHUB_INTEGRATION_SECRET || "").trim() ||
    String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (!raw) {
    throw new Error("github_secret_missing");
  }

  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptGitHubToken(token) {
  const normalized = String(token || "").trim();
  if (!normalized) {
    throw new Error("github_token_missing");
  }

  const key = resolveSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

export function decryptGitHubToken(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("github_token_payload_invalid");
  }

  const key = resolveSecret();
  const iv = Buffer.from(String(payload.iv || ""), "base64");
  const tag = Buffer.from(String(payload.tag || ""), "base64");
  const encrypted = Buffer.from(String(payload.data || ""), "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
