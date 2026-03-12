import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import healthRoutes from "./src/routes/healthRoutes.js";

import authRoutes from "./src/routes/authRoutes.js";
import protectedRoutes from "./src/routes/protectedRoutes.js";

import projectsRoutes from "./src/routes/projectsRoutes.js";
import textsRoutes from "./src/routes/textsRoutes.js";
import promptsRoutes from "./src/routes/promptsRoutes.js";

import planRoutes from "./src/routes/planRoutes.js";
import billingRoutes from "./src/routes/billingRoutes.js";
import webhooksRoutes from "./src/routes/webhooksRoutes.js";

import coinsRoutes from "./src/routes/coinsRoutes.js";
import usageRoutes from "./src/routes/usageRoutes.js";
import aiRoutes from "./src/routes/aiRoutes.js";
import factChecksRoutes from "./src/routes/factChecksRoutes.js";
import adminRoutes from "./src/routes/adminRoutes.js";

import { notFound } from "./src/middlewares/notFound.js";
import { errorHandler } from "./src/middlewares/errorHandler.js";

dotenv.config();

const app = express();

// Segurança básica (SaaS)
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan("dev"));

// Rate limit global simples (ajustável)
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// Stripe webhook exige raw body (ANTES do express.json)
app.use("/webhooks", express.raw({ type: "application/json" }), webhooksRoutes);

// JSON para o resto
app.use(express.json({ limit: "2mb" }));
// Suporta form-url-encoded (facilita testes via PowerShell/curl sem escaping de JSON)
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => res.json({ ok: true, name: "Editor AI Creator API" }));

// Healthchecks (k8s / uptime monitors)
app.use("/health", healthRoutes);

// Rotas
app.use("/auth", authRoutes);
// Alias compatível com a maioria dos clientes e docs (mantém /auth como rota principal)
app.use("/api/auth", authRoutes);
app.use("/protected", protectedRoutes);

app.use("/api/projects", projectsRoutes);
app.use("/api/texts", textsRoutes);
app.use("/api/prompts", promptsRoutes);

app.use("/api/plan", planRoutes);
app.use("/api/billing", billingRoutes);

app.use("/api/coins", coinsRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/fact-checks", factChecksRoutes);

// Admin (configs, plans, audit). Requires profiles.role='admin'
app.use("/api/admin", adminRoutes);

// 404 + errors
app.use(notFound);
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
