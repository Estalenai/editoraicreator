import express from 'express';
import supabaseAdmin from '../config/supabaseAdmin.js';

const router = express.Router();

router.get('/live', (req, res) => {
  res.status(200).json({ ok: true });
});

router.get('/ready', async (req, res) => {
  try {
    // Minimal DB ping using service role.
    const { error } = await supabaseAdmin.from('plans').select('id').limit(1);
    if (error) {
      return res.status(503).json({ ok: false, reason: 'supabase', message: error.message });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(503).json({ ok: false, reason: 'exception', message: e?.message || 'unknown' });
  }
});

export default router;
