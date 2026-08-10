import { decrypt } from "../utils/crypto.js";
import { getAccountById } from "./account-store.js";
import type { Account, Cookie } from "../types.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 4_500;
const HASH_CACHE_MS = 60 * 60 * 1000;
let hashCache = {
  value: new Map([
    ["lite.subscription.get", "c7389bd0e731f80f49593e5ee53835475f4e28594dd6bd83eb229bab753498cd"],
    ["billing.get", "c83b78a614689c38ebee981f9b39a8b377716db85c1fd7dbab604adc02d3313d"],
    ["usage.list", "6262ba54bff26cd7ec162f93db420e0d19df9cd94b2233dfe3b6b24c3f990388"],
    ["setLiteUseBalance", "0c8d84b0a700eb0de440ca4c9105b42d6c9ede971d6bf592fa4f91bbeaaa1e6b"],
    ["go.providerRouting.set", "57e61af1bc9c8fa15e0c1a880a2a6754484afdd4a3bc4426b3fc02e3a7ff4d69"],
  ]),
  expiresAt: 0,
};
let hashRefresh: Promise<void> | null = null;
const subscriptionWatchers = new Set<string>();

export interface InsightUsageWindow {
  usagePercent: number;
  remainingPercent: number;
  resetInSec: number;
  resetAt: number;
  status: string;
}

export interface UsageRecord {
  id: string;
  timeCreated: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWrite5mTokens: number | null;
  cacheWrite1hTokens: number | null;
  costMicroCents: number;
  plan: string;
}

export interface ModelUsageSummary {
  model: string;
  provider: string;
  requests: number;
  tokens: number;
  costMicroCents: number;
}

export interface AccountInsights {
  accountId: string;
  alias: string;
  fetchedAt: number;
  plan: {
    name: string;
    status: "active" | "none" | "unknown";
    region: string;
    useBalance: boolean | null;
    useChinaProviders: boolean | null;
    renewalAt: number | null;
    renewalNote: string;
  };
  billing: {
    balance: number;
    monthlyLimit: number | null;
    monthlyUsage: number | null;
    reloadEnabled: boolean;
    reloadAmount: number | null;
    reloadTrigger: number | null;
    paymentMethodType: string;
    paymentMethodLast4: string;
  };
  windows: {
    rolling?: InsightUsageWindow;
    weekly?: InsightUsageWindow;
    monthly?: InsightUsageWindow;
  };
  summary: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costMicroCents: number;
    models: ModelUsageSummary[];
  };
  records: UsageRecord[];
}

interface RpcContext {
  account: Account;
  workspaceId: string;
  cookieHeader: string;
  workspaceUrl: string;
  hashes: Map<string, string>;
}

export async function getAccountInsights(accountId: string): Promise<AccountInsights> {
  const context = await createRpcContext(accountId);
  const [subscriptionText, billingText, usageText] = await Promise.all([
    callQuery(context, "lite.subscription.get"),
    callQuery(context, "billing.get"),
    callQuery(context, "usage.list"),
  ]);
  const fetchedAt = Date.now();
  const records = parseUsageRecords(usageText);
  const hasLiteSubscription = /\bliteSubscriptionID:"/.test(billingText);
  const subscriptionPlan = readString(billingText, "subscriptionPlan");
  const subscriptionPresent = !/\bsubscription:null/.test(billingText);
  const balance = readNumber(billingText, "balance") ?? 0;
  const planName = hasLiteSubscription
    ? "OpenCode Go"
    : subscriptionPlan
      ? subscriptionPlan
      : subscriptionPresent || balance > 0
        ? "OpenCode Zen"
        : "免费 / 未订阅";

  const renewalAt =
    readDate(billingText, "currentPeriodEnd") ??
    readDate(billingText, "periodEnd") ??
    readDate(billingText, "renewalAt");
  const goSettings = parseGoSettings(subscriptionText, billingText);

  return {
    accountId,
    alias: context.account.alias,
    fetchedAt,
    plan: {
      name: planName,
      status: hasLiteSubscription || subscriptionPresent ? "active" : "none",
      region: readString(subscriptionText, "region") ?? "",
      ...goSettings,
      renewalAt: renewalAt?.getTime() ?? null,
      renewalNote: renewalAt
        ? "来自官方订阅响应"
        : "官方网页登录接口未返回下一次扣款日期；下方时间均为额度重置时间",
    },
    billing: {
      balance,
      monthlyLimit: readNumber(billingText, "monthlyLimit"),
      monthlyUsage: readNumber(billingText, "monthlyUsage"),
      reloadEnabled: !/\breload:null/.test(billingText),
      reloadAmount: readNumber(billingText, "reloadAmount"),
      reloadTrigger: readNumber(billingText, "reloadTrigger"),
      paymentMethodType: readString(billingText, "paymentMethodType") ?? "",
      paymentMethodLast4: readString(billingText, "paymentMethodLast4") ?? "",
    },
    windows: {
      rolling: parseUsageWindow(subscriptionText, "rollingUsage", fetchedAt),
      weekly: parseUsageWindow(subscriptionText, "weeklyUsage", fetchedAt),
      monthly: parseUsageWindow(subscriptionText, "monthlyUsage", fetchedAt),
    },
    summary: summarizeUsage(records),
    records,
  };
}

