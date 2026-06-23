// ============================================================
// Usage Checker — 账号额度查询（纯协议版）
//
// 不走 Playwright，直接用 HTTP 请求调 opencode.ai 的
// /_server RPC 协议获取使用率。
//
// 流程：
//   1. 带 Cookie GET /auth → 302 → /workspace/{wsId}（拿 workspaceId）
//   2. GET /workspace/{wsId} 页面 HTML，提取 JS bundle URL
//   3. 下载 JS bundle，从 createServerReference 提取 lite.subscription.get hash
//   4. GET /_server?id={hash}&args=... → 获取使用率数据
//   5. 解析 rollingUsage / weeklyUsage / monthlyUsage
// ============================================================

import { decrypt } from "../utils/crypto.js";
import { getAccountById } from "./account-store.js";
import type { Account, Cookie } from "../types.js";

export interface UsageWindow {
  usagePercent: number;
  resetInSec: number;
  status: string;
}

export interface UsageResult {
  accountId: string;
  alias: string;
  success: boolean;
  message: string;
  rolling?: UsageWindow;
  weekly?: UsageWindow;
  monthly?: UsageWindow;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

function cookiesToString(cookies: Cookie[]): string {
  return cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function decryptCookies(account: Account): Cookie[] {
  const json = decrypt(account.encryptedCookies, account.iv, account.authTag);
  return JSON.parse(json) as Cookie[];
}

/**
 * 为指定账号查询额度使用率（纯协议）。
 */
export async function checkUsage(accountId: string): Promise<UsageResult> {
  const account = getAccountById(accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);

  const cookies = decryptCookies(account);
  const cookieHeader = cookiesToString(cookies);

  const baseHeaders: Record<string, string> = {
    Cookie: cookieHeader,
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };

  // 第 1 步：带 Cookie 访问 /auth → 302 → /workspace/{wsId}
  const authRes = await fetch("https://opencode.ai/auth", {
    headers: baseHeaders,
    redirect: "manual",
  });

  const location = authRes.headers.get("location") || "";
  const wsMatch = location.match(/\/workspace\/(wrk_[A-Za-z0-9]+)/);
  if (!wsMatch) {
    throw new Error(
      `Cookie 可能已失效（状态码 ${authRes.status}，未重定向到工作区）`
    );
  }
  const workspaceId = wsMatch[1];

  // 第 2 步：访问 workspace 主页和 /go 页，提取 JS bundle URL
  const wsUrl = `https://opencode.ai/workspace/${workspaceId}`;
  const goUrl = `https://opencode.ai/workspace/${workspaceId}/go`;
  const referer = "https://opencode.ai/";

  const jsUrls: string[] = [];
  const seenUrls = new Set<string>();

  for (const pageUrl of [wsUrl, goUrl]) {
    try {
      const pageRes = await fetch(pageUrl, {
        headers: { ...baseHeaders, Referer: referer },
      });
      if (!pageRes.ok) continue;
      const pageHtml = await pageRes.text();

      const urlPattern = /(?:href|src)="(\/_build\/assets\/[^"]+\.js)"/g;
      let m: RegExpExecArray | null;
      while ((m = urlPattern.exec(pageHtml)) !== null) {
        const fullUrl = `https://opencode.ai${m[1]}`;
        if (!seenUrls.has(fullUrl)) {
          seenUrls.add(fullUrl);
          jsUrls.push(fullUrl);
        }
      }
    } catch {
      // 忽略页面加载失败
    }
  }

  if (jsUrls.length === 0) {
    throw new Error("无法从 Workspace/Go 页面提取 JS bundle URL");
  }

  // 第 3 步：下载 JS bundle，提取 lite.subscription.get hash
  const subHash = await extractSubscriptionFnHash(jsUrls, baseHeaders, goUrl);

  if (!subHash) {
    throw new Error("无法从 JS bundle 中提取 lite.subscription.get 的 server function ID");
  }

  // 第 4 步：GET /_server 获取使用率
  const args = JSON.stringify({
    t: { t: 9, i: 0, l: 1, a: [{ t: 1, s: workspaceId }], o: 0 },
    f: 31,
    m: [],
  });

  const url = `https://opencode.ai/_server?id=${subHash}&args=${encodeURIComponent(args)}`;

