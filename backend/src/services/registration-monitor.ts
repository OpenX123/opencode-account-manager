// ============================================================
// Registration Monitor — 注册监控器
//
// 打开无 Cookie 的干净浏览器窗口，导航到邀请链接，
// 后台静默监控：
//   1. 表单中的邮箱和密码（通过轮询 input 字段）
//   2. auth Cookie 的出现（标志注册成功）
//
// 注册成功后自动抓取 Cookie、验证、加密、导入工具。
// ============================================================

import { v4 as uuid } from "uuid";
import type { Page, BrowserContext } from "playwright";
import { getBrowser, verifyCookies } from "./browser-pool.js";
import { encrypt } from "../utils/crypto.js";
import { getAccountByEmail, insertAccount } from "./account-store.js";
import type { Account, Cookie } from "../types.js";

// ============================================================
// 类型定义
// ============================================================

export interface AutoFill {
  email: string;
  password: string;
  recoveryEmail?: string;
}

export function isOpenCodeUrl(value: string): boolean {
  const { hostname } = new URL(value);
  return hostname === "opencode.ai" || hostname.endsWith(".opencode.ai");
}

export const GOOGLE_TERMS_ACCEPT_BUTTON_NAME = /^(?:我了解|I understand)$/;

export interface RegistrationMonitor {
  id: string;
  inviteLink: string;
  invitedBy: string | null;
  status: "monitoring" | "completed" | "failed" | "timeout";
  email: string;
  password: string;
  newAccountId: string | null;
  newAccountAlias: string | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
  autoFill?: AutoFill;
}

// ============================================================
// 监控器存储（内存 Map，进程重启即丢失）
// ============================================================

const monitors = new Map<string, RegistrationMonitor>();
// 存储 BrowserContext 引用，超时后仍可「立即抓取」
const monitorContexts = new Map<string, BrowserContext>();

const TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟
const POLL_INTERVAL_MS = 2000; // 2 秒

// ============================================================
// 公开接口
// ============================================================

/**
 * 启动注册监控。
 * 立即返回 monitorId，后台异步打开浏览器并监控。
 */
export function startRegistration(
  inviteLink: string,
  invitedBy: string | null = null,
  autoFill?: AutoFill
): string {
  const id = uuid();
  const monitor: RegistrationMonitor = {
    id,
    inviteLink,
    invitedBy,
    status: "monitoring",
    email: autoFill?.email ?? "",
    password: autoFill?.password ?? "",
    newAccountId: null,
    newAccountAlias: null,
    error: null,
    startedAt: Date.now(),
    completedAt: null,
    autoFill,
  };
  monitors.set(id, monitor);

  runMonitoring(id).catch((err) => {
    const m = monitors.get(id);
    if (m && m.status === "monitoring") {
      m.status = "failed";
      m.error = err.message;
      m.completedAt = Date.now();
      console.warn(`[registration] 自动注册失败: ${err.message}`);
    }
  });

  return id;
}

/** 查询监控状态 */
export function getRegistrationStatus(
  id: string
): RegistrationMonitor | null {
  return monitors.get(id) ?? null;
}

/**
 * 立即抓取 Cookie — 超时/失败后，浏览器窗口还开着时可用。
 * 从那个还存活的 context 中抓取 Cookie 并导入账号。
 */
export async function retryCapture(
  monitorId: string
): Promise<RegistrationMonitor> {
  const monitor = monitors.get(monitorId);
  if (!monitor) throw new Error("监控记录不存在");
  if (monitor.status === "completed") throw new Error("该监控已完成导入");

  const context = monitorContexts.get(monitorId);
  if (!context) throw new Error("浏览器窗口已关闭，无法抓取");

  const pages = context.pages();
  if (pages.length === 0) throw new Error("浏览器页面已关闭");

  const page = pages[0];
  if (page.isClosed()) throw new Error("浏览器页面已关闭");

  const currentUrl = page.url();
  if (!currentUrl.includes("opencode.ai")) {
    throw new Error(`当前页面不是 opencode.ai（当前: ${currentUrl}），请先完成注册`);
  }

  // 抓取当前所有 Cookie
  const cookies = await context.cookies();
  if (cookies.length === 0) {
    throw new Error("未检测到任何 Cookie，请确认已登录");
  }

  // 重新捕获邮箱密码（如果之前没抓到）
  if (!monitor.email || !monitor.password) {
    const formData = await captureFormData(page).catch(() => ({
      email: "",
      password: "",
    }));
    if (formData.email) monitor.email = formData.email;
    if (formData.password) monitor.password = formData.password;
  }

  await handleRegistrationSuccess(monitor, context, cookies);

  // 完成后清理
  monitorContexts.delete(monitorId);
  await context.close().catch(() => {});

  return monitor;
}

// ============================================================
// 内部实现
// ============================================================

