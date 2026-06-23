// ============================================================
// SettingsPanel — sub2api 等配置滑出面板
// ============================================================

import { useState, useEffect } from "react";
import { useToast } from "./Toast";
import { IconClose, IconKey } from "./icons";
import * as api from "../api/client";
import type { AppSettings, Sub2ApiSettings } from "../types";

interface Props {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((err) => toast(`加载配置失败: ${err.message}`, "error"))
      .finally(() => setLoading(false));
  }, []);

  const update = (field: keyof Sub2ApiSettings, value: string | number) => {
    if (!settings) return;
    setSettings({
      sub2api: { ...settings.sub2api, [field]: value },
    });
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.saveSettings(settings);
      toast("配置已保存", "success");
    } catch (err) {
      toast(`保存失败: ${(err as Error).message}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!settings) return;
    setTesting(true);
    try {
      const result = await api.testSub2api();
      if (result.success) {
        toast("SSH 连通正常", "success");
      } else {
        toast(`连接失败: ${result.message}`, "error");
      }
    } catch (err) {
      toast(`测试失败: ${(err as Error).message}`, "error");
    } finally {
      setTesting(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
        <div className="font-mono text-sm text-paper-muted">加载中…</div>
      </div>
    );
  }

  const s = settings.sub2api;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative flex h-full w-full max-w-xl animate-slide-in-right flex-col border-l border-ink-700 bg-ink-900 shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-ink-700 bg-cinnabar-soft/30 px-6 py-5">
          <div>
            <h2 className="font-display text-xl text-paper">sub2api 配置</h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-paper-faint">
              SSH 远程数据库 · 账号同步
            </p>
          </div>
          <button onClick={onClose} className="btn-icon">
            <IconClose width={18} height={18} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* SSH 分组 */}
          <div className="mb-6">
            <div className="mb-3 font-display text-sm font-semibold text-cinnabar">
              SSH 连接
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">主机地址</label>
                <input
                  type="text"
                  value={s.sshHost}
                  onChange={(e) => update("sshHost", e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">端口</label>
                <input
                  type="text"
                  value={s.sshPort}
                  onChange={(e) => update("sshPort", e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">用户名</label>
                <input
                  type="text"
                  value={s.sshUser}
                  onChange={(e) => update("sshUser", e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">私钥路径</label>
                <input
                  type="text"
                  value={s.sshKey}
                  onChange={(e) => update("sshKey", e.target.value)}
                  className="field font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* 数据库分组 */}
          <div className="mb-6">
            <div className="mb-3 font-display text-sm font-semibold text-cinnabar">
              PostgreSQL（Docker）
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">容器名</label>
                <input
                  type="text"
                  value={s.dockerContainer}
                  onChange={(e) => update("dockerContainer", e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">数据库名</label>
                <input
                  type="text"
                  value={s.dbName}
                  onChange={(e) => update("dbName", e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">DB 用户名</label>
                <input
                  type="text"
                  value={s.dbUser}
                  onChange={(e) => update("dbUser", e.target.value)}
                  className="field"
                />
              </div>
            </div>
          </div>

          {/* 业务分组 */}
          <div className="mb-6">
            <div className="mb-3 font-display text-sm font-semibold text-cinnabar">
              分组 & 账号属性
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">分组 ID</label>
                <input
                  type="number"
                  value={s.groupId}
                  onChange={(e) => update("groupId", parseInt(e.target.value) || 0)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">分组名称</label>
                <input
                  type="text"
                  value={s.groupName}
                  onChange={(e) => update("groupName", e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">平台标识</label>
                <input
                  type="text"
                  value={s.platform}
                  onChange={(e) => update("platform", e.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">Base URL</label>
                <input
                  type="text"
                  value={s.baseUrl}
                  onChange={(e) => update("baseUrl", e.target.value)}
                  className="field font-mono text-xs"
                />
              </div>
              <div>
                <label className="label">并发数</label>
                <input
                  type="number"
                  value={s.defaultConcurrency}
                  onChange={(e) => update("defaultConcurrency", parseInt(e.target.value) || 1)}
                  className="field"
                />
              </div>
              <div>
                <label className="label">优先级</label>
                <input
                  type="number"
                  value={s.defaultPriority}
                  onChange={(e) => update("defaultPriority", parseInt(e.target.value) || 0)}
                  className="field"
                />
              </div>
            </div>
          </div>

          {/* 提示 */}
          <div className="flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-850/60 px-4 py-3 text-xs leading-relaxed text-paper-muted">
            <IconKey width={14} height={14} className="mt-0.5 shrink-0 text-cinnabar" />
            <span>
              配置保存在本地 settings.json，同步时通过 SSH 让远程 docker 容器
              的 psql 执行 SQL。点「测试连接」验证 SSH + psql 是否通了。
            </span>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex gap-3 border-t border-ink-700 px-6 py-4">
          <button onClick={handleTest} disabled={testing} className="btn-ghost flex-1 justify-center">
            {testing ? "测试中…" : "测试连接"}
          </button>
          <button onClick={onClose} className="btn-ghost flex-1 justify-center">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 justify-center"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}