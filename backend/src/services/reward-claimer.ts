// ============================================================
// Reward Claimer — 邀请奖励自动领取（纯协议版）
//
// 不走 Playwright，直接用 HTTP 请求调 opencode.ai 的
// /_server RPC 协议领取奖励。
//
// 流程：
//   1. 带 Cookie GET /auth → 302 → /workspace/{wsId}（拿 workspaceId）
//   2. GET /workspace/{wsId}/go 页面 HTML，提取 JS bundle URL
//   3. 下载 index-*.js（Go 页面组件），从 createServerReference 提取 hash→函数名映射
//   4. GET /_server?id={go.referral.get hash} → 拿 referral 列表，找 pending 的 referralId
//   5. POST /_server 用 {go.referral.reward.apply hash} → 申请奖励 → 返回 {amount}
// ============================================================

import { decrypt } from "../utils/crypto.js";
import { getAccountById } from "./account-store.js";
import type { Account, Cookie } from "../types.js";

export interface ClaimResult {
  accountId: string;
  alias: string;
  success: boolean;
  message: string;
  amount?: number;
}

interface ServerFnMap {
  "go.referral.get"?: string;
  "go.referral.usagePreview"?: string;
  "go.referral.reward.apply"?: string;
}

interface Referral {
  id: string;
  source: string;
  status: string;
  email: string;
  amount: number;
}

/** Cookie 转 header 字符串 */
function cookiesToString(cookies: Cookie[]): string {
  return cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

/**
 * 为指定账号自动领取邀请奖励（纯协议）。
 */
export async function claimReward(accountId: string): Promise<ClaimResult> {
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

  // 第 2 步：访问 Go 页面，提取 JS bundle URL
  const goUrl = `https://opencode.ai/workspace/${workspaceId}/go`;
  const goRes = await fetch(goUrl, {
    headers: { ...baseHeaders, Referer: "https://opencode.ai/" },
  });
  if (!goRes.ok) {
    throw new Error(`访问 Go 页面失败: ${goRes.status}`);
  }
  const goHtml = await goRes.text();

  // 提取所有 JS bundle URL（modulepreload 用 href，script 用 src）
  const jsUrls: string[] = [];
  const urlPattern = /(?:href|src)="(\/_build\/assets\/[^"]+\.js)"/g;
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(goHtml)) !== null) {
    jsUrls.push(`https://opencode.ai${m[1]}`);
  }

  // 第 3 步：下载 JS bundle，提取 server function hash → 函数名映射
  const fnMap = await extractServerFnMap(jsUrls, baseHeaders, goUrl);

  if (!fnMap["go.referral.reward.apply"]) {
    throw new Error("无法从 JS bundle 中提取 go.referral.reward.apply 的 server function ID");
  }

  // 第 4 步：GET referral 列表，找 pending 的 referralId
  const referrals = await getReferrals(
    fnMap["go.referral.get"]!,
    workspaceId,
    cookieHeader,
    goUrl
  );

  // 找未领取的奖励（status !== "applied"）
  const claimableReferral = referrals.find((r) => r.status !== "applied");

  if (!claimableReferral) {
    return {
      accountId,
      alias: account.alias,
      success: false,
      message: "没有待领取的奖励（所有奖励已领取）",
    };
  }

  // 第 5 步：POST 申请奖励
  const amount = await applyReward(
    fnMap["go.referral.reward.apply"]!,
    workspaceId,
    claimableReferral.id,
    cookieHeader,
    goUrl
  );

  if (amount !== null) {
    return {
      accountId,
      alias: account.alias,
      success: true,
      message: `奖励领取成功！获得 ${amount} 额度（来源: ${claimableReferral.source}）`,
      amount,
    };
  }

  return {
    accountId,
    alias: account.alias,
    success: false,
    message: "申请奖励请求已发送但未收到金额确认，请手动检查",
  };
}

/**
 * 从 JS bundle 中提取 server function hash → 函数名映射。
 *
 * JS 中的模式：
 *   varName = createServerReference("hash", ...)
 *   ... query(varName, "go.referral.get")
 *   ... action(varName, "go.referral.reward.apply")
 */