async function runMonitoring(monitorId: string): Promise<void> {
  const monitor = monitors.get(monitorId);
  if (!monitor) return;

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  monitorContexts.set(monitorId, context);

  try {
    const page = await context.newPage();

    // 导航到邀请链接（无 Cookie 干净环境）
    await page.goto(monitor.inviteLink, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // 自动填表模式：填写邮箱/密码并提交注册表单
    if (monitor.autoFill) {
      await autoFillRegistrationForm(page, monitor);
    }

    // 轮询循环
    while (Date.now() - monitor.startedAt < TIMEOUT_MS) {
      // 页面被用户关闭
      if (page.isClosed()) {
        throw new Error("浏览器页面已关闭");
      }

      // 1. 检查是否已跳转到工作区（注册成功的可靠标志）
      //    opencode.ai 登录后会自动 302 → /workspace/{wsId}
      //    仅凭 auth Cookie 存在不够 — 匿名访问也可能设置 auth Cookie
      const currentUrl = page.url();
      if (currentUrl.includes("/workspace/") && !currentUrl.includes("/go")) {
        const cookies = await context.cookies();
        await handleRegistrationSuccess(monitor, context, cookies);
        return;
      }

      // 2. 尝试从表单字段捕获邮箱和密码
      if (!monitor.email || !monitor.password) {
        const formData = await captureFormData(page).catch(() => ({
          email: "",
          password: "",
        }));
        if (formData.email && !monitor.email) monitor.email = formData.email;
        if (formData.password && !monitor.password)
          monitor.password = formData.password;
      }

      await page.waitForTimeout(POLL_INTERVAL_MS);
    }

    // 超时
    monitor.status = "timeout";
    monitor.error = "注册监控超时（10 分钟内未检测到登录）。如已手动注册，点「立即抓取」";
    monitor.completedAt = Date.now();
  } finally {
    // 注册成功后关闭上下文并清理
    // 超时/失败时保留 context，用户可点「立即抓取」重试
    if (monitor.status === "completed") {
      monitorContexts.delete(monitorId);
      await context.close().catch(() => {});
    }
  }
}

/** 从页面表单字段提取邮箱和密码 */
async function captureFormData(
  page: Page
): Promise<{ email: string; password: string }> {
  return page.evaluate(() => {
    // 后端无 DOM 类型声明，用 any 绕过编译
    const doc = (globalThis as { document?: any }).document;
    if (!doc) return { email: "", password: "" };

    let email = "";
    const emailEl = doc.querySelector(
      'input[type="email"], input[name*="email" i], input[name*="mail" i], input[autocomplete*="email" i]'
    );
    if (emailEl) email = emailEl.value;

    let password = "";
    const passwordEl = doc.querySelector(
      'input[type="password"], input[name*="password" i], input[autocomplete*="password" i]'
    );
    if (passwordEl) password = passwordEl.value;

    return { email, password };
  });
}

// ============================================================
// 自动注册 — 邀请页 → OpenCode 登录 → Google 登录
// ============================================================

/**
 * Google 登录成功后会回到 OpenCode，后续由监控循环抓取 Cookie。
 */
async function autoFillRegistrationForm(
  page: Page,
  monitor: RegistrationMonitor
): Promise<void> {
  const { email, password, recoveryEmail } = monitor.autoFill!;
  if (!email || !password) return;

  const subscribe = page.locator('a[href="/auth"]').first();
  await subscribe.waitFor({ state: "visible", timeout: 15000 });
  await subscribe.click({ timeout: 10000 });
  console.log("[autoFill] 已进入 OpenCode 登录页");

  const google = page.locator('a[href="/google/authorize"]').first();
  await google.waitFor({ state: "visible", timeout: 15000 });
  await google.click({ timeout: 10000 });
  console.log("[autoFill] 已进入 Google 登录页");

  const identifier = page.locator('#identifierId, input[name="identifier"]').first();
  await identifier.waitFor({ state: "visible", timeout: 20000 });
  await identifier.fill(email);
  await page.locator("#identifierNext").click({ timeout: 10000 });
  console.log("[autoFill] 已提交 Google 账号");

  const passwordInput = page.locator('input[name="Passwd"]').first();
  const passwordDeadline = Date.now() + 20_000;
  while (!(await passwordInput.isVisible().catch(() => false))) {
    const rejected = page.locator('[aria-live="assertive"]').first();
    if (await rejected.isVisible().catch(() => false)) {
      throw new Error("Google 未接受该账号，请检查账号地址或完成安全验证");
    }
    if (Date.now() >= passwordDeadline) {
      throw new Error("Google 未显示密码输入页，请在浏览器窗口完成安全验证");
    }
    await page.waitForTimeout(500);
  }
  await passwordInput.fill(password);
  await page.locator("#passwordNext").click({ timeout: 10000 });
  console.log("[autoFill] 已提交 Google 密码");

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const currentUrl = new URL(page.url());
    if (isOpenCodeUrl(currentUrl.href)) return;
    if (currentUrl.pathname.includes("/challenge/recaptcha")) {
      throw new Error("Google 要求验证码，请在浏览器窗口手动完成后点“立即抓取”");
    }

    if (currentUrl.pathname.includes("/speedbump/workspacetermsofservice")) {
      console.log("[autoFill] 检测到 Google Workspace 服务条款页");
      await page.evaluate(() => {
        (globalThis as { scrollTo?: (x: number, y: number) => void }).scrollTo?.(
          0,
          Number.MAX_SAFE_INTEGER
        );
      });
      const understand = page
        .getByRole("button", { name: GOOGLE_TERMS_ACCEPT_BUTTON_NAME })
        .first();
      await understand.waitFor({ state: "visible", timeout: 15000 });
      await understand.scrollIntoViewIfNeeded();
      const termsUrl = page.url();
      await understand.evaluate((button: any) => button.click()).catch((err) => {
        if (page.url() === termsUrl) throw err;
      });
      console.log("[autoFill] 已接受 Google Workspace 服务条款");
      await page.waitForTimeout(1000);
      continue;
    }

    const rejected = page.locator('[aria-live="assertive"]').first();
    if (await rejected.isVisible().catch(() => false)) {
      throw new Error("Google 拒绝登录，请检查账号密码或在浏览器窗口完成安全验证");
    }

    const recoveryChoice = page
      .getByText(/Confirm your recovery email|确认您的辅助邮箱|确认辅助邮箱/)
      .first();
    if (await recoveryChoice.isVisible().catch(() => false)) {
      await recoveryChoice.click({ timeout: 5000 });
    }

    const recovery = page
      .locator('input[name="knowledgePreregisteredEmailResponse"]')
      .first();
    if (await recovery.isVisible().catch(() => false)) {
      if (!recoveryEmail) {
        throw new Error("Google 要求验证辅助邮箱，但账号记录未提供辅助邮箱");
      }
      await recovery.fill(recoveryEmail);
      await page.locator("#next, #identifierNext, button:has-text('Next'), button:has-text('下一步')").first().click({ timeout: 5000 });
    }

    const consent = page
      .locator("button:has-text('Continue'), button:has-text('继续'), button:has-text('Allow'), button:has-text('允许')")
      .first();
    if (await consent.isVisible().catch(() => false)) {
      const consentUrl = page.url();
      await consent.click({ timeout: 5000 }).catch((err) => {
        if (page.url() === consentUrl) throw err;
      });
    }

    await page.waitForTimeout(500);
  }

  throw new Error("Google 登录未在 60 秒内返回 OpenCode，请在浏览器窗口完成安全验证");
}

