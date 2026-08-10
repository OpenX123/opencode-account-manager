// ============================================================
// /api/invite 路由 — 生成并展示邀请链接
// ============================================================

import { Router, type Request, type Response, type Router as RouterType } from "express";
import { v4 as uuid } from "uuid";
import { generateInviteLinkForAccount } from "../services/invite-engine.js";
import {
  startRegistration,
  getRegistrationStatus,
  retryCapture,
  type AutoFill,
} from "../services/registration-monitor.js";
import { claimReward } from "../services/reward-claimer.js";
import { checkUsage } from "../services/usage-checker.js";
import { syncToSub2api, testSub2apiConnection } from "../services/sub2api-sync.js";
import { getAllAccounts } from "../services/account-store.js";
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
// 可选 autoFill: { email, password, recoveryEmail } 自动完成 Google 登录
inviteRouter.post("/register", (req: Request, res: Response) => {
  try {
    const { inviteLink, invitedBy, autoFill } = req.body as {
      inviteLink?: string;
      invitedBy?: string;
      autoFill?: AutoFill;
    };
    if (!inviteLink) {
      res.status(400).json({ error: "请提供 inviteLink" });
      return;
    }
    const monitorId = startRegistration(
      inviteLink,
      invitedBy ?? null,
      autoFill
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

// ============================================================
// 自动邀请链 — 主号生成链接 → 批量自动注册 → 弹出付款页
// ============================================================

interface ChainAccount {
  email: string;
  password: string;
  recoveryEmail?: string;
}

interface ChainTask {
  index: number;
  email: string;
  status: "pending" | "generating_link" | "registering" | "completed" | "failed";
  monitorId?: string;
  newAccountId?: string;
  newAccountAlias?: string;
  error?: string;
  billingOpened?: boolean;
}

interface InviteChain {
  id: string;
  mainAccountId: string;
  accounts: ChainAccount[];
  inviteLink: string;
  tasks: ChainTask[];
  startedAt: number;
  completedAt: number | null;
}

const chains = new Map<string, InviteChain>();

export function dedupeAccounts(
  input: ChainAccount[],
  existingEmails: string[]
): {
  accounts: ChainAccount[];
  skippedExisting: number;
  skippedDuplicate: number;
} {
  const existing = new Set(
    existingEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)
  );
  const seen = new Set<string>();
  const accounts: ChainAccount[] = [];
  let skippedExisting = 0;
  let skippedDuplicate = 0;

  for (const account of input) {
    const email = account.email.trim();
    const normalized = email.toLowerCase();
    if (!normalized || !account.password.trim()) continue;
    if (existing.has(normalized)) {
      skippedExisting += 1;
      continue;
    }
    if (seen.has(normalized)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(normalized);
    accounts.push({
      email,
      password: account.password.trim(),
      recoveryEmail: account.recoveryEmail?.trim() || undefined,
    });
  }

  return { accounts, skippedExisting, skippedDuplicate };
}

// POST /api/invite/parse-accounts — 解析 账号.txt 文本（email----password----recovery_email）
inviteRouter.post("/parse-accounts", (req: Request, res: Response) => {
  try {
    const { text } = req.body as { text?: string };
    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "请提供文本内容" });
      return;
    }

    const parsed: ChainAccount[] = [];
    const lines = text.split(/\r?\n/).filter((line) => line.trim());

    for (const line of lines) {
      const parts = line.trim().split("----");
      if (parts.length >= 2) {
        parsed.push({
          email: parts[0].trim(),
          password: parts[1].trim(),
          recoveryEmail: parts[2]?.trim() || undefined,
        });
      }
    }

    const result = dedupeAccounts(
      parsed,
      getAllAccounts().map((account) => account.email)
    );
    res.json({
      ...result,
      count: result.accounts.length,
      skippedInvalid: lines.length - parsed.length,
    });
  } catch (err) {
    res.status(500).json({ error: `解析失败: ${(err as Error).message}` });
  }
});

// POST /api/invite/auto-chain — 启动自动邀请链
inviteRouter.post("/auto-chain", async (req: Request, res: Response) => {
  try {
    const { mainAccountId, accounts } = req.body as {
      mainAccountId?: string;
      accounts?: ChainAccount[];
    };
    if (!mainAccountId) {
      res.status(400).json({ error: "请提供主号 accountId" });
      return;
    }
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      res.status(400).json({ error: "请提供待注册账号列表" });
      return;
    }

    const activeEmails = [...chains.values()]
      .filter((chain) => chain.completedAt === null)
      .flatMap((chain) => chain.accounts.map((account) => account.email));
    const deduped = dedupeAccounts(accounts, [
      ...getAllAccounts().map((account) => account.email),
      ...activeEmails,
    ]);
    if (deduped.accounts.length === 0) {
      res.status(400).json({ error: "没有需要注册的新账号（已自动跳过重复账号）" });
      return;
    }

    const chainId = uuid();
    const tasks: ChainTask[] = deduped.accounts.map((a, i) => ({
      index: i,
      email: a.email,
      status: "pending" as const,
    }));

    const chain: InviteChain = {
      id: chainId,
      mainAccountId,
      accounts: deduped.accounts,
      inviteLink: "",
      tasks,
      startedAt: Date.now(),
      completedAt: null,
    };
    chains.set(chainId, chain);

    // 异步执行链式任务
    runInviteChain(chainId).catch((err) => {
      console.error(`[auto-chain] 邀请链 ${chainId} 异常:`, err);
    });

    res.status(201).json({
      chainId,
      count: deduped.accounts.length,
      skippedExisting: deduped.skippedExisting,
      skippedDuplicate: deduped.skippedDuplicate,
    });
  } catch (err) {
    res.status(500).json({ error: `启动邀请链失败: ${(err as Error).message}` });
  }
});

