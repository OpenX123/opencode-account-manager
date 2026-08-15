import { useState } from "react";
import { mergeAccounts } from "../api/client";
import { IconClose, IconSync } from "./icons";
import { useToast } from "./Toast";

export default function AccountMergePanel({ onClose, onMerged }: {
  onClose: () => void;
  onMerged: () => Promise<void>;
}) {
  const [accountsFile, setAccountsFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleMerge() {
    if (!accountsFile) return;
    setLoading(true);
    try {
      const accounts = JSON.parse(await accountsFile.text()) as unknown;
      const sourceKey = keyFile ? (await keyFile.text()).trim() : "";
      const result = await mergeAccounts(accounts, sourceKey);
      await onMerged();
      toast(`合并完成：新增 ${result.added}，更新 ${result.updated}，跳过 ${result.skipped}，失败 ${result.failed}`, result.failed ? "info" : "success");
      onClose();
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-paper">合并本地账号</h2>
          <button onClick={onClose} className="btn-icon" aria-label="关闭"><IconClose /></button>
        </div>
        <p className="mb-4 text-sm leading-6 text-paper-muted">
          选择本地应用数据目录中的 <code>data/accounts.json</code> 和上一级目录的 <code>cookie.key</code>。文件只用于本次合并，Cookie 会用远端密钥重新加密。
        </p>
        <label className="mb-4 block text-xs text-paper-muted">
          账号文件
          <input type="file" accept=".json,application/json" onChange={(event) => setAccountsFile(event.target.files?.[0] || null)} className="field mt-2" />
        </label>
        <label className="mb-5 block text-xs text-paper-muted">
          本地密钥文件（开发模式可留空）
          <input type="file" accept=".key,text/plain" onChange={(event) => setKeyFile(event.target.files?.[0] || null)} className="field mt-2" />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button onClick={handleMerge} disabled={!accountsFile || loading} className="btn-primary">
            <IconSync width={15} height={15} />
            {loading ? "合并中…" : "开始合并"}
          </button>
        </div>
      </div>
    </div>
  );
}
