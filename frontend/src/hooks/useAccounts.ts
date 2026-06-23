// ============================================================
// useAccounts Hook — 账号列表数据获取
// ============================================================

import { useState, useEffect, useCallback } from "react";
import type { AccountSummary } from "../types";
import * as api from "../api/client";

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const importAccount = useCallback(
    async (cookies: string, alias?: string) => {
      const result = await api.importAccount({ cookies, alias });
      setAccounts((prev) => [result, ...prev]);
      return result;
    },
    []
  );

  const removeAccount = useCallback(async (id: string) => {
    await api.deleteAccount(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { accounts, loading, error, refresh, importAccount, removeAccount };
}
