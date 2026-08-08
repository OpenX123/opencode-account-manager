// ============================================================
// Layout — 左侧栏不对称布局（告别顶部居中导航）
// ============================================================

import type { ReactNode } from "react";
import { IconUpload, IconLink, IconRefresh, IconSettings, IconExternal } from "./icons";
import ThemeToggle from "./ThemeToggle";
import OpenCodeLogo from "./OpenCodeLogo";

interface Props {
  webMode?: boolean;
  onOAuthClick: () => void;
  onImportClick: () => void;
  onInviteClick: () => void;
  onRefresh: () => void;
  onSettingsClick: () => void;
  children: ReactNode;
}

export default function Layout({
  webMode = false,
  onOAuthClick,
  onImportClick,
  onInviteClick,
  onRefresh,
  onSettingsClick,
  children,
}: Props) {
  return (
    <div className="flex min-h-screen">
      {/* 左侧栏：窄而有呼吸感 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-700/70 bg-ink-900/40 px-5 py-6 md:flex">
        {/* 官方 OpenCode 标志 + 第三方工具名称 */}
        <div className="mb-10 flex items-center gap-3">
          <OpenCodeLogo />
          <div className="min-w-0">
            <div className="font-display text-[21px] italic leading-none text-paper tracking-tightish">
              账号工坊
            </div>
            <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-paper-faint">
              Unofficial Account Manager
            </div>
          </div>
        </div>

        {/* 主操作：纵向堆叠，非居中胶囊 */}
        <nav className="flex flex-col gap-2">
          <button onClick={onOAuthClick} className="btn-primary justify-start">
            <IconExternal width={16} height={16} />
            浏览器登录
          </button>
          <button onClick={onImportClick} className="btn-ghost justify-start">
            <IconUpload width={16} height={16} />
            导入 Cookie
          </button>
          <button onClick={onInviteClick} className="btn-ghost justify-start">
            <IconLink width={16} height={16} />
            邀请链接
          </button>
        </nav>

        {/* 底部刷新 + 配置 + 脚注 */}
        <div className="mt-auto flex flex-col gap-4">
          <button
            onClick={onRefresh}
            className="btn-ghost justify-start text-xs"
            title="刷新列表"
          >
            <IconRefresh width={15} height={15} />
            刷新
          </button>
          <button
            onClick={onSettingsClick}
            className="btn-ghost justify-start text-xs"
            title="sub2api 配置"
          >
            <IconSettings width={15} height={15} />
            配置
          </button>
          <ThemeToggle />
          <div className="border-t border-ink-700/70 pt-4 font-mono text-[10px] leading-relaxed text-paper-faint">
            {webMode ? "服务端存储 · AES-256" : "本地存储 · AES-256"}
            <br />
            Cookie 加密落盘
            <br />
            第三方本地工具 · 非官方产品
          </div>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">
        {/* 移动端顶部操作条 */}
        <div className="mb-6 flex gap-2 md:hidden">
          <button onClick={onOAuthClick} className="btn-primary flex-1 justify-center text-xs">
            <IconExternal width={15} height={15} />
            登录
          </button>
          <button onClick={onImportClick} className="btn-ghost justify-center text-xs">
            <IconUpload width={15} height={15} />
            Cookie
          </button>
          <button onClick={onInviteClick} className="btn-ghost text-xs">
            <IconLink width={15} height={15} />
            邀请
          </button>
          <button onClick={onRefresh} className="btn-icon">
            <IconRefresh width={16} height={16} />
          </button>
          <ThemeToggle compact />
        </div>
        {children}
      </main>
    </div>
  );
}
