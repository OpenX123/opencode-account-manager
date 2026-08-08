// ============================================================
// /api/settings 路由 — sub2api 等配置的读写
// ============================================================

import { Router, type Request, type Response, type Router as RouterType } from "express";
import { getSettings, saveSettings } from "../services/settings-store.js";

export const settingsRouter: RouterType = Router();

// GET /api/settings — 获取当前配置
settingsRouter.get("/", (_req: Request, res: Response) => {
  res.json(getSettings());
});

// PUT /api/settings — 更新配置
settingsRouter.put("/", (req: Request, res: Response) => {
  const updated = saveSettings(req.body as Record<string, unknown>);
  res.json(updated);
});
