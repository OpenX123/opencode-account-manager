import { decrypt } from "../utils/crypto.js";
import { getAccountById } from "./account-store.js";
import type { Account, Cookie } from "../types.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

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

  return {
    accountId,
    alias: context.account.alias,
    fetchedAt,
    plan: {
      name: planName,
      status: hasLiteSubscription || subscriptionPresent ? "active" : "none",
      region: readString(subscriptionText, "region") ?? "",
      useBalance: readBoolean(subscriptionText, "useBalance"),
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
  });
  const location = auth.headers.get("location") ?? "";
  const workspaceId = location.match(/\/workspace\/(wrk_[A-Za-z0-9]+)/)?.[1];
  if (!workspaceId) {
    throw new Error(`Cookie 可能已失效（状态码 ${auth.status}，未进入工作区）`);
  }

  const workspaceUrl = `https://opencode.ai/workspace/${workspaceId}`;
  const pageUrls = [
    workspaceUrl,
    `${workspaceUrl}/go`,
    `${workspaceUrl}/billing`,
    `${workspaceUrl}/usage`,
  ];
  const assetUrls = new Set<string>();
  for (const pageUrl of pageUrls) {
    const response = await fetch(pageUrl, { headers: baseHeaders });
    if (!response.ok) continue;
    const html = await response.text();
    for (const match of html.matchAll(/(?:href|src)="(\/_build\/assets\/[^"]+\.js)"/g)) {
      assetUrls.add(`https://opencode.ai${match[1]}`);
    }
  }
  if (assetUrls.size === 0) throw new Error("无法读取官方页面资源");

  const hashes = new Map<string, string>();
  for (const assetUrl of assetUrls) {
    const response = await fetch(assetUrl, { headers: baseHeaders });
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

  return { account, workspaceId, cookieHeader, workspaceUrl, hashes };
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
  const value = text.match(new RegExp(`\\b${escapedKey}:(true|false|null)`))?.[1];
  return value === "true" ? true : value === "false" ? false : null;
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
