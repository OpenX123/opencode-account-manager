import { useState, type FormEvent } from "react";
import { login } from "../api/client";
import OpenCodeLogo from "./OpenCodeLogo";

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("ocam");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      onLogin();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900/90 p-7 shadow-2xl backdrop-blur">
        <OpenCodeLogo className="mb-8" />
        <h1 className="font-display text-2xl font-semibold text-paper">登录账号工坊</h1>
        <p className="mt-2 text-sm text-paper-faint">身份验证通过后才能查看账号与密钥。</p>

        <label className="mt-7 block text-sm text-paper-muted">
          用户名
          <input
            autoComplete="username"
            className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-paper outline-none focus:border-cinnabar"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label className="mt-4 block text-sm text-paper-muted">
          密码
          <input
            autoComplete="current-password"
            autoFocus
            className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-paper outline-none focus:border-cinnabar"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="mt-4 text-sm text-rose">{error}</p>}
        <button className="btn-primary mt-6 w-full justify-center py-3" disabled={loading} type="submit">
          {loading ? "验证中…" : "登录"}
        </button>
      </form>
    </main>
  );
}
