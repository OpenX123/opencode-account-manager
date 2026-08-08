// ============================================================
// /api/browser 路由 — 拉起浏览器、打开付费页
// ============================================================

import { Router, type Request, type Response, type Router as RouterType } from "express";
import { openAccountInBrowser, openBillingPage } from "../services/browser-pool.js";
import {
  cancelOAuthLogin,
  getOAuthLoginStatus,
  startOAuthLogin,
} from "../services/oauth-login.js";

export const browserRouter: RouterType = Router();

// POST /api/browser/oauth/start — 打开内置浏览器，由用户手动完成 OAuth 登录
browserRouter.post("/oauth/start", async (req: Request, res: Response) => {
  try {
    const alias = typeof req.body?.alias === "string" ? req.body.alias : "";
    const status = await startOAuthLogin(alias);
    res.status(201).json(status);
  } catch (err) {
    console.error("启动 OAuth 登录失败:", err);
    res.status(500).json({
      error: `无法启动内置浏览器: ${(err as Error).message}`,
    });
  }
});

// GET /api/browser/oauth/status/:sessionId — 轮询登录完成状态
browserRouter.get(
  "/oauth/status/:sessionId",
  async (req: Request, res: Response) => {
    try {
      const status = await getOAuthLoginStatus(req.params.sessionId as string);
      if (!status) {
        res.status(404).json({ error: "登录会话不存在或已过期" });
        return;
      }
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: `读取登录状态失败: ${(err as Error).message}` });
    }
  }
);

// POST /api/browser/oauth/cancel/:sessionId — 取消并关闭登录窗口
browserRouter.post(
  "/oauth/cancel/:sessionId",
  async (req: Request, res: Response) => {
    const status = await cancelOAuthLogin(req.params.sessionId as string);
    if (!status) {
      res.status(404).json({ error: "登录会话不存在或已过期" });
      return;
    }
    res.json(status);
  }
);

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
