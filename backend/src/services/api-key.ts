import { decrypt, encrypt } from "../utils/crypto.js";
import { getAccountById, updateAccount } from "./account-store.js";
import type { Account, Cookie } from "../types.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

export interface ApiKeyResult {
  accountId: string;
  alias: string;
  apiKey: string;
  source: "cache" | "live";
  updatedAt: number;
}

function decryptCookies(account: Account): Cookie[] {
  return JSON.parse(
    decrypt(account.encryptedCookies, account.iv, account.authTag)
  ) as Cookie[];
}

function cookiesToString(cookies: Cookie[]): string {
  return cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function readCachedKey(account: Account): string | null {
  if (!account.encryptedApiKey || !account.apiKeyIv || !account.apiKeyAuthTag) {
    return null;
  }
  return decrypt(
    account.encryptedApiKey,
    account.apiKeyIv,
    account.apiKeyAuthTag
  );
}

async function getWorkspaceId(
  cookieHeader: string,
  headers: Record<string, string>
): Promise<string> {
  const response = await fetch("https://opencode.ai/auth", {
    headers,
    redirect: "manual",
  });
  const location = response.headers.get("location") ?? "";
  const match = location.match(/\/workspace\/(wrk_[A-Za-z0-9]+)/);
  if (!match) {
    throw new Error(`登录状态可能已失效（官方返回 ${response.status}）`);
  }
  return match[1];
}

async function fetchLiveKey(account: Account): Promise<string> {
  const cookieHeader = cookiesToString(decryptCookies(account));
  const headers: Record<string, string> = {
    Cookie: cookieHeader,
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };
  const workspaceId = await getWorkspaceId(cookieHeader, headers);
  const response = await fetch(
    `https://opencode.ai/workspace/${workspaceId}/keys`,
    { headers: { ...headers, Referer: "https://opencode.ai/" } }
  );
  if (!response.ok) {
    throw new Error(`读取官方 Key 页面失败（${response.status}）`);
  }

  const html = await response.text();
  const match = html.match(/sk-[A-Za-z0-9_-]{20,}/);
  if (!match) {
    throw new Error("官方账号中暂未找到 API Key");
  }
  return match[0];
}

/**
 * 获取账号 API Key。默认优先读取本机加密缓存；refresh=true 时从官方刷新。
 */
export async function getApiKey(
  accountId: string,
  refresh = false
): Promise<ApiKeyResult> {
  const account = getAccountById(accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);

  if (!refresh) {
    const cached = readCachedKey(account);
    if (cached) {
      return {
        accountId,
        alias: account.alias,
        apiKey: cached,
        source: "cache",
        updatedAt: account.apiKeyUpdatedAt ?? account.lastVerifiedAt,
      };
    }
  }

  const apiKey = await fetchLiveKey(account);
  const encrypted = encrypt(apiKey);
  const updatedAt = Date.now();
  updateAccount(accountId, {
    encryptedApiKey: encrypted.encrypted,
    apiKeyIv: encrypted.iv,
    apiKeyAuthTag: encrypted.authTag,
    apiKeyUpdatedAt: updatedAt,
  });

  return {
    accountId,
    alias: account.alias,
    apiKey,
    source: "live",
    updatedAt,
  };
}