export function parseGoSettings(subscriptionText: string, billingText: string) {
  return {
    useBalance:
      readBoolean(subscriptionText, "useBalance") ?? readBoolean(billingText, "useBalance"),
    useChinaProviders:
      readBoolean(subscriptionText, "useChinaProviders") ??
      readBoolean(billingText, "useChinaProviders") ??
      /\bregion:\$R\[\d+\]=\[[^\]]*"cn"/.test(subscriptionText),
  };
}

export type GoSetting = "useBalance" | "useChinaProviders";

export async function enableGoSetting(accountId: string, setting: GoSetting) {
  const context = await createRpcContext(accountId);
  const label = setting === "useBalance" ? "setLiteUseBalance" : "go.providerRouting.set";
  const hash = context.hashes.get(label);
  if (!hash) throw new Error(`官方页面未提供 ${label} 操作`);

  const body = new URLSearchParams({ workspaceID: context.workspaceId });
  // 官方 action 接收的是切换前状态；false 表示将其开启。
  body.set(setting, "false");
  const response = await fetch("https://opencode.ai/_server", {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Cookie: context.cookieHeader,
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Origin: "https://opencode.ai",
      Referer: `${context.workspaceUrl}/go`,
      "x-server-id": hash,
      "x-server-instance": "server-fn:0",
      "x-single-flight": "true",
    },
    body,
  });
  if (!response.ok) throw new Error(`${label} 操作失败: HTTP ${response.status}`);
  const text = await response.text();
  if (/error:"(?!void 0)([^"]+)"/.test(text)) throw new Error(`${label} 操作失败`);
  return { setting, enabled: true };
}

export async function enableAllGoSettings(accountId: string): Promise<void> {
  await Promise.all([
    enableGoSetting(accountId, "useBalance"),
    enableGoSetting(accountId, "useChinaProviders"),
  ]);
}

export function watchForGoSubscription(accountId: string): void {
  if (subscriptionWatchers.has(accountId)) return;
  subscriptionWatchers.add(accountId);
  void (async () => {
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        try {
          if ((await getAccountInsights(accountId)).plan.status !== "active") continue;
          await enableAllGoSettings(accountId);
          console.log(`[billing] ${accountId} 的 Go 设置已自动开启`);
          return;
        } catch (error) {
          console.warn(`[billing] 检查付款状态失败: ${(error as Error).message}`);
        }
      }
    } finally {
      subscriptionWatchers.delete(accountId);
    }
  })();
}

