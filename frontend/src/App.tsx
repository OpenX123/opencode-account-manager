// ============================================================
// App — 根组件，组合所有模块
// ============================================================

import { useState } from "react";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
import AccountList from "./components/AccountList";
import CookieImporter from "./components/CookieImporter";
import InviteChainPanel from "./components/InviteChainPanel";
import SettingsPanel from "./components/SettingsPanel";
import { useAccounts } from "./hooks/useAccounts";
import { IconKey } from "./components/icons";

export default function App() {
  const { accounts, loading, error, refresh, importAccount, removeAccount } =
    useAccounts();

  const [showImporter, setShowImporter] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const validCount = accounts.filter((a) => a.hasCookies).length;
  const invitedCount = accounts.filter((a) => a.invitedBy).length;

  return (
    <ToastProvider>
      <Layout
        onImportClick={() => setShowImporter(true)}
        onInviteClick={() => setShowInvite(true)}
        onRefresh={refresh}
        onSettingsClick={() => setShowSettings(true)}
      >
        {/* 编辑式标题区：左对齐、衬线斜体、口语化文案 */}
        <header className="mb-8 max-w-3xl animate-slide-up">
          <h1 className="font-display text-4xl leading-[1.1] tracking-tightish text-paper md:text-5xl">
            你的账号，<span className="italic text-cinnabar">一把抓</span>在手里。
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-paper-muted">
            导入 Cookie 就能秒切账号，邀请链接一键生成供你手动注册。
            全程本地加密，不上传任何凭证。
          </p>
        </header>

        {/* 内联账本条：一句话式统计，告别三卡片 */}
        {!loading && accounts.length > 0 && (
          <div className="mb-6 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-y border-ink-700/50 py-3 font-mono text-xs animate-fade-in">
            <span className="flex items-baseline gap-1.5">
              <span className="font-display text-xl font-semibold text-paper">
                {accounts.length}
              </span>
              <span className="text-paper-faint">个账号</span>
            </span>
            <span className="text-ink-600">·</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-sage">{validCount}</span>
              <span className="text-paper-faint">个 Cookie 有效</span>
            </span>
            <span className="text-ink-600">·</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-amber">{invitedCount}</span>
              <span className="text-paper-faint">个靠邀请注册</span>
            </span>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 rounded-lg border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">
            {error}
          </div>
        )}

        {/* 账号清单 */}
        <AccountList
          accounts={accounts}
          loading={loading}
          onRemove={removeAccount}
          onRefresh={refresh}
        />

        {/* 首次空状态引导角标 */}
        {!loading && accounts.length === 0 && (
          <div className="mt-8 flex items-center gap-2 font-mono text-xs text-paper-faint">
            <IconKey width={14} height={14} className="text-cinnabar" />
            提示：Cookie 越新鲜，验证越快通过
          </div>
        )}

        {/* Cookie 导入滑出面板 */}
        {showImporter && (
          <CookieImporter
            onImport={async (cookies, alias) => {
              const result = await importAccount(cookies, alias);
              return result;
            }}
            onClose={() => setShowImporter(false)}
          />
        )}

        {/* 邀请链接面板 */}
        {showInvite && (
          <InviteChainPanel
            accounts={accounts}
            onClose={() => setShowInvite(false)}
            onAccountCreated={refresh}
          />
        )}

        {/* sub2api 配置面板 */}
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </Layout>
    </ToastProvider>
  );
}
