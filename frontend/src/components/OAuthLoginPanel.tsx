import { useEffect, useState } from "react";
import * as api from "../api/client";
import { useToast } from "./Toast";
import { IconCheck, IconClose, IconExternal, IconStop } from "./icons";

interface Props {
  onClose: () => void;
  onAccountCreated: () => Promise<void> | void;
}

type ViewState = "idle" | "launching" | "waiting" | "success" | "error";

export default function OAuthLoginPanel({ onClose, onAccountCreated }: Props) {
  const webMode = import.meta.env.VITE_WEB_MODE === "1";
  const [alias, setAlias] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [state, setState] = useState<ViewState>("idle");
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (!sessionId || state !== "waiting") return;

    let active = true;
    const poll = async () => {
      try {
        const status = await api.getOAuthLoginStatus(sessionId);
        if (!active) return;
        if (status.state === "success") {
          setState("success");
          setMessage(`账号“${status.alias || "OAuth 账号"}”已加密保存`);
          await onAccountCreated();
          toast("浏览器登录成功，账号已加入列表", "success");
        } else if (status.state !== "pending") {
          setState("error");
          setMessage(status.error || "登录没有完成，请重新尝试");
        }
      } catch (error) {
        if (!active) return;
        setState("error");
        setMessage((error as Error).message);
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [sessionId, state, onAccountCreated, toast]);

  const start = async () => {
    const remoteBrowser = webMode ? window.open("about:blank", "ocam-oauth-browser") : null;
    setState("launching");
    setMessage("");
    try {
      const result = await api.startOAuthLogin(alias.trim() || undefined);
      setSessionId(result.sessionId);
      setState("waiting");
      if (remoteBrowser) {
        remoteBrowser.location.href = "/browser-view/vnc.html?autoconnect=true&resize=scale&path=browser-view/websockify";
      }
    } catch (error) {
      remoteBrowser?.close();
      setState("error");
      setMessage((error as Error).message);
    }
  };

  const close = async () => {
    if (sessionId && state === "waiting") {
      await api.cancelOAuthLogin(sessionId).catch(() => undefined);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm" />
      <div className="relative flex h-full w-full max-w-xl animate-slide-in-right flex-col border-l border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 bg-cinnabar-soft/30 px-6 py-5">
          <div>
            <h2 className="font-display text-xl text-paper">浏览器 OAuth 登录</h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.18em] text-paper-faint">
              手动认证 · 本地加密
            </p>
          </div>
          <button onClick={() => void close()} className="btn-icon">
            <IconClose width={18} height={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <label className="label">账号别名（可选）</label>
          <input
            type="text"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            disabled={state === "launching" || state === "waiting" || state === "success"}
            placeholder="例如：主账号、工作账号"
            className="field mb-5"
          />

          <div className="rounded-lg border border-ink-700 bg-ink-850/60 px-4 py-4 text-sm leading-relaxed text-paper-muted">
            {state === "idle" && (
              <p>点击后会打开应用内置的 Chromium。请自行完成 OAuth、验证码或安全验证。</p>
            )}
            {state === "launching" && <p>正在启动安全登录窗口…</p>}
            {state === "waiting" && (
              <div className="space-y-3">
                <p className="text-paper">等待你在登录窗口中完成认证…</p>
                <p className="text-xs">成功进入 OpenCode 工作区后，窗口会自动关闭，Cookie 将加密保存到本机。</p>
                {webMode && (
                  <a
                    className="btn-primary mt-4 justify-center"
                    href="/browser-view/vnc.html?autoconnect=true&resize=scale&path=browser-view/websockify"
                    target="ocam-oauth-browser"
                    rel="noreferrer"
                  >
                    <IconExternal width={15} height={15} />
                    打开登录浏览器
                  </a>
                )}
              </div>
            )}
            {state === "success" && (
              <div className="flex items-start gap-3 text-sage">
                <IconCheck className="mt-0.5 shrink-0" />
                <p>{message}</p>
              </div>
            )}
            {state === "error" && <p className="text-rose">{message}</p>}
          </div>

          <div className="mt-4 rounded-lg border border-ink-700/70 px-4 py-3 text-xs leading-relaxed text-paper-faint">
            应用不会读取或保存你的密码，也不会绕过验证码。只在登录成功后读取 opencode.ai 的会话 Cookie。
          </div>
        </div>

        <div className="flex gap-3 border-t border-ink-700 px-6 py-4">
          <button onClick={() => void close()} className="btn-ghost flex-1 justify-center">
            {state === "waiting" ? <IconStop width={15} height={15} /> : null}
            {state === "waiting" ? "取消登录" : state === "success" ? "完成" : "关闭"}
          </button>
          {(state === "idle" || state === "error") && (
            <button onClick={() => void start()} className="btn-primary flex-1 justify-center">
              <IconExternal width={15} height={15} />
              打开登录窗口
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
