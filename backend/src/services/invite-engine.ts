// ============================================================
// 邀请链接生成器
// 以指定账号身份访问邀请页面，提取该账号的邀请链接。
// 注册流程由用户手动完成，本模块只负责「拿到链接 → 展示」。
// ============================================================

import { decrypt } from "../utils/crypto.js";
import { getAccountById } from "./account-store.js";
import { getBrowser } from "./browser-pool.js";
import { cookiesToPlaywrightFormat } from "./cookie-manager.js";
import type { Account, Cookie } from "../types.js";
import type { Page } from "playwright";

export interface InviteLinkResult {
  accountId: string;
  alias: string;
  inviteLink: string;
}

/**
 * 为指定账号生成邀请链接。
 * 用该账号的 Cookie 登录后访问邀请页，抓取链接返回。
 */
export async function generateInviteLinkForAccount(
  accountId: string
): Promise<InviteLinkResult> {
  const account = getAccountById(accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);

  const inviteLink = await generateInviteLink(accountId);
  if (!inviteLink) {
    throw new Error("无法找到邀请链接，请确认该账号支持邀请功能");
  }

  return {
    accountId,
    alias: account.alias,
    inviteLink,
  };
}

/**
 * 以指定账号身份获取邀请链接。
 *
 * 真实流程（基于 HAR 分析 opencode.ai 实际行为）：
 *   1. 带 Cookie 访问 /auth → 登录态会 302 重定向到 /workspace/{wsId}
 *   2. 从重定向后的 URL 提取 workspaceId
 *   3. 访问 /workspace/{wsId}/go（Go 订阅页，邀请链接渲染在页面文本中）
 *   4. 正则提取 https://opencode.ai/go?ref=XXXX 邀请链接
 */
async function generateInviteLink(accountId: string): Promise<string> {
  const account = getAccountById(accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);

  const cookies = decryptCookies(account);
  const ctx = await (await getBrowser()).newContext();
  await ctx.addCookies(cookiesToPlaywrightFormat(cookies));

  try {
    const page = await ctx.newPage();

    // 第 1 步：带 Cookie 访问 /auth，登录态自动 302 → /workspace/{wsId}
    await page.goto("https://opencode.ai/auth", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    const workspaceId = extractWorkspaceIdFromUrl(page.url());
    if (!workspaceId) {
      throw new Error(
        "无法获取 workspaceId（Cookie 可能已失效，或该账号未登录）"
      );
    }

    // 第 2 步：访问 Go 订阅页（邀请链接所在页）
    const goUrl = `https://opencode.ai/workspace/${workspaceId}/go`;
    await page.goto(goUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(3000);

    // 第 3 步：从页面提取邀请链接
    const inviteLink = await extractReferralLink(page);
    return inviteLink;
  } finally {
    await ctx.close();
  }
}

/** 从重定向后的 URL 中提取 workspaceId（/workspace/wrk_xxx） */
function extractWorkspaceIdFromUrl(url: string): string | null {
  const m = url.match(/\/workspace\/(wrk_[A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

/** 从 Go 页面提取推荐链接 https://opencode.ai/go?ref=XXXX */
async function extractReferralLink(page: Page): Promise<string> {
  // 1. 直接从页面文本正则提取（最可靠，实测链接直接渲染在页面里）
  const fromText = await page
    .evaluate(() => {
      const text = (globalThis as { document?: { body?: { innerText?: string } } }).document?.body?.innerText ?? "";
      const m = text.match(/https:\/\/opencode\.ai\/go\?ref=[A-Za-z0-9]+/);
      return m ? m[0] : "";
    })
    .catch(() => "");
  if (fromText) return fromText;

  // 2. 兜底：复制按钮的 data-clipboard-text
  const copyBtn = await page.$(
    'button:has-text("复制链接"), button:has-text("Copy"), button:has-text("复制")'
  );
  if (copyBtn) {
    const clipboardText = await copyBtn.getAttribute("data-clipboard-text");
    if (clipboardText && clipboardText.includes("opencode.ai/go?ref=")) {
      return clipboardText;
    }
  }

  // 3. 兜底：页面所有 <a> 链接里找 go?ref=
  const fromLink = await page
    .$$eval("a", (els) =>
      els
        .map((el) => el.href)
        .find((href) => /opencode\.ai\/go\?ref=/.test(href))
    )
    .catch(() => "");
  return fromLink || "";
}

function decryptCookies(account: Account): Cookie[] {
  const json = decrypt(account.encryptedCookies, account.iv, account.authTag);
  return JSON.parse(json) as Cookie[];
}
