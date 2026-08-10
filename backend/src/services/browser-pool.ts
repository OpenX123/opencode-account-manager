// ============================================================
// Browser Pool — Playwright 实例管理
// 负责启动/复用浏览器、创建带 Cookie 的上下文、打开页面
//
// 基于 HAR 分析修正：
//   - 登录页: /auth (非 /login)
//   - 工作区: /workspace/{id}
//   - 付费: Stripe Customer Portal (billing.stripe.com)
//   - 后端通信: /_server RPC
// ============================================================

import { chromium, type Browser, type Page } from "playwright";
import {
  cookiesToPlaywrightFormat,
  type SessionInfo,
} from "./cookie-manager.js";
import { decrypt } from "../utils/crypto.js";
import { getAccountById } from "./account-store.js";
import type { Cookie, Account } from "../types.js";

let browser: Browser | null = null;

/** 获取或创建共享的 Playwright 浏览器实例 */
export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
    browser = await chromium.launch({
      headless: process.env.WEB_MODE === "1" && process.env.REMOTE_BROWSER !== "1",
      executablePath,
      channel: !executablePath && process.platform === "win32" ? "msedge" : undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return browser;
}

/** 关闭浏览器实例 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * 通过预检 HTTP 请求获取账号的 workspaceId
 */
async function getWorkspaceId(cookies: Cookie[]): Promise<string> {
  const cookieHeader = cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const authRes = await fetch("https://opencode.ai/auth", {
    headers: {
      Cookie: cookieHeader,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    },
    redirect: "manual",
  });
  const location = authRes.headers.get("location") || "";
  const wsMatch = location.match(/\/workspace\/(wrk_[A-Za-z0-9]+)/);
  if (!wsMatch) {
    throw new Error(
      `Cookie 可能已失效（状态码 ${authRes.status}，未重定向到工作区）`
    );
  }
  return wsMatch[1];
}

/**
 * 为指定账号创建一个带 Cookie 的浏览器上下文，
 * 直接导航到工作空间界面。
 */
export async function openAccountInBrowser(accountId: string) {
  const account = getAccountById(accountId);
  if (!account) {
    throw new Error(`账号不存在: ${accountId}`);
  }

  const cookies = decryptCookies(account);
  const b = await getBrowser();

  // 预检：获取 workspaceId
  const workspaceId = await getWorkspaceId(cookies);
  const workspaceUrl = `https://opencode.ai/workspace/${workspaceId}`;

  const context = await b.newContext({
    viewport: { width: 1440, height: 900 },
  });

  await context.addCookies(cookiesToPlaywrightFormat(cookies));

  const page = await context.newPage();
  await page.goto(workspaceUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForTimeout(2000);

  return { browser: b, context, page };
}

/**
 * 打开 GO 订阅的 Stripe 支付页面。
 *
 * 流程：
 *   1. 通过共享 getWorkspaceId() 获取 workspaceId
 *   2. 纯 HTTP: POST /_server liteCheckoutUrl → Stripe checkout URL
 *   3. Playwright: 导航到 Stripe checkout 页面
 */
export async function openBillingPage(accountId: string) {
  const account = getAccountById(accountId);
  if (!account) {
    throw new Error(`账号不存在: ${accountId}`);
  }

  const cookies = decryptCookies(account);

  // 获取 workspaceId（复用共享函数）
  const workspaceId = await getWorkspaceId(cookies);
  const goUrl = `https://opencode.ai/workspace/${workspaceId}/go`;

  const cookieHeader = cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
  const baseHeaders: Record<string, string> = {
    Cookie: cookieHeader,
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };

  // 调用 liteCheckoutUrl action 获取 GO 订阅的 Stripe checkout URL
  // onClickSubscribe(method) → checkoutAction(workspaceId, currentUrl, currentUrl, method)
  const liteCheckoutHash =
    "cbabaa5c4c213c60729203b45290235929597a87a8d02dc9d5e57b930c939234";
  const checkoutBody = JSON.stringify({
    t: {
      t: 9,
      i: 0,
      l: 4,
      a: [
        { t: 1, s: workspaceId },
        { t: 1, s: goUrl },
        { t: 1, s: goUrl },
        { t: 1, s: "alipay" },
      ],
      o: 0,
    },
    f: 31,
    m: [],
  });

  const checkoutRes = await fetch("https://opencode.ai/_server", {
    method: "POST",
    headers: {
      ...baseHeaders,
      "Content-Type": "application/json",
      "x-server-id": liteCheckoutHash,
      "x-server-instance": "server-fn:1",
      "x-single-flight": "true",
      Origin: "https://opencode.ai",
      Referer: goUrl,
      Accept: "*/*",
    },
    body: checkoutBody,
  });

  if (!checkoutRes.ok) {
    throw new Error(`获取 Stripe checkout URL 失败: ${checkoutRes.status}`);
  }

  const checkoutText = await checkoutRes.text();

  // 检查错误（如已订阅）
  const errorMatch = checkoutText.match(/error:"([^"]+)"/);
  if (errorMatch && errorMatch[1] !== "void 0") {
    throw new Error(`GO 订阅失败: ${errorMatch[1]}`);
  }

  // 提取 Stripe checkout URL
  const urlMatch = checkoutText.match(
    /data:"(https:\/\/checkout\.stripe\.com\/[^"]+)"/
  );
  if (!urlMatch) {
    throw new Error("未从响应中解析到 Stripe checkout URL");
  }

  const stripeUrl = urlMatch[1];

  // 第 3 步：用 Playwright 打开 Stripe checkout 页面
  const ctx = await (await getBrowser()).newContext();
  await ctx.addCookies(cookiesToPlaywrightFormat(cookies));

  const page = await ctx.newPage();
  await page.goto(stripeUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  void enableGoSettingsAfterCheckout(page, goUrl).catch((err) => {
    console.warn(`[billing] 付款后自动开启 Go 设置失败: ${(err as Error).message}`);
  });

  return {
    browser: await getBrowser(),
    context: ctx,
    page,
    url: stripeUrl,
  };
}

