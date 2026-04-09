const SENSITIVE_KEYS = new Set([
  "authorization",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret",
  "cookie",
]);

type LogLevel = "info" | "warn" | "error";

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      output[key] = "***";
      continue;
    }

    if (rawValue && typeof rawValue === "object") {
      output[key] = sanitize(rawValue);
    } else {
      output[key] = rawValue;
    }
  }

  return output;
}

export function logWebEvent(level: LogLevel, msg: string, meta: Record<string, unknown> = {}) {
  const sanitizedMeta = sanitize(meta) as Record<string, unknown>;
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: "web",
    env: process.env.NODE_ENV || "development",
    ...sanitizedMeta,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    process.stderr.write(`${line}\n`);
    return;
  }

  process.stdout.write(`${line}\n`);
}
