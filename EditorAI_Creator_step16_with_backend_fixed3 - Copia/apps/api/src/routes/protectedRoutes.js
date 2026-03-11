import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/profile", (req, res) => {
  res.json({ message: "Rota protegida acessada com sucesso", user: req.user });
});

router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    message: "pong (auth ok)",
    user_id: req.user?.id,
    timestamp: new Date().toISOString(),
  });
});

export default router;
