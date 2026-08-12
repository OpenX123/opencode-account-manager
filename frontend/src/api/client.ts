// ============================================================
// API Client — 后端通信封装
// ============================================================

import type { AccountSummary, InviteLinkResult, RegistrationStatus, AppSettings, ChainAccount, ChainStatus } from "../types";

const BASE = `${import.meta.env.BASE_URL}api`;

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      ...options,
    });
  } catch (error) {
    if ((error as Error).name === "TimeoutError") throw new Error("操作超过 5 秒，已停止等待");
    throw error;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error || `HTTP ${res.status}`
    );
  }

  return res.json() as Promise<T>;
}

// --- 账号 API ---

export function getAccounts(): Promise<AccountSummary[]> {
  return request<AccountSummary[]>("/accounts");
}

export function importAccount(input: {
  cookies: string;
  alias?: string;
  note?: string;
  invitedBy?: string;
}): Promise<AccountSummary> {
  return request<AccountSummary>("/accounts/import", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAccount(id: string): Promise<void> {
  return request(`/accounts/${id}`, { method: "DELETE" });
}

export function getAuthStatus(): Promise<{ authenticated: boolean }> {
  return request<{ authenticated: boolean }>("/auth/status");
}

export function login(username: string, password: string): Promise<{ authenticated: boolean }> {
  return request<{ authenticated: boolean }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<{ authenticated: boolean }> {
  return request<{ authenticated: boolean }>("/auth/logout", { method: "POST" });
}

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
    models: Array<{
      model: string;
      provider: string;
      requests: number;
      tokens: number;
      costMicroCents: number;
    }>;
  };
  records: UsageRecord[];
}

export function getAccountInsights(id: string): Promise<AccountInsights> {
  return request<AccountInsights>(`/accounts/${id}/insights`, {
    signal: AbortSignal.timeout(5000),
  });
}

export interface ApiKeyResult {
  accountId: string;
  alias: string;
  apiKey: string;
  source: "cache" | "live";
  updatedAt: number;
}

export function getApiKey(id: string, refresh = false): Promise<ApiKeyResult> {
  return request<ApiKeyResult>(
    `/accounts/${id}/api-key${refresh ? "?refresh=true" : ""}`
  );
}

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

export function startOAuthLogin(alias?: string): Promise<OAuthLoginStatus> {
  return request<OAuthLoginStatus>("/browser/oauth/start", {
    method: "POST",
    body: JSON.stringify({ alias }),
  });
}

export function getOAuthLoginStatus(sessionId: string): Promise<OAuthLoginStatus> {
  return request<OAuthLoginStatus>(`/browser/oauth/status/${sessionId}`);
}

export function cancelOAuthLogin(sessionId: string): Promise<OAuthLoginStatus> {
  return request<OAuthLoginStatus>(`/browser/oauth/cancel/${sessionId}`, {
    method: "POST",
  });
}

export function openBillingPage(accountId: string): Promise<{ url: string }> {
  return request<{ url: string }>(`/browser/billing/${accountId}`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
  });
}

export function enableGoSetting(
  accountId: string,
  setting: "useBalance" | "useChinaProviders"
): Promise<{ setting: string; enabled: boolean }> {
  return request(`/browser/go-setting/${accountId}`, {
    method: "POST",
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({ setting }),
  });
}

// --- 邀请链接 API ---

export function generateInviteLink(accountId: string): Promise<InviteLinkResult> {
  return request<InviteLinkResult>("/invite/generate", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

// --- 注册监控 API ---

export function startRegistration(
  inviteLink: string,
  invitedBy?: string
): Promise<{ monitorId: string }> {
  return request<{ monitorId: string }>("/invite/register", {
    method: "POST",
    body: JSON.stringify({ inviteLink, invitedBy }),
  });
}

export function getRegistrationStatus(
  monitorId: string
): Promise<RegistrationStatus> {
  return request<RegistrationStatus>(`/invite/register/status/${monitorId}`);
}

export function retryCapture(
  monitorId: string
): Promise<RegistrationStatus> {
  return request<RegistrationStatus>(`/invite/register/retry/${monitorId}`, {
    method: "POST",
  });
}

export interface ClaimResult {
  accountId: string;
  alias: string;
  success: boolean;
  message: string;
  amount?: number;
}

export function claimReward(accountId: string): Promise<ClaimResult> {
  return request<ClaimResult>("/invite/claim-reward", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

// --- 额度查询 API ---

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

export function checkUsage(accountId: string): Promise<UsageResult> {
  return request<UsageResult>("/invite/usage", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

export function checkUsageBatch(): Promise<{ results: UsageResult[] }> {
  return request<{ results: UsageResult[] }>("/invite/usage-batch", {
    method: "POST",
    signal: AbortSignal.timeout(60000),
  });
}

// --- sub2api 同步 API ---

export interface SyncResult {
  accountId: string;
  alias: string;
  success: boolean;
  message: string;
  apiKey?: string;
  sub2apiId?: number;
  sub2apiName?: string;
}

export function syncToSub2api(accountId: string): Promise<SyncResult> {
  return request<SyncResult>("/invite/sync-sub2api", {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

export function syncAllToSub2api(): Promise<{ results: SyncResult[] }> {
  return request<{ results: SyncResult[] }>("/invite/sync-sub2api-batch", {
    method: "POST",
  });
}

export function testSub2api(): Promise<{ success: boolean; message: string }> {
  return request<{ success: boolean; message: string }>("/invite/test-sub2api", {
    method: "POST",
  });
}

// --- 自动邀请链 API ---

export function parseAccounts(text: string): Promise<{
  accounts: ChainAccount[];
  count: number;
  skippedExisting: number;
  skippedDuplicate: number;
  skippedInvalid: number;
}> {
  return request("/invite/parse-accounts", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function startAutoChain(
  mainAccountId: string,
  accounts: ChainAccount[]
): Promise<{ chainId: string }> {
  return request<{ chainId: string }>("/invite/auto-chain", {
    method: "POST",
    body: JSON.stringify({ mainAccountId, accounts }),
  });
}

export function getAutoChainStatus(chainId: string): Promise<ChainStatus> {
  return request<ChainStatus>(`/invite/auto-chain/status/${chainId}`);
}

// --- 设置 API ---

export function getSettings(): Promise<AppSettings> {
  return request<AppSettings>("/settings");
}

export function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return request<AppSettings>("/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