async function enableGoSettingsAfterCheckout(
  page: Page,
  goUrl: string
): Promise<void> {
  await page.waitForURL(
    (url) => `${url.origin}${url.pathname}` === goUrl,
    { timeout: 60 * 60 * 1000 }
  );
  await page.waitForLoadState("domcontentloaded");

  const labels = [
    "达到使用限额后使用您的可用余额",
    "启用部署在中国的模型",
  ];
  for (const text of labels) {
    const form = page
      .locator('form[data-slot="setting-row"]')
      .filter({ hasText: text })
      .first();
    await form.waitFor({ state: "visible", timeout: 30000 });
    const checkbox = form.locator('input[type="checkbox"]');
    if (!(await checkbox.isChecked())) {
      await form.locator('label[data-slot="toggle-label"]').click();
      await page.waitForTimeout(750);
    }
    if (!(await checkbox.isChecked())) throw new Error(`未能开启“${text}”`);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  for (const text of labels) {
    const checked = await page
      .locator('form[data-slot="setting-row"]')
      .filter({ hasText: text })
      .first()
      .locator('input[type="checkbox"]')
      .isChecked();
    if (!checked) throw new Error(`“${text}”刷新后未保持开启`);
  }
  console.log("[billing] Go 的余额与中国模型设置已开启并验证");
}

/**
 * 无头验证 Cookie 有效性 + 抓取用户信息
 */
export async function verifyCookies(
  cookies: Cookie[]
): Promise<SessionInfo> {
  const tempBrowser = await chromium.launch({ headless: true });

  try {
    const context = await tempBrowser.newContext();
    await context.addCookies(cookiesToPlaywrightFormat(cookies));

    const page = await context.newPage();
    await page.goto("https://opencode.ai", {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    await page.waitForTimeout(2000);

    const info = await extractSessionInfo(page);
    await context.close();
    return info;
  } finally {
    await tempBrowser.close();
  }
}

/**
 * 从已登录页面提取用户信息
 */
export async function extractSessionInfo(
  page: Page
): Promise<SessionInfo> {
  const selectors = {
    username: [
      "[data-testid='user-name']",
      "[data-testid='username']",
      ".user-name",
      ".username",
      "[aria-label='User menu']",
      "[data-testid='user-menu']",
      // avatar 的 alt 属性通常包含用户名
      'img[alt]:not([alt=""])',
    ],
    email: [
      "[data-testid='user-email']",
      ".user-email",
      "[title*='@']",
    ],
    avatar: [
      "[data-testid='user-avatar'] img",
      ".avatar img",
      ".user-avatar img",
      'img[referrerpolicy="no-referrer"]',
      'img[src*="avatar"]',
    ],
  };

  let username = "";
  let email = "";
  let avatarUrl = "";

  try {
    // 用户名
    for (const sel of selectors.username) {
      try {
        const el = await page.$(sel);
        if (el) {
          // 尝试 textContent（对 div/span）
          const text = (await el.textContent())?.trim();
          if (text && text.length < 50) {
            username = text;
            break;
          }
          // 尝试 alt 属性（对 img）
          const alt = await el.getAttribute("alt");
          if (alt && alt.length < 50) {
            username = alt;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    // 邮箱
    for (const sel of selectors.email) {
      try {
        const el = await page.$(sel);
        if (el) {
          const text = (await el.textContent())?.trim() || "";
          if (text.includes("@")) {
            email = text;
            break;
          }
          const title = await el.getAttribute("title");
          if (title?.includes("@")) {
            email = title;
            break;
          }
        }
      } catch {
        continue;
      }
    }

    // 头像
    for (const sel of selectors.avatar) {
      try {
        const el = await page.$(sel);
        if (el) {
          avatarUrl = (await el.getAttribute("src")) || "";
          if (avatarUrl) break;
        }
      } catch {
        continue;
      }
    }

    // 验证有效性：opencode.ai 未登录会跳转到 /auth
    const currentUrl = page.url();
    const valid =
      !currentUrl.includes("/auth") &&
      !currentUrl.includes("/login") &&
      !currentUrl.includes("/signin");

    return { username, email, avatarUrl, valid };
  } catch {
    return { username: "", email: "", avatarUrl: "", valid: false };
  }
}

function decryptCookies(account: Account): Cookie[] {
  const json = decrypt(account.encryptedCookies, account.iv, account.authTag);
  return JSON.parse(json) as Cookie[];
}
