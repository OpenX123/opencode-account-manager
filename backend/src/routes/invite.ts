// ============================================================
// /api/invite 路由 — 生成并展示邀请链接
// ============================================================

import { Router, type Request, type Response, type Router as RouterType } from "express";
import { generateInviteLinkForAccount } from "../services/invite-engine.js";
import {
  startRegistration,
  getRegistrationStatus,
  retryCapture,
} from "../services/registration-monitor.js";
import { claimReward } from "../services/reward-claimer.js";
import { checkUsage } from "../services/usage-checker.js";
import { syncToSub2api } from "../services/sub2api-sync.js";
import type { SyncResult } from "../services/sub2api-sync.js";
import type { UsageResult } from "../services/usage-checker.js";

export const inviteRouter: RouterType = Router();

// POST /api/invite/generate — 为指定账号生成邀请链接
inviteRouter.post(
  "/generate",
  async (req: Request, res: Response) => {
    try {
      const { accountId } = req.body as { accountId?: string };
      if (!accountId) {
        res.status(400).json({ error: "请提供 accountId" });
        return;
      }
      const result = await generateInviteLinkForAccount(accountId);
      res.json(result);
    } catch (err) {
      res
        .status(500)
        .json({ error: `生成邀请链接失败: ${(err as Error).message}` });
    }
  }
);

// POST /api/invite/register — 打开干净浏览器监控注册，抓取 Cookie 自动导入
inviteRouter.post("/register", (req: Request, res: Response) => {
  try {
    const { inviteLink, invitedBy } = req.body as {
      inviteLink?: string;
      invitedBy?: string;
    };
    if (!inviteLink) {
      res.status(400).json({ error: "请提供 inviteLink" });
      return;
    }
    const monitorId = startRegistration(
      inviteLink,
      invitedBy ?? null
    );
    res.json({ monitorId });
  } catch (err) {
    res
      .status(500)
      .json({ error: `启动注册监控失败: ${(err as Error).message}` });
  }
});

// GET /api/invite/register/status/:monitorId — 查询注册监控状态
inviteRouter.get(
  "/register/status/:monitorId",
  (req: Request, res: Response) => {
    const monitor = getRegistrationStatus(req.params.monitorId as string);
    if (!monitor) {
      res.status(404).json({ error: "监控记录不存在" });
      return;
    }
    res.json(monitor);
  }
);

// POST /api/invite/register/retry/:monitorId — 立即抓取 Cookie（超时后从还开着的浏览器抓取）
inviteRouter.post(
  "/register/retry/:monitorId",
  async (req: Request, res: Response) => {
    try {
      const monitor = await retryCapture(req.params.monitorId as string);
      res.json(monitor);
    } catch (err) {
      res
        .status(500)
        .json({ error: `抓取失败: ${(err as Error).message}` });
    }
  }
);

// POST /api/invite/claim-reward — 自动领取邀请奖励
inviteRouter.post(
  "/claim-reward",
  async (req: Request, res: Response) => {
    try {
      const { accountId } = req.body as { accountId?: string };
      if (!accountId) {
        res.status(400).json({ error: "请提供 accountId" });
        return;
      }
      const result = await claimReward(accountId);
      res.json(result);
    } catch (err) {
      res
        .status(500)
        .json({ error: `领取奖励失败: ${(err as Error).message}` });
    }
  }
);

// POST /api/invite/usage — 查询账号额度使用率
inviteRouter.post(
  "/usage",
  async (req: Request, res: Response) => {
    try {
      const { accountId } = req.body as { accountId?: string };
      if (!accountId) {
        res.status(400).json({ error: "请提供 accountId" });
        return;
      }
      const result = await checkUsage(accountId);
      res.json(result);
    } catch (err) {
      res
        .status(500)
        .json({ error: `查询额度失败: ${(err as Error).message}` });
    }
  }
);

// POST /api/invite/usage-batch — 批量查询所有账号额度
inviteRouter.post(
  "/usage-batch",
  async (_req: Request, res: Response) => {
    try {
      const { getAllAccounts } = await import("../services/account-store.js");
      const accounts = getAllAccounts();
      const results: UsageResult[] = [];
      for (const account of accounts) {
        try {
          const result = await checkUsage(account.id);
          results.push(result);
        } catch (err) {
          results.push({
            accountId: account.id,
            alias: account.alias,
            success: false,
            message: `查询失败: ${(err as Error).message}`,
          });
        }
      }
      res.json({ results });
    } catch (err) {
      res
        .status(500)
        .json({ error: `批量查询额度失败: ${(err as Error).message}` });
    }
  }
);

// POST /api/invite/sync-sub2api — 同步账号到 sub2api OPENCODE-GO 分组
inviteRouter.post(
  "/sync-sub2api",
  async (req: Request, res: Response) => {
    try {
      const { accountId } = req.body as { accountId?: string };
      if (!accountId) {
        res.status(400).json({ error: "请提供 accountId" });
        return;
      }
      const result = await syncToSub2api(accountId);
      res.json(result);
    } catch (err) {
      res
        .status(500)
        .json({ error: `同步到 sub2api 失败: ${(err as Error).message}` });
    }
  }
);

// POST /api/invite/sync-sub2api-batch — 批量同步所有账号
inviteRouter.post(
  "/sync-sub2api-batch",
  async (_req: Request, res: Response) => {
    try {
      const { getAllAccounts } = await import("../services/account-store.js");
      const accounts = getAllAccounts();
      const results: SyncResult[] = [];
      for (const account of accounts) {
        try {
          const result = await syncToSub2api(account.id);
          results.push(result);
        } catch (err) {
          results.push({
            accountId: account.id,
            alias: account.alias,
            success: false,
            message: `同步失败: ${(err as Error).message}`,
          });
        }
      }
      res.json({ results });
    } catch (err) {
      res
        .status(500)
        .json({ error: `批量同步失败: ${(err as Error).message}` });
    }
  }
);
