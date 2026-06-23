// ============================================================
// InviteChainPanel — 邀请链接生成 + 展示 + 注册监控面板
// 选账号 → 生成邀请链接 → 展示供复制
// 点击「注册监控」打开干净浏览器，后台监控邮箱/密码/Cookie
// ============================================================

import { useState, useEffect, useRef } from "react";
import type { AccountSummary, InviteLinkResult } from "../types";
import { useToast } from "./Toast";
import * as api from "../api/client";
import { IconClose, IconChain, IconCheck, IconRadar, IconRefresh } from "./icons";

interface Props {
  accounts: AccountSummary[];
  onClose: () => void;
  onAccountCreated?: () => void;
}

interface LinkRow extends InviteLinkResult {
  loading?: boolean;
  error?: string;
  // 注册监控状态
  monitorId?: string;
  monitorStatus?: "monitoring" | "completed" | "failed" | "timeout";
  monitorEmail?: string;
  monitorPassword?: string;
  newAccountAlias?: string;
  monitorError?: string;
}

export default function InviteChainPanel({
  accounts,
  onClose,
  onAccountCreated,
}: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [rows, setRows] = useState<LinkRow[]>([]);
  const { toast } = useToast();

  // 用 ref 让轮询回调始终读到最新 rows
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const handleGenerate = async () => {
    if (!selectedId) {
      toast("先挑一个账号", "error");
      return;
    }
    const account = accounts.find((a) => a.id === selectedId);
    if (!account) return;

    setGenerating(true);
    const tempRow: LinkRow = {
      accountId: account.id,
      alias: account.alias,
      inviteLink: "",
      loading: true,
    };
    setRows((prev) => [tempRow, ...prev]);

    try {
      const result = await api.generateInviteLink(account.id);
      setRows((prev) =>
        prev.map((r) =>
          r.accountId === result.accountId && r.loading
            ? { ...result, loading: false }
            : r
        )
      );
      toast(`「${account.alias}」的邀请链接已生成`, "success");
    } catch (err) {
      const msg = (err as Error).message;
      setRows((prev) =>
        prev.map((r) =>
          r.accountId === account.id && r.loading
            ? { ...r, loading: false, error: msg }
            : r
        )
      );
      toast(`生成失败: ${msg}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast("链接已复制到剪贴板", "info");
    } catch {
      toast("复制失败，请手动选中复制", "error");
    }
  };

  const handleStartMonitor = async (row: LinkRow, index: number) => {
    try {
      const { monitorId } = await api.startRegistration(
        row.inviteLink,
        row.accountId
      );
      setRows((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                monitorId,
                monitorStatus: "monitoring",
                monitorEmail: "",
                monitorPassword: "",
                newAccountAlias: undefined,
                monitorError: undefined,
              }
            : r
        )
      );
      toast("已打开干净浏览器，后台监控中…", "info");
    } catch (err) {
      toast(`启动监控失败: ${(err as Error).message}`, "error");
    }
  };

  const handleRetryCapture = async (row: LinkRow, index: number) => {
    if (!row.monitorId) return;
    setRows((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, monitorStatus: "monitoring", monitorError: undefined } : r
      )
    );
    try {
      const status = await api.retryCapture(row.monitorId);
      setRows((prev) =>
        prev.map((r, i) =>
          i === index
            ? {
                ...r,
                monitorStatus: status.status,
                monitorEmail: status.email,
                monitorPassword: status.password,
                newAccountAlias: status.newAccountAlias ?? undefined,
                monitorError: status.error ?? undefined,
              }
            : r
        )
      );
      if (status.status === "completed") {
        toast(`抓取成功！新账号「${status.newAccountAlias}」已导入`, "success");
        onAccountCreated?.();
      }
    } catch (err) {
      const msg = (err as Error).message;
      setRows((prev) =>
        prev.map((r, i) =>
          i === index ? { ...r, monitorStatus: "failed", monitorError: msg } : r
        )
      );
      toast(`抓取失败: ${msg}`, "error");
    }
  };

  // 轮询活跃的监控器
  useEffect(() => {
    const hasActive = rows.some((r) => r.monitorStatus === "monitoring");
    if (!hasActive) return;

    const interval = setInterval(async () => {
      const activeRows = rowsRef.current.filter(
        (r) => r.monitorStatus === "monitoring" && r.monitorId
      );
      if (activeRows.length === 0) return;

      for (const row of activeRows) {
        if (!row.monitorId) continue;
        try {
          const status = await api.getRegistrationStatus(row.monitorId);
          setRows((prev) =>
            prev.map((r) => {
              if (r.monitorId !== row.monitorId) return r;
              return {
                ...r,
                monitorStatus: status.status,
                monitorEmail: status.email,
                monitorPassword: status.password,
                newAccountAlias: status.newAccountAlias ?? undefined,
                monitorError: status.error ?? undefined,
              };
            })
          );
          if (status.status === "completed") {
            toast(
              `注册成功！新账号「${status.newAccountAlias}」已自动导入`,
              "success"
            );
            onAccountCreated?.();
          } else if (status.status === "failed" || status.status === "timeout") {
            toast(`监控结束: ${status.error}`, "error");
          }
        } catch {
          // 轮询网络错误静默忽略
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [rows, toast, onAccountCreated]);

  const handleRemoveRow = (accountId: string) => {
    setRows((prev) => prev.filter((r) => r.accountId !== accountId));
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative flex h-full w-full max-w-xl animate-slide-in-right flex-col border-l border-ink-700 bg-ink-900 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-ink-700 px-6 py-5">
          <div className="flex items-center gap-3">
            <IconChain width={22} height={22} className="text-cinnabar" />
            <div>
              <h2 className="font-display text-xl text-paper">邀请链接</h2>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-paper-faint">
                生成 · 复制 · 注册监控
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon">
            <IconClose width={18} height={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* 配置区 */}
          <div className="flex flex-col gap-5 animate-fade-in">
            <div>
              <label className="label">选择账号（用它的登录态抓邀请链接）</label>
              <div className="flex gap-2">
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="field flex-1"
                  disabled={generating}
                >
                  <option value="">— 挑一个 —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.alias}
                      {a.email ? ` (${a.email})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleGenerate}
                  disabled={!selectedId || generating}
                  className="btn-primary whitespace-nowrap"
                >
                  <IconChain width={15} height={15} />
                  {generating ? "生成中…" : "生成链接"}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-ink-700 bg-ink-850/60 px-4 py-3 text-xs leading-relaxed text-paper-muted">
              生成需要用该账号的 Cookie 登录后访问邀请页，约 10–15 秒。
              拿到链接后点击「注册监控」会打开无 Cookie 的干净浏览器，
              后台自动监控邮箱密码，注册成功后抓取 Cookie 自动导入。
            </div>
          </div>

          {/* 链接列表 */}
          {rows.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-paper-faint">
                已生成 · {rows.length}
              </div>
              <div className="flex flex-col gap-2">
                {rows.map((row, i) => (
                  <div
                    key={`${row.accountId}-${i}`}
                    className="row-hover rounded-lg border border-ink-700 bg-ink-850/50 px-4 py-3 animate-row-in"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-paper">
                        {row.alias}
                      </span>
                      <div className="flex items-center gap-1">
                        {row.loading ? (
                          <span className="font-mono text-[11px] text-paper-faint">
                            抓取中…
                          </span>
                        ) : row.error ? (
                          <span className="font-mono text-[11px] text-rose">
                            失败
                          </span>
                        ) : row.monitorStatus === "monitoring" ? (
                          <span className="flex items-center gap-1 font-mono text-[11px] text-amber">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
                            监控中
                          </span>
                        ) : row.monitorStatus === "completed" ? (
                          <span className="flex items-center gap-1 font-mono text-[11px] text-sage">
                            <IconCheck width={12} height={12} />
                            已导入
                          </span>
                        ) : row.monitorStatus === "failed" ||
                          row.monitorStatus === "timeout" ? (
                          <span className="font-mono text-[11px] text-rose">
                            监控结束
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-mono text-[11px] text-sage">
                            <IconCheck width={12} height={12} />
                            就绪
                          </span>
                        )}
                        {!row.loading && (
                          <button
                            onClick={() => handleRemoveRow(row.accountId)}
                            className="btn-icon h-6 w-6"
                            title="移除"
                          >
                            <IconClose width={14} height={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {row.error ? (
                      <div className="mt-1.5 text-xs text-rose">{row.error}</div>
                    ) : row.loading ? (
                      <div className="mt-1.5 h-4 w-3/4 animate-pulse rounded bg-ink-700/60" />
                    ) : (
                      <>
                        <div className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-paper-muted">
                          {row.inviteLink}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => handleCopy(row.inviteLink)}
                            className="btn-ghost px-2.5 py-1 text-xs"
                          >
                            复制
                          </button>
                          <button
                            onClick={() => handleStartMonitor(row, i)}
                            disabled={row.monitorStatus === "monitoring"}
                            className="btn-ghost px-2.5 py-1 text-xs"
                          >
                            <IconRadar width={13} height={13} />
                            {row.monitorStatus === "monitoring"
                              ? "监控中…"
                              : "注册监控"}
                          </button>
                        </div>

                        {/* 监控状态详情 */}
                        {row.monitorStatus === "monitoring" && (
                          <div className="mt-2.5 rounded border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] leading-relaxed">
                            <div className="flex items-center gap-1.5 text-amber">
                              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber" />
                              正在监控注册流程…
                            </div>
                            {row.monitorEmail && (
                              <div className="mt-1 font-mono text-paper-muted">
                                已捕获邮箱: {row.monitorEmail}
                              </div>
                            )}
                            {row.monitorPassword && (
                              <div className="font-mono text-paper-muted">
                                已捕获密码: {"•".repeat(row.monitorPassword.length)}
                              </div>
                            )}
                          </div>
                        )}

                        {row.monitorStatus === "completed" && (
                          <div className="mt-2.5 rounded border border-sage/30 bg-sage/5 px-3 py-2 text-[11px] leading-relaxed">
                            <div className="flex items-center gap-1.5 text-sage">
                              <IconCheck width={12} height={12} />
                              注册成功！新账号「{row.newAccountAlias}」已自动导入
                            </div>
                            {row.monitorEmail && (
                              <div className="mt-1 font-mono text-paper-muted">
                                邮箱: {row.monitorEmail}
                              </div>
                            )}
                            {row.monitorPassword && (
                              <div className="font-mono text-paper-muted">
                                密码: {row.monitorPassword}
                              </div>
                            )}
                          </div>
                        )}

                        {(row.monitorStatus === "failed" ||
                          row.monitorStatus === "timeout") &&
                          row.monitorError && (
                            <div className="mt-2.5 rounded border border-rose/30 bg-rose/5 px-3 py-2 text-[11px] leading-relaxed text-rose">
                              {row.monitorError}
                              <button
                                onClick={() => handleRetryCapture(row, i)}
                                className="btn-ghost mt-2 px-2.5 py-1 text-xs"
                              >
                                <IconRefresh width={13} height={13} />
                                立即抓取 Cookie
                              </button>
                            </div>
                          )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-end border-t border-ink-700 px-6 py-4">
          <button onClick={onClose} className="btn-ghost justify-center">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
