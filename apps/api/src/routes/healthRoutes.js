import express from 'express';
import supabaseAdmin from '../config/supabaseAdmin.js';
import { isSupabaseAdminEnabled } from '../config/supabaseAdmin.js';

const router = express.Router();

router.get('/live', (req, res) => {
  res.status(200).json({ ok: true });
});

router.get('/ready', async (req, res) => {
  const deps = {
    db: false,
    supabaseAdmin: isSupabaseAdminEnabled(),
  };

  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ ok: false, deps });
    }

    const { error } = await supabaseAdmin.from('plans').select('code').limit(1);
    deps.db = !error;
    if (error) return res.status(503).json({ ok: false, deps });

    return res.status(200).json({ ok: true, deps });
  } catch (e) {
    return res.status(503).json({ ok: false, deps });
  }
});

export default router;