  const res = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
      "User-Agent": UA,
      Accept: "*/*",
      Referer: wsUrl,
      "x-server-id": subHash,
      "x-server-instance": "server-fn:0",
    },
  });

  if (!res.ok) {
    throw new Error(`获取使用率失败: ${res.status}`);
  }

  const text = await res.text();

  // 第 5 步：解析 rollingUsage / weeklyUsage / monthlyUsage
  const rolling = extractWindow(text, "rollingUsage");
  const weekly = extractWindow(text, "weeklyUsage");
  const monthly = extractWindow(text, "monthlyUsage");

  if (!rolling && !weekly && !monthly) {
    return {
      accountId,
      alias: account.alias,
      success: false,
      message: "未解析到使用率数据（响应格式可能已变更）",
    };
  }

  return {
    accountId,
    alias: account.alias,
    success: true,
    message: "查询成功",
    rolling: rolling ?? undefined,
    weekly: weekly ?? undefined,
    monthly: monthly ?? undefined,
  };
}

/**
 * 从 JS bundle 中提取 lite.subscription.get 的 server function hash。
 *
 * JS 中的模式：
 *   varName = createServerReference("hash", ...)
 *   ... query(varName, "lite.subscription.get")
 */
async function extractSubscriptionFnHash(
  jsUrls: string[],
  headers: Record<string, string>,
  referer: string
): Promise<string | null> {
  for (const jsUrl of jsUrls) {
    try {
      const res = await fetch(jsUrl, {
        headers: { ...headers, Referer: referer },
      });
      if (!res.ok) continue;
      const text = await res.text();

      // 找所有 createServerReference 调用，提取 varName → hash
      const refPattern = /(\w+)\s*=\s*createServerReference\(["']([0-9a-f]{64})["']/g;
      const varToHash = new Map<string, string>();
      let m: RegExpExecArray | null;
      while ((m = refPattern.exec(text)) !== null) {
        varToHash.set(m[1], m[2]);
      }

      if (varToHash.size === 0) continue;

      // 找 query(varName, "lite.subscription.get") 或 action(varName, "lite.subscription.get")
      for (const [varName, hash] of varToHash) {
        const usagePattern = new RegExp(
          "(?:query|action)\\(" +
            varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            '\\s*,\\s*["\']lite\\.subscription\\.get["\']'
        );
        if (usagePattern.test(text)) {
          return hash;
        }
      }
    } catch {
      // 忽略加载失败
    }
  }

  return null;
}

/**
 * 从 /_server 响应文本中提取指定窗口的使用率。
 *
 * 响应格式（$R 数组引用）：
 *   ;0x...;((self.$R=self.$R||{})["server-fn:N"]=[],($R=>{
 *     ...rollingUsage:$R[1]={usagePercent:23,resetInSec:3600,status:"ok"},
 *     weeklyUsage:$R[2]={...},
 *     monthlyUsage:$R[3]={...}
 *   })($R["server-fn:N"]))
 *
 * 也可能 $R[N] 定义在别处再被引用：
 *   $R[5]={usagePercent:23,...}, rollingUsage:$R[5]
 */
function extractWindow(text: string, windowName: string): UsageWindow | null {
  const idx = text.indexOf(windowName);
  if (idx === -1) return null;

  // 从窗口名位置向后搜索 300 字符，找最近的字段
  const section = text.substring(idx, idx + 300);

  // 尝试直接匹配 $R[N]={...} 模式
  const refMatch = section.match(
    new RegExp(windowName + ":\\$R\\[(\\d+)\\]")
  );
  if (refMatch) {
    const refIdx = refMatch[1];
    // 找 $R[refIdx]={...} 定义
    const defPattern = new RegExp(
      "\\$R\\[" + refIdx + "\\]=\\{([^}]+)\\}"
    );
    const defMatch = text.match(defPattern);
    if (defMatch) {
      return parseWindowFields(defMatch[1]);
    }
  }

  // 尝试直接匹配 inline 对象
  const inlineMatch = section.match(
    new RegExp(windowName + ":(?:\\$R\\[\\d+\\]=)?\\{([^}]+)\\}")
  );
  if (inlineMatch) {
    return parseWindowFields(inlineMatch[1]);
  }

  // 兜底：在 section 范围内找字段
  return parseWindowFields(section);
}

function parseWindowFields(content: string): UsageWindow | null {
  const usageMatch = content.match(/usagePercent:(\d+(?:\.\d+)?)/);
  const resetMatch = content.match(/resetInSec:(\d+)/);
  const statusMatch = content.match(/status:"([^"]+)"/);

  if (!usageMatch) return null;

  return {
    usagePercent: parseFloat(usageMatch[1]),
    resetInSec: resetMatch ? parseInt(resetMatch[1], 10) : 0,
    status: statusMatch ? statusMatch[1] : "unknown",
  };
}
