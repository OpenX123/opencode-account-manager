// ============================================================
// /api/browser 路由 — 拉起浏览器、打开付费页
// ============================================================

import { Router, type Request, type Response, type Router as RouterType } from "express";
import { openAccountInBrowser, openBillingPage } from "../services/browser-pool.js";

export const browserRouter: RouterType = Router();

// POST /api/browser/open/:accountId — 以该账号身份打开 opencode.ai
browserRouter.post("/open/:accountId", async (req: Request, res: Response) => {
  try {
    await openAccountInBrowser(req.params.accountId as string);
    res.json({ success: true, message: "浏览器窗口已打开" });
  } catch (err) {
    console.error("打开浏览器失败:", err);
    res.status(500).json({
      success: false,
      error: `无法打开浏览器: ${(err as Error).message}`,
    });
  }
});

// POST /api/browser/billing/:accountId — 打开 GO 订阅支付页
browserRouter.post(
  "/billing/:accountId",
  async (req: Request, res: Response) => {
    try {
      const result = await openBillingPage(req.params.accountId as string);
      res.json({
        success: true,
        message: "付费页面已打开",
        url: result.url,
      });
    } catch (err) {
      console.error("打开付费页失败:", err);
      res.status(500).json({
        success: false,
        error: `无法打开付费页: ${(err as Error).message}`,
      });
    }
  }
);