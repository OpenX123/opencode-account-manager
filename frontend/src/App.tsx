// ============================================================
// App — 根组件，组合所有模块
// ============================================================

import { useEffect, useState } from "react";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
import AccountList from "./components/AccountList";
import CookieImporter from "./components/CookieImporter";
import InviteChainPanel from "./components/InviteChainPanel";
import SettingsPanel from "./components/SettingsPanel";
import OAuthLoginPanel from "./components/OAuthLoginPanel";
import { useAccounts } from "./hooks/useAccounts";
import { IconKey } from "./components/icons";
import LoginScreen from "./components/LoginScreen";
import { getAuthStatus } from "./api/client";

export default function App() {
  const webMode = import.meta.env.VITE_WEB_MODE === "1";
  const [authenticated, setAuthenticated] = useState(!webMode);
  const [checkingAuth, setCheckingAuth] = useState(webMode);

  useEffect(() => {
    if (!webMode) return;
    getAuthStatus()
      .then((result) => setAuthenticated(result.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setCheckingAuth(false));
  }, [webMode]);

  if (checkingAuth) return null;
  if (!authenticated) return <LoginScreen onLogin={() => setAuthenticated(true)} />;
  return <AccountManager />;
}

function AccountManager() {
  const webMode = import.meta.env.VITE_WEB_MODE === "1";
  const { accounts, loading, error, refresh, importAccount, removeAccount } =
    useAccounts();

  const [showImporter, setShowImporter] = useState(false);
  const [showOAuthLogin, setShowOAuthLogin] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const validCount = accounts.filter((a) => a.hasCookies).length;
  const invitedCount = accounts.filter((a) => a.invitedBy).length;

  return (
    <ToastProvider>
      <Layout
        webMode={webMode}
        onOAuthClick={() => setShowOAuthLogin(true)}
        onImportClick={() => setShowImporter(true)}
        onInviteClick={() => setShowInvite(true)}
        onRefresh={refresh}
        onSettingsClick={() => setShowSettings(true)}
      >
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

        {showOAuthLogin && (
          <OAuthLoginPanel
            onClose={() => setShowOAuthLogin(false)}
            onAccountCreated={refresh}
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