// GET /api/invite/auto-chain/status/:chainId — 查询邀请链状态
inviteRouter.get("/auto-chain/status/:chainId", (req: Request, res: Response) => {
  const chain = chains.get(req.params.chainId as string);
  if (!chain) {
    res.status(404).json({ error: "邀请链不存在或已过期" });
    return;
  }
  res.json({
    id: chain.id,
    mainAccountId: chain.mainAccountId,
    inviteLink: chain.inviteLink,
    tasks: chain.tasks,
    startedAt: chain.startedAt,
    completedAt: chain.completedAt,
  });
});

/**
 * 后台执行邀请链：
 *   1. 用主号生成邀请链接
 *   2. 依次对每个待注册账号调用 startRegistration(autoFill)
 *   3. 轮询每个注册任务直至完成
 *   4. 完成后打开付款页
 */
async function runInviteChain(chainId: string): Promise<void> {
  const chain = chains.get(chainId);
  if (!chain) return;

  try {
    // 第 1 步：生成邀请链接
    chain.tasks.forEach((t) => {
      if (t.status === "pending") t.status = "generating_link";
    });

    const linkResult = await generateInviteLinkForAccount(chain.mainAccountId);
    chain.inviteLink = linkResult.inviteLink;

    // 第 2 步：逐个完成注册，避免 Google 首次激活并发触发风控
    const POLL_INTERVAL = 3000;
    const chainDeadline = Date.now() + 10 * 60 * 1000;

    for (let i = 0; i < chain.accounts.length; i++) {
      const account = chain.accounts[i];
      const task = chain.tasks[i];
      task.status = "registering";

      try {
        const monitorId = startRegistration(
          chain.inviteLink,
          chain.mainAccountId,
          {
            email: account.email,
            password: account.password,
            recoveryEmail: account.recoveryEmail,
          }
        );
        task.monitorId = monitorId;
      } catch (err) {
        task.status = "failed";
        task.error = `启动注册失败: ${(err as Error).message}`;
        continue;
      }

      while (Date.now() < chainDeadline) {
        const monitor = getRegistrationStatus(task.monitorId);
        if (!monitor) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));
          continue;
        }

        if (monitor.status === "completed") {
          task.status = "completed";
          task.newAccountId = monitor.newAccountId ?? undefined;
          task.newAccountAlias = monitor.newAccountAlias ?? undefined;

          // 自动打开付款页
          if (task.newAccountId) {
            try {
              const { openBillingPage } = await import("../services/browser-pool.js");
              await openBillingPage(task.newAccountId);
              task.billingOpened = true;
            } catch (err) {
              console.warn(
                `[auto-chain] 打开付款页失败 (${task.email}): ${(err as Error).message}`
              );
            }
          }
          break;
        } else if (monitor.status === "failed" || monitor.status === "timeout") {
          task.status = "failed";
          task.error = monitor.error ?? "注册监控结束";
          break;
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }

      if (task.status === "registering") {
        task.status = "failed";
        task.error = "邀请链超时";
      }
    }
  } catch (err) {
    // 全局错误：标记所有未完成任务为失败
    for (const task of chain.tasks) {
      if (task.status !== "completed" && task.status !== "failed") {
        task.status = "failed";
        task.error = `邀请链异常: ${(err as Error).message}`;
      }
    }
  } finally {
    chain.completedAt = Date.now();
  }
}

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

// POST /api/invite/test-sub2api — 测试 sub2api SSH 连通性
inviteRouter.post(
  "/test-sub2api",
  async (_req: Request, res: Response) => {
    try {
      const result = await testSub2apiConnection();
      res.json(result);
    } catch (err) {
      res
        .status(500)
        .json({ error: `测试失败: ${(err as Error).message}` });
    }
  }
);