/**
 * 注册成功处理：抓取 Cookie → 验证 → 加密 → 创建账号
 */
async function handleRegistrationSuccess(
  monitor: RegistrationMonitor,
  context: BrowserContext,
  playwrightCookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
  }>
): Promise<void> {
  // 转换 Playwright Cookie → 我们的 Cookie 格式
  const cookies: Cookie[] = playwrightCookies
    .filter((c) => c.name && c.value)
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));

  // 验证 Cookie 并抓取用户信息（开无头浏览器访问 opencode.ai）
  let username = "";
  let avatarUrl = "";
  let sessionEmail = "";

  try {
    const sessionInfo = await verifyCookies(cookies);
    username = sessionInfo.username || "";
    avatarUrl = sessionInfo.avatarUrl || "";
    sessionEmail = sessionInfo.email || "";
  } catch {
    // 验证失败不阻塞，仍然创建账号
  }

  // 加密 Cookie
  const cookieJson = JSON.stringify(cookies);
  const { encrypted, iv, authTag } = encrypt(cookieJson);
  const now = Date.now();

  // 确定别名和邮箱
  const alias = monitor.email || sessionEmail || username || "新注册账号";
  const email = monitor.email || sessionEmail;

  const existing = email ? getAccountByEmail(email) : undefined;
  if (existing) {
    monitor.status = "completed";
    monitor.newAccountId = existing.id;
    monitor.newAccountAlias = existing.alias;
    monitor.completedAt = now;
    return;
  }

  // 构建备注
  const noteParts: string[] = [];
  if (monitor.password) noteParts.push(`密码: ${monitor.password}`);
  if (monitor.invitedBy) noteParts.push(`邀请来源: ${monitor.invitedBy}`);
  const note = noteParts.join(" | ");

  const account: Account = {
    id: uuid(),
    alias,
    email,
    username,
    avatarUrl,
    encryptedCookies: encrypted,
    iv,
    authTag,
    lastVerifiedAt: now,
    createdAt: now,
    note,
    invitedBy: monitor.invitedBy,
  };

  insertAccount(account);

  const stored = email ? getAccountByEmail(email) ?? account : account;

  monitor.status = "completed";
  monitor.newAccountId = stored.id;
  monitor.newAccountAlias = stored.alias;
  monitor.completedAt = now;
}