async function extractServerFnMap(
  jsUrls: string[],
  headers: Record<string, string>,
  referer: string
): Promise<ServerFnMap> {
  const map: ServerFnMap = {};
  const targetFns = new Set([
    "go.referral.get",
    "go.referral.usagePreview",
    "go.referral.reward.apply",
  ]);

  for (const jsUrl of jsUrls) {
    if (Object.keys(map).length >= targetFns.size) break;

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

      // 找 query(varName, "fn_name") 和 action(varName, "fn_name")
      for (const [varName, hash] of varToHash) {
        // 搜索 query(varName, "xxx") 或 action(varName, "xxx")
        const usagePattern = new RegExp(
          "(?:query|action)\\(" +
            varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            '\\s*,\\s*["\']([^"\']+)["\']'
        );
        const usageMatch = text.match(usagePattern);
        if (usageMatch) {
          const fnName = usageMatch[1];
          if (targetFns.has(fnName)) {
            (map as Record<string, string>)[fnName] = hash;
          }
        }
      }
    } catch {
      // 忽略加载失败
    }
  }

  return map;
}

/**
 * GET /_server 获取 referral 列表。
 * 响应格式: ;0x00000268;((self.$R=self.$R||{})["server-fn:N"]=[],($R=>{...rewards:[{id:"ref_xxx",status:"pending",...}]...})($R["server-fn:N"]))
 */
async function getReferrals(
  serverId: string,
  workspaceId: string,
  cookieHeader: string,
  referer: string
): Promise<Referral[]> {
  // 构造 GET 参数（从 HAR 分析）
  // args 格式：{"t":{"t":9,"i":0,"l":1,"a":[{"t":1,"s":"wrk_xxx"}],"o":0},"f":31,"m":[]}
  const args = JSON.stringify({
    t: { t: 9, i: 0, l: 1, a: [{ t: 1, s: workspaceId }], o: 0 },
    f: 31,
    m: [],
  });

  const url = `https://opencode.ai/_server?id=${serverId}&args=${encodeURIComponent(args)}`;

  const res = await fetch(url, {
    headers: {
      Cookie: cookieHeader,
      "User-Agent": UA,
      Accept: "*/*",
      Referer: referer,
      "x-server-id": serverId,
      "x-server-instance": "server-fn:0",
    },
  });

  if (!res.ok) {
    throw new Error(`获取 referral 列表失败: ${res.status}`);
  }

  const text = await res.text();

  // 解析响应中的 referral 数据
  // 格式: rewards:[{id:"ref_xxx",source:"inviter",status:"pending",email:"xxx",amount:500,...}]
  const referrals: Referral[] = [];

  // 匹配每个 referral 对象
  const referralPattern =
    /\{id:"(ref_[A-Za-z0-9]+)",source:"([^"]+)",status:"([^"]+)",email:"([^"]*)",amount:(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = referralPattern.exec(text)) !== null) {
    referrals.push({
      id: m[1],
      source: m[2],
      status: m[3],
      email: m[4],
      amount: parseInt(m[5], 10),
    });
  }

  return referrals;
}

/**
 * POST /_server 申请奖励。
 * 返回 amount 数字，或 null 表示失败。
 */
async function applyReward(
  serverId: string,
  workspaceId: string,
  referralId: string,
  cookieHeader: string,
  referer: string
): Promise<number | null> {
  // 构造 POST body（从 HAR 分析）
  // {"t":{"t":9,"i":0,"l":2,"a":[{"t":1,"s":"wrk_xxx"},{"t":1,"s":"ref_xxx"}],"o":0},"f":31,"m":[]}
  const body = JSON.stringify({
    t: {
      t: 9,
      i: 0,
      l: 2,
      a: [
        { t: 1, s: workspaceId },
        { t: 1, s: referralId },
      ],
      o: 0,
    },
    f: 31,
    m: [],
  });

  const res = await fetch("https://opencode.ai/_server", {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
      "x-server-id": serverId,
      "x-server-instance": "server-fn:1",
      "x-single-flight": "true",
      Origin: "https://opencode.ai",
      Referer: referer,
      "User-Agent": UA,
      Accept: "*/*",
    },
    body,
  });

  if (!res.ok) {
    return null;
  }

  const text = await res.text();
  // 响应格式: ;0x00000055;((self.$R=self.$R||{})["server-fn:1"]=[],($R=>$R[0]={amount:500})($R["server-fn:1"]))
  const match = text.match(/amount:(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function decryptCookies(account: Account): Cookie[] {
  const json = decrypt(account.encryptedCookies, account.iv, account.authTag);
  return JSON.parse(json) as Cookie[];
}
