import fs from "node:fs";
import path from "node:path";
import { getAllAccountInsightsCached, type AccountInsights } from "./account-insights.js";
import { getSub2ApiSettings } from "./settings-store.js";
import { findSub2ApiSchedulingAccount, setSub2ApiSchedulable } from "./sub2api-sync.js";

const DATA_DIR = process.env.DATA_DIR || path.resolve("data");
const STATE_FILE = path.join(DATA_DIR, "quota-guard.json");
const INTERVAL_MS = 60_000;

type GuardState = Record<string, number>;

export function quotaExhausted(insights: AccountInsights): boolean {
  return Object.values(insights.windows).some((window) => window && window.usagePercent >= 100);
}

function readState(): GuardState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as GuardState;
  } catch {
    return {};
  }
}

function writeState(state: GuardState): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(temp, STATE_FILE);
}

export async function reconcileQuotaGuard(): Promise<void> {
  const cfg = getSub2ApiSettings();
  if (!cfg.dbUser || !cfg.dbName || (!process.env.SUB2API_PSQL_HOST && !cfg.sshHost)) return;

  const state = readState();
  const { value: accounts } = await getAllAccountInsightsCached(true);
  for (const account of accounts) {
    if (!account.insights) continue;
    try {
      const exhausted = quotaExhausted(account.insights);
      const rememberedId = state[account.accountId];
      if (exhausted) {
        const channel = await findSub2ApiSchedulingAccount(account.accountId);
        if (!channel || (!channel.schedulable && !rememberedId)) continue;
        if (channel.schedulable && await setSub2ApiSchedulable(channel.id, false)) {
          state[account.accountId] = channel.id;
          writeState(state);
          console.log(`[quota-guard] 已禁用额度耗尽账号 ${account.alias} 的 sub2api 调度`);
        }
      } else if (rememberedId) {
        await setSub2ApiSchedulable(rememberedId, true);
        delete state[account.accountId];
        writeState(state);
        console.log(`[quota-guard] 已恢复额度账号 ${account.alias} 的 sub2api 调度`);
      }
    } catch (err) {
      console.warn(`[quota-guard] 跳过账号 ${account.alias}: ${(err as Error).message}`);
    }
  }
}

export function startQuotaGuard(): () => void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await reconcileQuotaGuard();
    } catch (err) {
      console.warn(`[quota-guard] 检查失败: ${(err as Error).message}`);
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(() => void run(), 5_000);
  const interval = setInterval(() => void run(), INTERVAL_MS);
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
}
