// ============================================================
// 账号持久化 — JSON 文件存储（零原生依赖）
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Account } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 打包为桌面应用时，由 Electron 主进程注入 userData 路径
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");

// ============================================================
// 内存缓存 + JSON 文件
// ============================================================

let accounts: Account[] | null = null;

function load(): Account[] {
  if (accounts !== null) return accounts;

  ensureDataDir();
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      accounts = JSON.parse(raw) as Account[];
    } catch {
      console.warn("账号数据文件损坏，使用空列表");
      accounts = [];
    }
  } else {
    accounts = [];
  }
  return accounts;
}

function save(): void {
  ensureDataDir();
  const sorted = [...(accounts || [])].sort(
    (a, b) => b.createdAt - a.createdAt
  );
  fs.writeFileSync(DATA_FILE, JSON.stringify(sorted, null, 2), "utf-8");
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ============================================================
// CRUD 操作（与之前 SQLite 版本接口完全一致）
// ============================================================

export function getAllAccounts(): Account[] {
  return [...load()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getAccountById(id: string): Account | undefined {
  return load().find((a) => a.id === id);
}

export function insertAccount(account: Account): void {
  const list = load();
  list.push(account);
  save();
}

export function updateAccount(
  id: string,
  updates: Partial<
    Pick<
      Account,
      | "alias"
      | "email"
      | "username"
      | "avatarUrl"
      | "encryptedCookies"
      | "iv"
      | "authTag"
      | "lastVerifiedAt"
      | "note"
    >
  >
): void {
  const list = load();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return;

  const account = list[idx];
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      (account as unknown as Record<string, unknown>)[key] = value;
    }
  }
  save();
}

export function deleteAccount(id: string): void {
  const list = load();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return;
  list.splice(idx, 1);
  accounts = list; // 更新内存缓存
  save();
}
