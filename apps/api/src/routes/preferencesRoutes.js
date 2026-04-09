import express from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuthedSupabaseClient } from "../utils/supabaseAuthed.js";
import { recordProductEvent } from "../utils/eventsStore.js";
import {
  DEFAULT_USER_PREFERENCES,
  mergeUserPreferences,
  prefsKey,
} from "../utils/userPreferences.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    if (!req.access_token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data, error } = await supabase
      .from("configs")
      .select("value")
      .eq("key", prefsKey(req.user.id))
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    const prefs = mergeUserPreferences(data?.value);
    return res.json({ prefs });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno" });
  }
});

router.patch("/", async (req, res) => {
  try {
    if (!req.access_token) {
      return res.status(401).json({ error: "Missing bearer token" });
    }

    const Body = z.object({
      prompt_auto_enabled: z.boolean().optional(),
      prompt_auto_apply: z.boolean().optional(),
      prompt_auto_dont_ask_again: z.boolean().optional(),
      ai_execution_mode_preference: z.enum(["automatic_quality", "automatic_economy"]).optional(),
      language: z.string().min(2).max(10).optional(),
      notification_inbox_enabled: z.boolean().optional(),
      notification_toasts_enabled: z.boolean().optional(),
      notification_support_updates: z.boolean().optional(),
      notification_financial_updates: z.boolean().optional(),
      notification_async_updates: z.boolean().optional(),
    });

    const body = Body.parse(req.body || {});
    const supabase = createAuthedSupabaseClient(req.access_token);
    const { data: existing, error: readError } = await supabase
      .from("configs")
      .select("value")
      .eq("key", prefsKey(req.user.id))
      .maybeSingle();

    if (readError) return res.status(400).json({ error: readError.message });

    const stored = mergeUserPreferences(existing?.value);
    const previousLanguage = String(stored?.language || DEFAULT_USER_PREFERENCES.language || "pt-BR");
    const merged = { ...stored, ...body };

    const { data, error } = await supabase
      .from("configs")
      .upsert({ key: prefsKey(req.user.id), value: merged }, { onConflict: "key" })
      .select("value")
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });

    const finalPrefs = data?.value || merged;
    if (Object.prototype.hasOwnProperty.call(body, "language")) {
      try {
        recordProductEvent({
          event: "user.language_select",
          userId: req.user.id,
          plan: null,
          additional: {
            from: previousLanguage,
            to: String(finalPrefs?.language || "pt-BR"),
            source: "preferences.patch",
          },
        });
      } catch {
        // do not block response on telemetry issues
      }
    }

    return res.json({ prefs: finalPrefs });
  } catch (e) {
    return res.status(400).json({ error: e?.message || "Dados invalidos" });
  }
});

export default router;
