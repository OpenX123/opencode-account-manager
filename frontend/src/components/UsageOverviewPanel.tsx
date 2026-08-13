import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api/client";
import type { AccountInsightsBatchItem } from "../api/client";
import { IconClose, IconRefresh } from "./icons";
import {
  collectOverviewRecords,
  filterOverviewRecords,
  summarizeOverview,
  type OverviewFilters,
} from "./usage-overview";

interface Props {
  onClose: () => void;
}

const number = new Intl.NumberFormat("zh-CN");
const initialFilters: OverviewFilters = { accountId: "", model: "", from: "", to: "" };

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatCost(microCents: number): string {
  return `$${(microCents / 100_000_000).toFixed(4)}`;
}

export default function UsageOverviewPanel({ onClose }: Props) {
  const [items, setItems] = useState<AccountInsightsBatchItem[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      setItems((await api.getAllAccountInsights(refresh)).results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const records = useMemo(() => collectOverviewRecords(items), [items]);
  const filtered = useMemo(() => filterOverviewRecords(records, filters), [records, filters]);
  const summary = useMemo(() => summarizeOverview(filtered), [filtered]);
  const models = useMemo(() => [...new Set(records.map((record) => record.model))].sort(), [records]);
  const failures = items.filter((item) => item.error);

  const setFilter = (key: keyof OverviewFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="关闭总使用记录" />
      <div className="relative flex h-full w-full max-w-[1500px] flex-col border-l border-ink-700 bg-ink-900 shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-ink-700 bg-cinnabar-soft/30 px-5 py-4 md:px-7">
          <div>
            <h2 className="font-display text-xl text-paper">全部账号 · 使用记录</h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-paper-faint">OpenCode official usage.list</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load(true)} disabled={loading} className="btn-icon" title="刷新全部记录">
              <IconRefresh width={17} height={17} className={loading ? "animate-spin-slow" : ""} />
            </button>
            <button onClick={onClose} className="btn-icon" aria-label="关闭"><IconClose width={18} height={18} /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-7">
          <section className="rounded-xl border border-ink-700/70 bg-ink-850/35 p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label><span className="label">开始时间</span><input type="datetime-local" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} className="field" /></label>
              <label><span className="label">结束时间</span><input type="datetime-local" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} className="field" /></label>
              <label>
                <span className="label">账号</span>
                <select value={filters.accountId} onChange={(event) => setFilter("accountId", event.target.value)} className="field">
                  <option value="">全部账号</option>
                  {items.map((item) => <option key={item.accountId} value={item.accountId}>{item.alias}</option>)}
                </select>
              </label>
              <label>
                <span className="label">模型</span>
                <select value={filters.model} onChange={(event) => setFilter("model", event.target.value)} className="field">
                  <option value="">全部模型</option>
                  {models.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {[
                ["请求", number.format(summary.requests)],
                ["Tokens", number.format(summary.tokens)],
                ["缓存", number.format(summary.cacheTokens)],
                ["成本", formatCost(summary.costMicroCents)],
              ].map(([label, value]) => (
                <span key={label} className="rounded-full border border-ink-700/70 bg-ink-900 px-3 py-1.5 font-mono text-[10px] text-paper-muted">
                  <span className="mr-1 text-paper-faint">{label}</span>{value}
                </span>
              ))}
              <button onClick={() => setFilters(initialFilters)} className="btn-ghost ml-auto px-3 py-1.5 text-xs">重置筛选</button>
            </div>
          </section>

          {loading && items.length === 0 && (
            <div className="flex items-center gap-3 py-24 text-paper-muted">
              <div className="h-4 w-4 animate-spin-slow rounded-full border-2 border-cinnabar border-t-transparent" />
              正在逐个读取全部账号的官方使用记录…
            </div>
          )}
          {error && <div className="mt-4 rounded-lg border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">加载失败：{error}</div>}
          {failures.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber/30 bg-amber/5 px-4 py-3 text-xs text-paper-muted">
              {failures.length} 个账号读取失败，其余账号结果已保留。
            </div>
          )}

          {!loading && !error && (
            <section className="mt-5 overflow-hidden rounded-xl border border-ink-700/70">
              <div className="overflow-auto">
                <table className="w-full min-w-[1180px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-ink-850 text-paper-faint">
                    <tr className="font-mono text-[9px] uppercase tracking-[0.12em]">
                      <th className="px-3 py-3">时间</th><th className="px-3 py-3">账号</th><th className="px-3 py-3">模型 / Provider</th>
                      <th className="px-3 py-3 text-right">输入</th><th className="px-3 py-3 text-right">输出</th><th className="px-3 py-3 text-right">推理</th>
                      <th className="px-3 py-3 text-right">缓存读</th><th className="px-3 py-3 text-right">缓存写</th><th className="px-3 py-3 text-right">总 Tokens</th>
                      <th className="px-3 py-3 text-right">成本</th><th className="px-3 py-3">套餐</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((record) => {
                      const cacheWrite = (record.cacheWrite5mTokens ?? 0) + (record.cacheWrite1hTokens ?? 0);
                      const totalTokens = record.inputTokens + record.outputTokens + (record.reasoningTokens ?? 0);
                      return (
                        <tr key={`${record.accountId}:${record.id}`} className="border-t border-ink-700/45 hover:bg-ink-850/55">
                          <td className="whitespace-nowrap px-3 py-3 font-mono text-[10px] text-paper-muted">{formatDate(record.timeCreated)}</td>
                          <td className="max-w-44 truncate px-3 py-3 font-mono text-paper">{record.accountAlias}</td>
                          <td className="px-3 py-3"><div className="font-mono text-paper">{record.model}</div><div className="font-mono text-[9px] text-paper-faint">{record.provider}</div></td>
                          <td className="px-3 py-3 text-right font-mono">{number.format(record.inputTokens)}</td>
                          <td className="px-3 py-3 text-right font-mono">{number.format(record.outputTokens)}</td>
                          <td className="px-3 py-3 text-right font-mono">{number.format(record.reasoningTokens ?? 0)}</td>
                          <td className="px-3 py-3 text-right font-mono">{number.format(record.cacheReadTokens ?? 0)}</td>
                          <td className="px-3 py-3 text-right font-mono">{number.format(cacheWrite)}</td>
                          <td className="px-3 py-3 text-right font-mono text-paper">{number.format(totalTokens)}</td>
                          <td className="px-3 py-3 text-right font-mono text-cinnabar">{formatCost(record.costMicroCents)}</td>
                          <td className="px-3 py-3 font-mono text-paper-muted">{record.plan || record.planName || "—"}</td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && <tr><td colSpan={11} className="px-4 py-16 text-center text-paper-faint">当前筛选范围内没有使用记录</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-ink-700/60 px-4 py-3 font-mono text-[9px] text-paper-faint">
                共 {filtered.length} 条 · 数据范围由各账号当前官方 usage.list 响应决定
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
