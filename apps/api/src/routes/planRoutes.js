import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { attachPlan } from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get("/me", authMiddleware, attachPlan, (req, res) => {
  res.json({
    user_id: req.user.id,
    plan: req.plan,
  });
});

export default router;
