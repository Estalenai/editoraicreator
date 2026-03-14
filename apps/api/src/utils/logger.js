const SENSITIVE_KEYS = new Set([
  "token",
  "apikey",
  "authorization",
  "stripe-signature",
  "password",
  "secret",
  "access_token",
  "refresh_token",
]);

function mask(value) {
  const str = String(value || "");
  if (!str) return "";
  if (str.length <= 8) return "***";
  return `${str.slice(0, 4)}***${str.slice(-2)}`;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = mask(val);
    } else if (val && typeof val === "object") {
      out[key] = sanitize(val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

function write(level, msg, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: "api",
    env: process.env.NODE_ENV || "development",
    ...sanitize(meta),
  };
  console.log(JSON.stringify(payload));
}

export const logger = {
  debug(msg, meta) {
    write("debug", msg, meta);
  },
  info(msg, meta) {
    write("info", msg, meta);
  },
  warn(msg, meta) {
    write("warn", msg, meta);
  },
  error(msg, meta) {
    write("error", msg, meta);
  },
};
