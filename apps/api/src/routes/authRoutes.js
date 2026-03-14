import express from "express";
import supabase from "../config/supabaseClient.js";
import { bootstrapUser } from "../services/bootstrapUser.js";
import { recordProductEvent } from "../utils/eventsStore.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Informe email e password" });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    const { user, session } = data;

    // best-effort bootstrap (não bloqueia login)
    bootstrapUser({ userId: user.id, email: user.email }).catch(() => {});

    try {
      recordProductEvent({
        event: "user.login",
        userId: user.id,
        plan: null,
        additional: { source: "auth.login" },
      });
      const createdAtMs = Date.parse(user?.created_at || "");
      if (Number.isFinite(createdAtMs) && Date.now() - createdAtMs <= 5 * 60 * 1000) {
        recordProductEvent({
          event: "user.signup",
          userId: user.id,
          plan: null,
          additional: { source: "auth.login_recent_created_at" },
        });
      }
    } catch {
      // metrics/event logging should never block login
    }

    return res.json({
      message: "Login realizado com sucesso!",
      user: { id: user.id, email: user.email },
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      token_type: session.token_type,
    });
  } catch (e) {
    return res.status(500).json({ error: "Falha no login" });
  }
});

export default router;
