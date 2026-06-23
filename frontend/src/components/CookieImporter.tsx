// ============================================================
// CookieImporter — 右侧滑出面板
// ============================================================

import { useState } from "react";
import { useToast } from "./Toast";
import { IconClose, IconUpload } from "./icons";
import type { AccountSummary } from "../types";

interface Props {
  onImport: (cookies: string, alias?: string) => Promise<AccountSummary>;
  onClose: () => void;
}

export default function CookieImporter({ onImport, onClose }: Props) {
  const [cookies, setCookies] = useState("");
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleImport = async () => {
    if (!cookies.trim()) {
      toast("先把 Cookie 粘进来", "error");
      return;
    }
    setLoading(true);
    try {
      const account = await onImport(
        cookies.trim(),
        alias.trim() || undefined
      );
      toast(
        `导入成功：${account.username || account.email || account.alias}`,
        "success"
      );
      onClose();
    } catch (err) {
      toast(`导入失败: ${(err as Error).message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 面板 */}
      <div className="relative flex h-full w-full max-w-xl animate-slide-in-right flex-col border-l border-ink-700 bg-ink-900 shadow-2xl">
        {/* 头部：朱砂底色条 */}
        <div className="flex items-center justify-between border-b border-ink-700 bg-cinnabar-soft/30 px-6 py-5">
          <div>
            <h2 className="font-display text-xl text-paper">
              导入 Cookie
            </h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-paper-faint">
              无头验证 · 加密落盘
            </p>
          </div>
          <button onClick={onClose} className="btn-icon" disabled={loading}>
            <IconClose width={18} height={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <label className="label">账号别名（可选）</label>
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="比如：主号、跑量号"
            className="field mb-5"
          />

          <label className="label">
            Cookie 数据 <span className="text-cinnabar">*</span>
          </label>
          <textarea
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            placeholder={`粘浏览器导出的 Cookie JSON 数组：\n[\n  {"name":"session_token","value":"abc…","domain":".opencode.ai"},\n  {"name":"auth","value":"xyz…","domain":"opencode.ai"}\n]\n\n也认 Netscape 格式 / "k=v; k=v" 字符串`}
            rows={13}
            className="field resize-y font-mono text-xs leading-relaxed"
          />

          <div className="mt-4 rounded-lg border border-ink-700 bg-ink-850/60 px-4 py-3 text-xs leading-relaxed text-paper-muted">
            <span className="font-semibold text-paper">怎么拿：</span>
            打开 opencode.ai 登录 → F12 → Application → Cookies →
            全选右键 Copy → 粘这儿。越新鲜越好使。
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex gap-3 border-t border-ink-700 px-6 py-4">
          <button onClick={onClose} disabled={loading} className="btn-ghost flex-1 justify-center">
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !cookies.trim()}
            className="btn-primary flex-1 justify-center"
          >
            <IconUpload width={15} height={15} />
            {loading ? "验证中…" : "导入并验证"}
          </button>
        </div>
      </div>
    </div>
  );
}
