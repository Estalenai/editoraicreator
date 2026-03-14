import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { adminOnly } from "../utils/adminAuth.js";
import { getConfig } from "../utils/configCache.js";
import { logger } from "../utils/logger.js";
import { getOpenApiSpec } from "../docs/openapi.js";
import { getUserManual } from "../docs/manual.js";
import { resolveLang } from "../utils/i18n.js";

const router = express.Router();
const isProduction = process.env.NODE_ENV === "production";

async function resolveDocsMode() {
  if (!isProduction) {
    return { enabled: true, adminOnly: false };
  }

  try {
    const cfg = await getConfig("docs.public_api");
    const enabled = cfg?.enabled === true;
    return { enabled, adminOnly: true };
  } catch (error) {
    logger.warn("docs_config_lookup_failed", { message: error?.message || "unknown_error" });
    return { enabled: false, adminOnly: true };
  }
}

function renderSwaggerHtml({ openApiUrl }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Editor AI Creator API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "${openApiUrl}",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
      });
    </script>
  </body>
</html>`;
}

async function handleOpenApiJson(req, res) {
  const docsMode = await resolveDocsMode();
  if (!docsMode.enabled) return res.status(404).json({ error: "not_found" });

  if (docsMode.adminOnly) {
    return authMiddleware(req, res, () => adminOnly(req, res, () => sendOpenApi(req, res)));
  }

  return sendOpenApi(req, res);
}

function sendOpenApi(req, res) {
  const scheme = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers.host || "localhost";
  const serverUrl = `${scheme}://${host}/api`;
  const lang = resolveLang(req);
  return res.json(getOpenApiSpec(lang, { serverUrl }));
}

async function handleDocsUi(req, res) {
  const docsMode = await resolveDocsMode();
  if (!docsMode.enabled) return res.status(404).json({ error: "not_found" });

  if (docsMode.adminOnly) {
    return authMiddleware(req, res, () => adminOnly(req, res, () => sendDocsUi(req, res)));
  }

  return sendDocsUi(req, res);
}

function sendDocsUi(req, res) {
  const base = req.baseUrl || "";
  const lang = resolveLang(req);
  const openApiUrl = `${base}/openapi.json?lang=${encodeURIComponent(lang)}`;
  res.setHeader("content-type", "text/html; charset=utf-8");
  return res.send(renderSwaggerHtml({ openApiUrl }));
}

router.get("/openapi.json", handleOpenApiJson);
router.get("/docs", handleDocsUi);
router.get("/help/manual", authMiddleware, (req, res) => {
  const lang = resolveLang(req);
  return res.json({ ok: true, lang, manual: getUserManual(lang) });
});

export default router;
