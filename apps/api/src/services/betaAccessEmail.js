import { logger } from "../utils/logger.js";

function maskEmail(email) {
  const value = String(email || "").trim();
  const atIndex = value.indexOf("@");
  if (!value || atIndex <= 1) return "***";
  return `${value.slice(0, 2)}***${value.slice(atIndex)}`;
}

function pickBaseUrl() {
  const candidates = [
    process.env.APP_URL,
    process.env.FRONTEND_URL,
    process.env.WEB_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_WEB_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value.replace(/\/+$/, "");
    }
  }
  return "http://localhost:3001";
}

function buildApprovedTemplate({ loginUrl }) {
  const platformName = "Editor AI Creator";
  const assistantName = "EditexAI";
  const subject = `${platformName}: acesso liberado no beta fechado`;
  const text = [
    "Seu acesso ao beta fechado foi liberado.",
    "",
    `${platformName}`,
    `Assistente interno: ${assistantName}`,
    "",
    `Entre pela plataforma: ${loginUrl}`,
    "",
    "Observação: este é um beta fechado com melhorias contínuas.",
  ].join("\n");

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5">
  <h2 style="margin:0 0 10px 0;color:#0b1220">Acesso liberado no beta fechado</h2>
  <p style="margin:0 0 10px 0">Seu acesso ao <strong>${platformName}</strong> foi aprovado.</p>
  <p style="margin:0 0 14px 0">Agora você já pode entrar na plataforma e começar a usar os módulos Creator.</p>
  <p style="margin:0 0 14px 0">
    <a href="${loginUrl}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#34F5FF;color:#0b1220;text-decoration:none;font-weight:700">
      Entrar na plataforma
    </a>
  </p>
  <p style="margin:0 0 6px 0;font-size:13px;color:#334155">
    Assistente interno: <strong>${assistantName}</strong>
  </p>
  <p style="margin:0;font-size:13px;color:#334155">
    Observação: este é um beta fechado com melhorias contínuas.
  </p>
</div>`.trim();

  return { subject, text, html };
}

async function sendWithResend({ to, subject, text, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { attempted: false, sent: false, reason: "provider_not_configured", provider: "resend" };
  }

  const from =
    String(process.env.BETA_ACCESS_FROM_EMAIL || "").trim() ||
    String(process.env.RESEND_FROM_EMAIL || "").trim() ||
    "";

  if (!from) {
    return { attempted: false, sent: false, reason: "missing_from_email", provider: "resend" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const reason =
        String(payload?.error?.message || payload?.message || response.statusText || "provider_error").slice(0, 180);
      logger.warn("beta_access_email_send_failed", {
        provider: "resend",
        status: response.status,
        reason,
      });
      return { attempted: true, sent: false, reason, provider: "resend" };
    }

    const payload = await response.json().catch(() => null);
    const messageId = String(payload?.id || "").trim() || null;
    return { attempted: true, sent: true, provider: "resend", message_id: messageId };
  } catch (error) {
    const reason = String(error?.message || "provider_exception").slice(0, 180);
    logger.warn("beta_access_email_send_exception", {
      provider: "resend",
      reason,
    });
    return { attempted: true, sent: false, reason, provider: "resend" };
  }
}

export async function sendBetaAccessApprovedEmail({ email }) {
  const to = String(email || "").trim().toLowerCase();
  if (!to) return { attempted: false, sent: false, reason: "missing_email", provider: "resend" };

  const baseUrl = pickBaseUrl();
  const loginUrl = `${baseUrl}/login`;
  const template = buildApprovedTemplate({ loginUrl });

  const delivery = await sendWithResend({
    to,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });

  const normalized = {
    attempted: Boolean(delivery?.attempted),
    sent: Boolean(delivery?.sent),
    provider: String(delivery?.provider || "resend"),
    reason: delivery?.reason ? String(delivery.reason) : null,
    message_id: delivery?.message_id ? String(delivery.message_id) : null,
    login_url: loginUrl,
  };

  if (!normalized.sent) {
    logger.info("beta_access_email_delivery_skipped", {
      email_hint: maskEmail(to),
      provider: normalized.provider || "none",
      reason: normalized.reason || "provider_not_configured",
    });
    return normalized;
  }

  logger.info("beta_access_email_delivered", {
    email_hint: maskEmail(to),
    provider: normalized.provider || "unknown",
    message_id: normalized.message_id || null,
  });
  return normalized;
}
