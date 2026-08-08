// ============================================================
// AccountList — 行式清单（告别卡片网格）
// ============================================================

import { useState, useEffect, useRef } from "react";
import type { AccountSummary } from "../types";
import { useToast } from "./Toast";
import * as api from "../api/client";
import type { UsageResult, UsageWindow, SyncResult, ApiKeyResult } from "../api/client";
import AccountDetailsPanel from "./AccountDetailsPanel";
import {
  IconTrash,
  IconGift,
  IconSync,
  IconRadar,
  IconKey,
  IconEye,
  IconEyeOff,
  IconCopy,
  IconRefresh,
} from "./icons";

interface Props {
  accounts: AccountSummary[];
  loading: boolean;
  onRemove: (id: string) => void;
  onRefresh: () => void;
}

function relativeTime(ts: number): string {
  if (!ts) return "尚未验证";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

function formatReset(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function UsageBar({ label, window }: { label: string; window: UsageWindow }) {
  const remaining = Math.max(0, 100 - window.usagePercent);
  const used = window.usagePercent;
  const color =
    used > 80 ? "#e85d5d" : used > 50 ? "#e8a85d" : "#7ab87a";

  return (
    <div className="flex items-center gap-2">
      <span className="w-8 font-mono text-[10px] text-paper-faint">{label}</span>
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-ink-700/60">
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${used}%`, backgroundColor: color }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums" style={{ color }}>
        {remaining.toFixed(0)}%
      </span>
      <span className="font-mono text-[9px] text-paper-faint">
        {formatReset(window.resetInSec)}
      </span>
    </div>
  );
}

export default function AccountList({
  accounts,
  loading,
  onRemove,
}: Props) {
  const { toast } = useToast();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [usageMap, setUsageMap] = useState<Record<string, UsageResult>>({});
  const [usageLoading, setUsageLoading] = useState(false);
  const [syncLoadingId, setSyncLoadingId] = useState<string | null>(null);
  const [syncMap, setSyncMap] = useState<Record<string, SyncResult>>({});
  const [detailsAccount, setDetailsAccount] = useState<AccountSummary | null>(null);
  const [keyLoadingId, setKeyLoadingId] = useState<string | null>(null);
  const [keyMap, setKeyMap] = useState<Record<string, ApiKeyResult>>({});
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // 自动批量查询额度
  const fetchAllUsage = async (silent = false) => {
    if (accounts.length === 0) return;
    if (!silent) setUsageLoading(true);
    try {
      const { results } = await api.checkUsageBatch();
      const map: Record<string, UsageResult> = {};
      for (const r of results) {
        map[r.accountId] = r;
      }
      setUsageMap(map);
    } catch (err) {
      if (!silent) toast(`额度批量查询失败: ${(err as Error).message}`, "error");
    } finally {
      if (!silent) setUsageLoading(false);
    }
  };

  // 账号列表变化时自动加载额度
  useEffect(() => {
    fetchAllUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  // 定时刷新额度（每 60 秒）
  useEffect(() => {
    if (accounts.length === 0) return;
    refreshTimer.current = setInterval(() => fetchAllUsage(true), 60000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  const handleGetKey = async (account: AccountSummary, refresh = false) => {
    setKeyLoadingId(account.id);
    try {
      const result = await api.getApiKey(account.id, refresh);
      setKeyMap((prev) => ({ ...prev, [account.id]: result }));
      setVisibleKeys((prev) => ({ ...prev, [account.id]: true }));
      toast(
        refresh ? `「${account.alias}」API Key 已从官方刷新` : `「${account.alias}」API Key 已获取`,
        "success"
      );
    } catch (err) {
      toast(`获取 Key 失败: ${(err as Error).message}`, "error");
    } finally {
      setKeyLoadingId(null);
    }
  };

  const handleCopyKey = async (account: AccountSummary, apiKey: string) => {
    try {
      await navigator.clipboard.writeText(apiKey);
      toast(`「${account.alias}」API Key 已复制`, "success");
    } catch {
      toast("复制失败，请手动选择 Key", "error");
    }
  };

  const handleClaim = async (account: AccountSummary) => {
    setClaimingId(account.id);
    try {
      const result = await api.claimReward(account.id);
      if (result.success) {
        toast(`「${account.alias}」${result.message}`, "success");
      } else {
        toast(`「${account.alias}」${result.message}`, "info");
      }
    } catch (err) {
      toast(`领取失败: ${(err as Error).message}`, "error");
    } finally {
      setClaimingId(null);
    }
  };

  const handleSync = async (account: AccountSummary) => {
    setSyncLoadingId(account.id);
    try {
      const result = await api.syncToSub2api(account.id);
      setSyncMap((prev) => ({ ...prev, [account.id]: result }));
      if (result.success) {
        toast(`「${account.alias}」${result.message}`, "success");
      } else {
        toast(`「${account.alias}」${result.message}`, "info");
      }
    } catch (err) {
      toast(`同步失败: ${(err as Error).message}`, "error");
    } finally {
      setSyncLoadingId(null);
    }
  };

  const handleDelete = async (account: AccountSummary) => {
    if (!confirm(`确定删除「${account.alias}」？这个操作没法撤销。`)) return;
    try {
      await onRemove(account.id);
      toast(`已删除「${account.alias}」`, "info");
    } catch (err) {
      toast(`删除失败: ${(err as Error).message}`, "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-24 text-paper-muted">
        <div className="h-4 w-4 animate-spin-slow rounded-full border-2 border-cinnabar border-t-transparent" />
        <span className="font-mono text-sm">正在拉取账号清单…</span>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-24 animate-fade-in">
        <div className="font-display text-3xl italic text-paper">
          还一个号都没添呢。
        </div>
        <p className="max-w-md text-sm leading-relaxed text-paper-muted">
          点左侧「导入 Cookie」，把浏览器里登录态的 Cookie 粘进来，
          工坊会无头验证一遍再加密落盘。大概十几秒的事。
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-ink-700/70 bg-ink-900/30">
      {/* 表头（桌面端） */}
      <div className="hidden grid-cols-[2.2fr_2.4fr_1.2fr_auto] gap-4 border-b border-ink-700/70 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-paper-faint md:grid">
        <span>账号</span>
        <span>邮箱 / 用户名</span>
        <span>最后验证</span>
        <span className="text-right">操作</span>
      </div>

      <div>
        {accounts.map((account, i) => {
          const usage = usageMap[account.id];
          const sync = syncMap[account.id];
          const keyResult = keyMap[account.id];
          return (
          <div
            key={account.id}
            style={{ animation: `rowIn 0.4s cubic-bezier(0.22,1,0.36,1) ${i * 45}ms both` }}
          >
            <div className="row-hover group grid grid-cols-1 gap-3 border-b border-ink-700/40 px-5 py-4 hover:bg-ink-850/50 hover:pl-[22px] md:grid-cols-[2.2fr_2.4fr_1.2fr_auto] md:items-center">
            {/* 账号 + 状态点 */}
            <div className="flex items-center gap-3">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  account.hasCookies ? "bg-sage" : "bg-rose"
                }`}
                title={account.hasCookies ? "Cookie 已存储" : "Cookie 缺失"}
              />
              {account.avatarUrl ? (
                <img
                  src={account.avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover ring-1 ring-ink-700"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 font-display text-sm font-semibold text-cinnabar ring-1 ring-ink-700">
                  {account.alias.charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-paper">
                  {account.alias}
                </div>
                {account.note && (
                  <div className="truncate text-xs text-paper-faint">
                    {account.note}
                  </div>
                )}
              </div>
            </div>

            {/* 邮箱 / 用户名（等宽，技术感） */}
            <div className="min-w-0 font-mono text-xs text-paper-muted">
              {account.email || account.username || (
                <span className="text-paper-faint italic">无邮箱</span>
              )}
              {account.invitedBy && (
                <span className="ml-2 rounded bg-cinnabar-soft px-1.5 py-0.5 text-[10px] text-cinnabar">
                  邀请注册
                </span>
              )}
            </div>

            {/* 最后验证（等宽） */}
            <div className="font-mono text-xs text-paper-faint">
              {relativeTime(account.lastVerifiedAt)}
            </div>

            {/* 操作图标组 */}
            <div className="flex items-center justify-start gap-1 md:justify-end">
              <button
                onClick={() => setDetailsAccount(account)}
                className="btn-icon hover:text-cinnabar"
                title="套餐与使用记录"
              >
                <IconRadar width={16} height={16} />
              </button>
              <button
                onClick={() => handleGetKey(account)}
                disabled={keyLoadingId === account.id}
                className="btn-icon group-hover:text-cinnabar disabled:opacity-40"
                title="获取 / 查看 API Key"
              >
                {keyLoadingId === account.id ? (
                  <div className="h-4 w-4 animate-spin-slow rounded-full border-2 border-cinnabar border-t-transparent" />
                ) : (
                  <IconKey width={16} height={16} />
                )}
              </button>
              <button
                onClick={() => handleClaim(account)}
                disabled={claimingId === account.id}
                className="btn-icon hover:text-amber disabled:opacity-40"
                title="领取邀请奖励"
              >
                {claimingId === account.id ? (
                  <div className="h-4 w-4 animate-spin-slow rounded-full border-2 border-amber border-t-transparent" />
                ) : (
                  <IconGift width={16} height={16} />
                )}
              </button>
              <button
                onClick={() => handleSync(account)}
                disabled={syncLoadingId === account.id}
                className="btn-icon hover:text-cinnabar disabled:opacity-40"
                title="同步到 sub2api"
              >
                {syncLoadingId === account.id ? (
                  <div className="h-4 w-4 animate-spin-slow rounded-full border-2 border-cinnabar border-t-transparent" />
                ) : (
                  <IconSync width={16} height={16} />
                )}
              </button>
              <button
                onClick={() => handleDelete(account)}
                className="btn-icon hover:text-rose"
                title="删除账号"
              >
                <IconTrash width={16} height={16} />
              </button>
            </div>
          </div>

          {keyResult && (
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-700/40 bg-ink-900/55 px-5 py-2.5 pl-[22px]">
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-paper-faint">
                API Key
              </span>
              <code className="min-w-0 flex-1 select-all truncate rounded-md border border-ink-700/60 bg-ink-950/50 px-2.5 py-1.5 font-mono text-[11px] text-paper">
                {visibleKeys[account.id]
                  ? keyResult.apiKey
                  : `${keyResult.apiKey.slice(0, 7)}${"•".repeat(24)}${keyResult.apiKey.slice(-4)}`}
              </code>
              <button
                onClick={() => setVisibleKeys((prev) => ({ ...prev, [account.id]: !prev[account.id] }))}
                className="btn-icon"
                title={visibleKeys[account.id] ? "隐藏 Key" : "显示 Key"}
              >
                {visibleKeys[account.id] ? <IconEyeOff width={15} height={15} /> : <IconEye width={15} height={15} />}
              </button>
              <button
                onClick={() => handleCopyKey(account, keyResult.apiKey)}
                className="btn-icon"
                title="复制 Key"
              >
                <IconCopy width={15} height={15} />
              </button>
              <button
                onClick={() => handleGetKey(account, true)}
                disabled={keyLoadingId === account.id}
                className="btn-icon disabled:opacity-40"
                title="从官方刷新 Key"
              >
                <IconRefresh width={15} height={15} />
              </button>
              <span className="font-mono text-[9px] text-paper-faint">
                {keyResult.source === "cache" ? "本机加密缓存" : "刚从官方获取"}
              </span>
            </div>
          )}

          {/* 额度展示条（常驻显示） */}
          <div
            className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-ink-700/40 bg-ink-900/40 px-5 py-2.5 pl-[22px]"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-paper-faint">
              剩余额度
            </span>
            {usageLoading && !usage ? (
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-paper-faint">
                <div className="h-3 w-3 animate-spin-slow rounded-full border border-sage border-t-transparent" />
                查询中…
              </span>
            ) : usage && usage.success && (usage.rolling || usage.weekly || usage.monthly) ? (
              <>
                {usage.rolling && <UsageBar label="滚动" window={usage.rolling} />}
                {usage.weekly && <UsageBar label="周" window={usage.weekly} />}
                {usage.monthly && <UsageBar label="月" window={usage.monthly} />}
              </>
            ) : usage && !usage.success ? (
              <span className="font-mono text-[10px] text-rose/70">
                {usage.message}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-paper-faint">
                —
              </span>
            )}
          </div>

          {/* sub2api 同步状态 */}
          {sync && sync.success && (
            <div
              className="flex items-center gap-2 border-b border-ink-700/40 bg-ink-900/30 px-5 py-1.5 pl-[22px]"
              style={{ animation: "rowIn 0.3s ease-out both" }}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-paper-faint">
                sub2api
              </span>
              <span className="rounded bg-cinnabar-soft px-1.5 py-0.5 font-mono text-[10px] text-cinnabar">
                {sync.sub2apiName || `ID:${sync.sub2apiId}`}
              </span>
              <span className="font-mono text-[9px] text-paper-faint truncate max-w-[280px]">
                {sync.apiKey?.substring(0, 12)}…
              </span>
            </div>
          )}
          </div>
          );
        })}
      </div>
      {detailsAccount && (
        <AccountDetailsPanel
          account={detailsAccount}
          onClose={() => setDetailsAccount(null)}
        />
      )}
    </div>
  );
}
