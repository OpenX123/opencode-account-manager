import { useCallback, useEffect, useState } from "react";
import type { AccountSummary } from "../types";
import * as api from "../api/client";
import type { AccountInsights, InsightUsageWindow } from "../api/client";
import { IconClose, IconRefresh } from "./icons";
import { useToast } from "./Toast";

interface Props {
  account: AccountSummary;
  onClose: () => void;
}

const number = new Intl.NumberFormat("zh-CN");

function formatDuration(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const parts = [];
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小时`);
  if (minutes || parts.length === 0) parts.push(`${minutes} 分钟`);
  return parts.slice(0, 2).join(" ");
}

function formatDate(value: number | string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCost(microCents: number): string {
  return `$${(microCents / 100_000_000).toFixed(4)}`;
}

function WindowCard({ label, value }: { label: string; value?: InsightUsageWindow }) {
  if (!value) return null;
  const color =
    value.usagePercent > 80 ? "bg-rose" : value.usagePercent > 50 ? "bg-amber" : "bg-sage";
  return (
    <div className="rounded-lg border border-ink-700/70 bg-ink-850/50 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-faint">{label}</span>
        <span className="font-display text-xl text-paper">{value.remainingPercent.toFixed(0)}%</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-700/60">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value.usagePercent}%` }} />
      </div>
      <div className="mt-3 text-xs text-paper-muted">
        <div>剩余 {formatDuration(value.resetInSec)}</div>
        <div className="mt-1 font-mono text-[10px] text-paper-faint">{formatDate(value.resetAt)} 重置</div>
      </div>
    </div>
  );
}

