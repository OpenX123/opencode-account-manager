import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import { v4 as uuid } from "uuid";
import { insertAccount } from "./account-store.js";
import { extractSessionInfo, getBrowser } from "./browser-pool.js";
import { encrypt } from "../utils/crypto.js";
import type { Account, Cookie } from "../types.js";

const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const RESULT_RETENTION_MS = 15 * 60 * 1000;

export type OAuthLoginState =
  | "pending"
  | "success"
  | "error"
  | "cancelled"
  | "expired";

export interface OAuthLoginStatus {
  sessionId: string;
  state: OAuthLoginState;
  startedAt: number;
  expiresAt: number;
  accountId?: string;
  alias?: string;
  error?: string;
}

interface OAuthLoginSession extends OAuthLoginStatus {
  requestedAlias: string;
  context: BrowserContext | null;
  timeout: NodeJS.Timeout | null;
  capturing: boolean;
}

const sessions = new Map<string, OAuthLoginSession>();

export async function startOAuthLogin(
  alias = ""
): Promise<OAuthLoginStatus> {
  const sessionId = randomUUID();
  const startedAt = Date.now();
  const context = await (await getBrowser()).newContext({
    viewport: { width: 1180, height: 820 },
  });

  const session: OAuthLoginSession = {
    sessionId,
    state: "pending",
    startedAt,
    expiresAt: startedAt + LOGIN_TIMEOUT_MS,
    requestedAlias: alias.trim(),
    context,
    timeout: null,
    capturing: false,
  };
  sessions.set(sessionId, session);

  context.on("close", () => {
    if (session.state === "pending") {
      finishSession(session, "cancelled", "登录窗口已关闭");
    }
  });

  session.timeout = setTimeout(() => {
    if (session.state === "pending") {
      void closeAndFinish(session, "expired", "登录等待已超时，请重新发起");
    }
  }, LOGIN_TIMEOUT_MS);
  session.timeout.unref();

  try {
    const page = await context.newPage();
    await page.goto("https://opencode.ai/auth", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
  } catch (error) {
    await closeAndFinish(
      session,
      "error",
      `无法打开 OpenCode 登录页: ${(error as Error).message}`
    );
    throw error;
  }

  return publicStatus(session);
}

export async function getOAuthLoginStatus(
  sessionId: string
): Promise<OAuthLoginStatus | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (session.state === "pending") {
    await captureCompletedLogin(session);
  }
  return publicStatus(session);
}

export async function cancelOAuthLogin(
  sessionId: string
): Promise<OAuthLoginStatus | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.state === "pending") {
    await closeAndFinish(session, "cancelled", "登录已取消");
  }
  return publicStatus(session);
}

async function captureCompletedLogin(session: OAuthLoginSession): Promise<void> {
  const context = session.context;
  if (!context || session.capturing) return;

  if (context.pages().length === 0) {
    await closeAndFinish(session, "cancelled", "登录窗口已关闭");
    return;
  }

  const workspacePage = [...context.pages()]
    .reverse()
    .find((page) => isOpenCodeWorkspace(page));
  if (!workspacePage) return;

  session.capturing = true;
  try {
    await workspacePage.waitForLoadState("domcontentloaded", { timeout: 5000 })
      .catch(() => undefined);

    const playwrightCookies = await context.cookies("https://opencode.ai");
    const cookies: Cookie[] = playwrightCookies
      .filter((cookie) => cookie.name && cookie.value)
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires > 0 ? cookie.expires : undefined,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite === "Strict" ||
          cookie.sameSite === "Lax" ||
          cookie.sameSite === "None"
          ? cookie.sameSite
          : undefined,
      }));

    if (cookies.length === 0) return;

    const info = await extractSessionInfo(workspacePage);
    const now = Date.now();
    const { encrypted, iv, authTag } = encrypt(JSON.stringify(cookies));
    const account: Account = {
      id: uuid(),
      alias:
        session.requestedAlias ||
        info.username ||
        info.email ||
        "OAuth 账号",
      email: info.email || "",
      username: info.username || "",
      avatarUrl: info.avatarUrl || "",
      encryptedCookies: encrypted,
      iv,
      authTag,
      lastVerifiedAt: now,
      createdAt: now,
      note: "通过内置浏览器 OAuth 登录导入",
      invitedBy: null,
    };

    insertAccount(account);
    session.accountId = account.id;
    session.alias = account.alias;
    await closeAndFinish(session, "success");
  } catch (error) {
    await closeAndFinish(
      session,
      "error",
      `登录信息保存失败: ${(error as Error).message}`
    );
  } finally {
    session.capturing = false;
  }
}

function isOpenCodeWorkspace(page: Page): boolean {
  try {
    const url = new URL(page.url());
    return (
      (url.hostname === "opencode.ai" || url.hostname.endsWith(".opencode.ai")) &&
      /^\/workspace\/[^/]+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function closeAndFinish(
  session: OAuthLoginSession,
  state: Exclude<OAuthLoginState, "pending">,
  error?: string
): Promise<void> {
  finishSession(session, state, error);
  const context = session.context;
  session.context = null;
  if (context) {
    await context.close().catch(() => undefined);
  }
}

function finishSession(
  session: OAuthLoginSession,
  state: Exclude<OAuthLoginState, "pending">,
  error?: string
): void {
  session.state = state;
  session.error = error;
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }

  const cleanup = setTimeout(() => sessions.delete(session.sessionId), RESULT_RETENTION_MS);
  cleanup.unref();
}

function publicStatus(session: OAuthLoginSession): OAuthLoginStatus {
  return {
    sessionId: session.sessionId,
    state: session.state,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    accountId: session.accountId,
    alias: session.alias,
    error: session.error,
  };
}
