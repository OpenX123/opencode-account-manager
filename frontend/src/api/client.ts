// ============================================================
// API Client — 后端通信封装
// ============================================================

import type { AccountSummary, InviteLinkResult, RegistrationStatus, AppSettings } from "../types";

const BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

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

// --- 浏览器 API ---

export function openAccount(id: string): Promise<{ success: boolean }> {
  return request(`/browser/open/${id}`, { method: "POST" });
}

export function openBilling(id: string): Promise<{ success: boolean; url: string }> {
  return request(`/browser/billing/${id}`, { method: "POST" });
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

export function getSettings(): Promise<AppSettings> {
  return request<AppSettings>("/settings");
}

export function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return request<AppSettings>("/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}
