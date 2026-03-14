import express from "express";
import { getPlansCatalog } from "../utils/plansCatalog.js";
import { resolveLang } from "../utils/i18n.js";

const router = express.Router();

router.get("/plans/catalog", (req, res) => {
  const lang = resolveLang(req);
  return res.json(getPlansCatalog(lang));
});

export default router;
