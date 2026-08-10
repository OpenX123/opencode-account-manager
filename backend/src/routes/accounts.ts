// ============================================================
// /api/accounts 路由 — 账号 CRUD + Cookie 导入
// ============================================================

import { Router, type Request, type Response, type Router as RouterType } from "express";
import { v4 as uuid } from "uuid";
import {
  getAllAccounts,
  getAccountById,
  getAccountByEmail,
  insertAccount,
  updateAccount,
  deleteAccount,
} from "../services/account-store.js";
import { parseCookies } from "../services/cookie-manager.js";
import { verifyCookies } from "../services/browser-pool.js";
import { getAccountInsights } from "../services/account-insights.js";
import { getApiKey } from "../services/api-key.js";
import { encrypt } from "../utils/crypto.js";
import type { Account, Cookie, CreateAccountInput } from "../types.js";

export const accountsRouter: RouterType = Router();

// GET /api/accounts — 列出所有账号（不含加密 Cookie 内容）
accountsRouter.get("/", (_req: Request, res: Response) => {
  const accounts = getAllAccounts().map(sanitizeAccount);
  res.json(accounts);
});

// GET /api/accounts/:id/insights — 套餐、账单摘要和官方使用记录
accountsRouter.get("/:id/insights", async (req: Request, res: Response) => {
  try {
    const result = await getAccountInsights(req.params.id as string);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: `获取账号详情失败: ${(err as Error).message}`,
    });
  }
});

// GET /api/accounts/:id/api-key — 读取本机加密缓存，或显式从官方刷新
accountsRouter.get("/:id/api-key", async (req: Request, res: Response) => {
  try {
    const refresh = req.query.refresh === "true";
    const result = await getApiKey(req.params.id as string, refresh);
    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: `获取 API Key 失败: ${(err as Error).message}`,
    });
  }
});

// GET /api/accounts/:id — 获取单个账号详情
accountsRouter.get("/:id", (req: Request, res: Response) => {
  const account = getAccountById(req.params.id as string);
  if (!account) {
    res.status(404).json({ error: "账号不存在" });
    return;
  }
  res.json(sanitizeAccount(account));
});

// POST /api/accounts/import — 通过 Cookie 导入新账号
accountsRouter.post("/import", async (req: Request, res: Response) => {
  try {
    const { cookies: cookiesInput, alias, note, invitedBy } = req.body as {
      cookies: string;
      alias?: string;
      note?: string;
      invitedBy?: string;
    };

    if (!cookiesInput) {
      res.status(400).json({ error: "请提供 Cookie 数据" });
      return;
    }

    // 1. 解析 Cookie 格式
    let cookies: Cookie[];
    try {
      cookies = parseCookies(cookiesInput);
    } catch (err) {
      res.status(400).json({
        error: `Cookie 格式无法识别: ${(err as Error).message}`,
      });
      return;
    }

    if (cookies.length === 0) {
      res.status(400).json({ error: "未提取到任何 Cookie" });
      return;
    }

    // 2. 无头验证 Cookie 有效性 + 抓取用户信息
    const sessionInfo = await verifyCookies(cookies);

    if (!sessionInfo.valid) {
      res.status(400).json({
        error:
          "Cookie 无效或已过期。请重新从浏览器导出最新的 Cookie，确保处于已登录状态。",
        sessionInfo,
      });
      return;
    }

    const existing = sessionInfo.email
      ? getAccountByEmail(sessionInfo.email)
      : undefined;
    if (existing) {
      res.json(sanitizeAccount(existing));
      return;
    }

    // 3. 加密并存储
    const cookieJson = JSON.stringify(cookies);
    const { encrypted, iv, authTag } = encrypt(cookieJson);
    const now = Date.now();

    const account: Account = {
      id: uuid(),
      alias: alias || sessionInfo.username || sessionInfo.email || "未命名账号",
      email: sessionInfo.email || "",
      username: sessionInfo.username || "",
      avatarUrl: sessionInfo.avatarUrl || "",
      encryptedCookies: encrypted,
      iv,
      authTag,
      lastVerifiedAt: now,
      createdAt: now,
      note: note || "",
      invitedBy: invitedBy || null,
    };

    insertAccount(account);

    res.status(201).json(sanitizeAccount(account));
  } catch (err) {
    console.error("导入账号失败:", err);
    res.status(500).json({ error: `导入失败: ${(err as Error).message}` });
  }
});

// PUT /api/accounts/:id — 更新账号
accountsRouter.put("/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = getAccountById(id);
  if (!existing) {
    res.status(404).json({ error: "账号不存在" });
    return;
  }

  const { alias, note, cookies: cookiesInput } = req.body as {
    alias?: string;
    note?: string;
    cookies?: string;
  };

  const updates: Record<string, unknown> = {};
  if (alias !== undefined) updates.alias = alias;
  if (note !== undefined) updates.note = note;

  if (cookiesInput) {
    const cookies = parseCookies(cookiesInput);
    const cookieJson = JSON.stringify(cookies);
    const { encrypted, iv, authTag } = encrypt(cookieJson);
    updates.encryptedCookies = encrypted;
    updates.iv = iv;
    updates.authTag = authTag;
    updates.lastVerifiedAt = Date.now();
  }

  updateAccount(id, updates);

  const updated = getAccountById(id);
  res.json(sanitizeAccount(updated!));
});

// DELETE /api/accounts/:id — 删除账号
accountsRouter.delete("/:id", (req: Request, res: Response) => {
  const id = req.params.id as string;
  const existing = getAccountById(id);
  if (!existing) {
    res.status(404).json({ error: "账号不存在" });
    return;
  }
  deleteAccount(id);
  res.json({ success: true });
});

/** 返回给前端的账号对象（去除加密字段） */
function sanitizeAccount(account: Account) {
  return {
    id: account.id,
    alias: account.alias,
    email: account.email,
    username: account.username,
    avatarUrl: account.avatarUrl,
    lastVerifiedAt: account.lastVerifiedAt,
    createdAt: account.createdAt,
    note: account.note,
    invitedBy: account.invitedBy,
    // 标记是否有有效的 Cookie
    hasCookies: account.encryptedCookies.length > 0,
  };
}