async function createRpcContext(accountId: string): Promise<RpcContext> {
  const account = getAccountById(accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);

  const cookies = decryptCookies(account);
  const cookieHeader = cookies
    .filter((cookie) => cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const baseHeaders = {
    Cookie: cookieHeader,
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };

  const auth = await fetch("https://opencode.ai/auth", {
    headers: baseHeaders,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const location = auth.headers.get("location") ?? "";
  const workspaceId = location.match(/\/workspace\/(wrk_[A-Za-z0-9]+)/)?.[1];
  if (!workspaceId) {
    throw new Error(`Cookie 可能已失效（状态码 ${auth.status}，未进入工作区）`);
  }

  const workspaceUrl = `https://opencode.ai/workspace/${workspaceId}`;
  const hashes = await getRpcHashes(workspaceUrl, baseHeaders);

  return { account, workspaceId, cookieHeader, workspaceUrl, hashes };
}

async function getRpcHashes(
  workspaceUrl: string,
  headers: Record<string, string>
): Promise<Map<string, string>> {
  if (hashCache.expiresAt <= Date.now() && !hashRefresh) {
    hashRefresh = refreshRpcHashes(workspaceUrl, headers)
      .catch((error) => console.warn(`[insights] 刷新 RPC 地址失败: ${(error as Error).message}`))
      .finally(() => { hashRefresh = null; });
  }
  return hashCache.value;
}

async function refreshRpcHashes(
  workspaceUrl: string,
  headers: Record<string, string>
): Promise<void> {
  const pageUrls = [
    workspaceUrl,
    `${workspaceUrl}/go`,
    `${workspaceUrl}/billing`,
    `${workspaceUrl}/usage`,
  ];
  const assetUrls = new Set<string>();
  const pages = await Promise.all(pageUrls.map((pageUrl) => fetch(pageUrl, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })));
  for (const response of pages) {
    if (!response.ok) continue;
    const html = await response.text();
    for (const match of html.matchAll(/(?:href|src)="(\/_build\/assets\/[^"]+\.js)"/g)) {
      assetUrls.add(`https://opencode.ai${match[1]}`);
    }
  }
  if (assetUrls.size === 0) throw new Error("无法读取官方页面资源");

  const hashes = new Map<string, string>();
  const assets = await Promise.all([...assetUrls].map((assetUrl) => fetch(assetUrl, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })));
  for (const response of assets) {
    if (!response.ok) continue;
    const text = await response.text();
    const references = new Map<string, string>();
    for (const match of text.matchAll(/(\w+)\s*=\s*createServerReference\(["']([0-9a-f]{64})["']/g)) {
      references.set(match[1], match[2]);
    }
    for (const [variable, hash] of references) {
      const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const labelPattern = new RegExp(
        `(?:query|action)\\(${escaped}\\s*,\\s*["']([^"']+)["']`,
        "g"
      );
      for (const match of text.matchAll(labelPattern)) hashes.set(match[1], hash);
    }
  }
  if (hashes.size > 0) hashCache = { value: hashes, expiresAt: Date.now() + HASH_CACHE_MS };
}

async function callQuery(context: RpcContext, label: string): Promise<string> {
  const hash = context.hashes.get(label);
  if (!hash) throw new Error(`官方页面未提供 ${label} 查询`);
  const args = JSON.stringify({
    t: { t: 9, i: 0, l: 1, a: [{ t: 1, s: context.workspaceId }], o: 0 },
    f: 31,
    m: [],
  });
  const response = await fetch(
    `https://opencode.ai/_server?id=${hash}&args=${encodeURIComponent(args)}`,
    {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Cookie: context.cookieHeader,
        "User-Agent": UA,
        Accept: "*/*",
        Referer: context.workspaceUrl,
        "x-server-id": hash,
        "x-server-instance": "server-fn:0",
      },
    }
  );
  if (!response.ok) throw new Error(`${label} 查询失败: HTTP ${response.status}`);
  return response.text();
}

function parseUsageRecords(text: string): UsageRecord[] {
  const records: UsageRecord[] = [];
  const assignment = /\$R\[\d+\]=\{/g;
  let match: RegExpExecArray | null;
  while ((match = assignment.exec(text)) !== null) {
    const object = readBalancedObject(text, match.index + match[0].length - 1);
    if (!object || !/\btimeCreated:/.test(object) || !/\binputTokens:/.test(object)) continue;
    const id = readString(object, "id") ?? "";
    const timeCreated = readDate(object, "timeCreated")?.toISOString() ?? "";
    if (!id || !timeCreated) continue;
    records.push({
      id,
      timeCreated,
      model: readString(object, "model") ?? "unknown",
      provider: readString(object, "provider") ?? "unknown",
      inputTokens: readNumber(object, "inputTokens") ?? 0,
      outputTokens: readNumber(object, "outputTokens") ?? 0,
      reasoningTokens: readNumber(object, "reasoningTokens"),
      cacheReadTokens: readNumber(object, "cacheReadTokens"),
      cacheWrite5mTokens: readNumber(object, "cacheWrite5mTokens"),
      cacheWrite1hTokens: readNumber(object, "cacheWrite1hTokens"),
      costMicroCents: readNumber(object, "cost") ?? 0,
      plan: readString(object, "plan") ?? "",
    });
  }
  return records.sort((a, b) => b.timeCreated.localeCompare(a.timeCreated));
}

function summarizeUsage(records: UsageRecord[]): AccountInsights["summary"] {
  const models = new Map<string, ModelUsageSummary>();
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let costMicroCents = 0;

  for (const record of records) {
    inputTokens += record.inputTokens;
    outputTokens += record.outputTokens;
    reasoningTokens += record.reasoningTokens ?? 0;
    cacheReadTokens += record.cacheReadTokens ?? 0;
    cacheWriteTokens +=
      (record.cacheWrite5mTokens ?? 0) + (record.cacheWrite1hTokens ?? 0);
    costMicroCents += record.costMicroCents;
    const key = `${record.provider}\u0000${record.model}`;
    const current = models.get(key) ?? {
      model: record.model,
      provider: record.provider,
      requests: 0,
      tokens: 0,
      costMicroCents: 0,
    };
    current.requests += 1;
    current.tokens += record.inputTokens + record.outputTokens + (record.reasoningTokens ?? 0);
    current.costMicroCents += record.costMicroCents;
    models.set(key, current);
  }

  return {
    requests: records.length,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costMicroCents,
    models: [...models.values()].sort((a, b) => b.costMicroCents - a.costMicroCents),
  };
}

function parseUsageWindow(
  text: string,
  name: string,
  fetchedAt: number
): InsightUsageWindow | undefined {
  const nameIndex = text.indexOf(name);
  if (nameIndex === -1) return undefined;
  const section = text.slice(nameIndex, nameIndex + 400);
  const ref = section.match(new RegExp(`${name}:\\$R\\[(\\d+)\\]`))?.[1];
  const source = ref
    ? text.match(new RegExp(`\\$R\\[${ref}\\]=\\{([^}]+)\\}`))?.[1] ?? section
    : section;
  const usagePercent = readNumber(source, "usagePercent");
  if (usagePercent === null) return undefined;
  const resetInSec = readNumber(source, "resetInSec") ?? 0;
  return {
    usagePercent,
    remainingPercent: Math.max(0, 100 - usagePercent),
    resetInSec,
    resetAt: fetchedAt + resetInSec * 1000,
    status: readString(source, "status") ?? "unknown",
  };
}

function readBalancedObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function readString(text: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const raw = text.match(new RegExp(`\\b${escapedKey}:"((?:\\\\.|[^"\\\\])*)"`))?.[1];
  if (raw === undefined) return null;
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

function readNumber(text: string, key: string): number | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`\\b${escapedKey}:(-?\\d+(?:\\.\\d+)?|null)`));
  if (!match || match[1] === "null") return null;
  return Number(match[1]);
}

function readBoolean(text: string, key: string): boolean | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = text.match(new RegExp(`\\b${escapedKey}:(true|false|!0|!1|null)`))?.[1];
  return value === "true" || value === "!0"
    ? true
    : value === "false" || value === "!1"
      ? false
      : null;
}

function readDate(text: string, key: string): Date | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = text.match(
    new RegExp(`\\b${escapedKey}:(?:\\$R\\[\\d+\\]=)?new Date\\("([^"]+)"\\)`)
  )?.[1];
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decryptCookies(account: Account): Cookie[] {
  return JSON.parse(
    decrypt(account.encryptedCookies, account.iv, account.authTag)
  ) as Cookie[];
}
