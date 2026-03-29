import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";
import { buildNoCodeRuntimeSnapshot } from "../utils/noCodeRegistry.js";

const router = express.Router();

router.use(authMiddleware);
router.use(attachPlan);

router.get("/runtime", (req, res) => {
  const planCode = req?.plan?.code || "FREE";
  return res.json({
    ok: true,
    ...buildNoCodeRuntimeSnapshot(planCode),
  });
});

export default router;