export default function AccountDetailsPanel({ account, onClose }: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<AccountInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.getAccountInsights(account.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [account.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const subscribe = async () => {
    setAction("subscribe");
    try {
      await api.openBillingPage(account.id);
      toast("Go 付款页已打开，付款完成后刷新套餐状态", "success");
    } catch (err) {
      toast(`打开付款页失败: ${(err as Error).message}`, "error");
    } finally {
      setAction(null);
    }
  };

  const enableSetting = async (
    setting: "useBalance" | "useChinaProviders",
    label: string
  ) => {
    setAction(setting);
    try {
      await api.enableGoSetting(account.id, setting);
      setData((current) => current
        ? { ...current, plan: { ...current.plan, [setting]: true } }
        : current);
      toast(`已开启“${label}”`, "success");
    } catch (err) {
      toast(`开启失败: ${(err as Error).message}`, "error");
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-5xl flex-col border-l border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 bg-cinnabar-soft/30 px-6 py-5">
          <div>
            <h2 className="font-display text-xl text-paper">{account.alias} · 套餐与使用详情</h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-paper-faint">
              OpenCode 官方套餐与使用数据
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} disabled={loading} className="btn-icon" title="刷新详情">
              <IconRefresh width={17} height={17} className={loading ? "animate-spin-slow" : ""} />
            </button>
            <button onClick={onClose} className="btn-icon"><IconClose width={18} height={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading && !data && (
            <div className="flex items-center gap-3 py-24 text-paper-muted">
              <div className="h-4 w-4 animate-spin-slow rounded-full border-2 border-cinnabar border-t-transparent" />
              正在读取官方套餐和使用记录…
            </div>
          )}
          {error && <div className="rounded-lg border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">{error}</div>}
          {data && (
            <div className="space-y-7">
              <section>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-ink-700/70 bg-ink-850/50 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-faint">当前套餐</div>
                    <div className="mt-2 font-display text-2xl text-cinnabar">{data.plan.name}</div>
                    <div className="mt-1 text-xs text-paper-muted">
                      {data.plan.status === "active" ? "订阅有效" : "未检测到有效订阅"}
                      {data.plan.region ? ` · ${data.plan.region}` : ""}
                    </div>
                    {data.plan.status !== "active" && (
                      <button
                        onClick={() => void subscribe()}
                        disabled={action !== null}
                        className="btn-primary mt-3 w-full justify-center px-3 py-1.5 text-xs"
                      >
                        {action === "subscribe" ? "正在打开…" : "订阅 OpenCode Go"}
                      </button>
                    )}
                  </div>
                  <div className="rounded-lg border border-ink-700/70 bg-ink-850/50 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-faint">Zen 余额</div>
                    <div className="mt-2 font-display text-2xl text-paper">${data.billing.balance.toFixed(2)}</div>
                    <div className="mt-1 text-xs text-paper-muted">Go 超额使用余额：{data.plan.useBalance === null ? "未知" : data.plan.useBalance ? "已启用" : "未启用"}</div>
                  </div>
                  <div className="rounded-lg border border-ink-700/70 bg-ink-850/50 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-faint">官方记录数</div>
                    <div className="mt-2 font-display text-2xl text-paper">{data.summary.requests}</div>
                    <div className="mt-1 text-xs text-paper-muted">当前 usage.list 返回范围</div>
                  </div>
                  <div className="rounded-lg border border-ink-700/70 bg-ink-850/50 p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-faint">记录成本</div>
                    <div className="mt-2 font-display text-2xl text-paper">{formatCost(data.summary.costMicroCents)}</div>
                    <div className="mt-1 text-xs text-paper-muted">官方 microcents 汇总</div>
                  </div>
                </div>
                <div className="mt-3 rounded-lg border border-amber/25 bg-amber/5 px-4 py-3 text-xs leading-relaxed text-paper-muted">
                  {data.plan.renewalAt
                    ? `下一周期：${formatDate(data.plan.renewalAt)}`
                    : data.plan.renewalNote}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {([
                    ["useBalance", "达到限额后使用 Zen 余额", data.plan.useBalance],
                    ["useChinaProviders", "启用部署在中国的模型", data.plan.useChinaProviders],
                  ] as const).map(([setting, label, enabled]) => (
                    <div key={setting} className="flex items-center justify-between gap-4 rounded-lg border border-ink-700/70 bg-ink-850/50 px-4 py-3">
                      <div>
                        <div className="text-sm text-paper">{label}</div>
                        <div className={`mt-1 text-xs ${enabled ? "text-sage" : "text-paper-muted"}`}>
                          {enabled === null ? "状态未知" : enabled ? "已开启" : "未开启"}
                        </div>
                      </div>
                      <button
                        onClick={() => void enableSetting(setting, label)}
                        disabled={data.plan.status !== "active" || enabled === true || action !== null}
                        className="btn-ghost shrink-0 px-3 py-1.5 text-xs"
                        title={data.plan.status !== "active" ? "请先订阅 OpenCode Go" : undefined}
                      >
                        {action === setting ? "开启中…" : enabled ? "已开启" : "开启"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-3 font-display text-lg text-paper">额度与精确重置时间</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <WindowCard label="5 小时滚动额度" value={data.windows.rolling} />
                  <WindowCard label="每周额度" value={data.windows.weekly} />
                  <WindowCard label="每月额度" value={data.windows.monthly} />
                </div>
              </section>

              <section>
                <h3 className="mb-3 font-display text-lg text-paper">Token 汇总</h3>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                  {[
                    ["输入", data.summary.inputTokens],
                    ["输出", data.summary.outputTokens],
                    ["推理", data.summary.reasoningTokens],
                    ["缓存读取", data.summary.cacheReadTokens],
                    ["缓存写入", data.summary.cacheWriteTokens],
                    ["总 Token", data.summary.inputTokens + data.summary.outputTokens + data.summary.reasoningTokens],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-ink-700/60 px-3 py-3">
                      <div className="font-mono text-[9px] text-paper-faint">{label}</div>
                      <div className="mt-1 font-mono text-sm text-paper">{number.format(Number(value))}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-3 font-display text-lg text-paper">模型用量</h3>
                <div className="overflow-hidden rounded-lg border border-ink-700/70">
                  {data.summary.models.map((model) => (
                    <div key={`${model.provider}/${model.model}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-ink-700/50 px-4 py-3 text-xs last:border-b-0">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-paper">{model.model}</div>
                        <div className="truncate font-mono text-[9px] text-paper-faint">{model.provider}</div>
                      </div>
                      <div className="font-mono text-paper-muted">{model.requests} 次</div>
                      <div className="font-mono text-paper-muted">{number.format(model.tokens)} tokens</div>
                      <div className="font-mono text-cinnabar">{formatCost(model.costMicroCents)}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <h3 className="font-display text-lg text-paper">使用记录</h3>
                  <span className="font-mono text-[9px] text-paper-faint">更新于 {formatDate(data.fetchedAt)}</span>
                </div>
                <div className="max-h-[520px] overflow-auto rounded-lg border border-ink-700/70">
                  <table className="w-full min-w-[980px] border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-ink-850 text-paper-faint">
                      <tr className="font-mono text-[9px] uppercase tracking-[0.12em]">
                        <th className="px-3 py-3">时间</th><th className="px-3 py-3">模型 / Provider</th>
                        <th className="px-3 py-3 text-right">输入</th><th className="px-3 py-3 text-right">输出</th>
                        <th className="px-3 py-3 text-right">推理</th><th className="px-3 py-3 text-right">缓存读</th>
                        <th className="px-3 py-3 text-right">缓存写</th><th className="px-3 py-3 text-right">成本</th><th className="px-3 py-3">套餐</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.records.map((record) => (
                        <tr key={record.id} className="border-t border-ink-700/45 hover:bg-ink-850/50">
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[10px] text-paper-muted">{formatDate(record.timeCreated)}</td>
                          <td className="px-3 py-2.5"><div className="font-mono text-paper">{record.model}</div><div className="font-mono text-[9px] text-paper-faint">{record.provider}</div></td>
                          <td className="px-3 py-2.5 text-right font-mono">{number.format(record.inputTokens)}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{number.format(record.outputTokens)}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{number.format(record.reasoningTokens ?? 0)}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{number.format(record.cacheReadTokens ?? 0)}</td>
                          <td className="px-3 py-2.5 text-right font-mono">{number.format((record.cacheWrite5mTokens ?? 0) + (record.cacheWrite1hTokens ?? 0))}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-cinnabar">{formatCost(record.costMicroCents)}</td>
                          <td className="px-3 py-2.5 font-mono text-paper-muted">{record.plan || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
