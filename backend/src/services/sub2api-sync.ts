// ============================================================
// Sub2Api Sync — 同步 OpenCode Go 账号到 sub2api 数据库
//
// 流程：
//   1. 带 Cookie GET /auth → 302 → /workspace/{wsId}
//   2. GET /workspace/{wsId}/keys 页面 HTML，提取 sk-xxx API key
//   3. 通过 SSH 连接远程服务器，docker exec psql 执行 SQL：
//      a. 检查是否已存在同名账号（按 name 去重）
//      b. INSERT INTO accounts ... RETURNING id
//      c. INSERT INTO account_groups (account_id, 9, 50)
// ============================================================

import { execFile } from "node:child_process";
import { decrypt } from "../utils/crypto.js";
import { getAccountById } from "./account-store.js";
import type { Account, Cookie } from "../types.js";

export interface SyncResult {
  accountId: string;
  alias: string;
  success: boolean;
  message: string;
  apiKey?: string;
  sub2apiId?: number;
  sub2apiName?: string;
}

// --- 固定配置 ---
const GROUP_ID = 9;
const GROUP_NAME = "OPENCODE-GO";
const PLATFORM = "openai";
const BASE_URL = "https://opencode.ai/zen/go/v1";
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_PRIORITY = 50;

// --- SSH 配置 ---
const SSH_HOST = "186.241.77.41";
const SSH_PORT = "22";
const SSH_USER = "root";
const SSH_KEY = "C:\\Users\\qingfeng\\.ssh\\opencode_remote_key";
const DOCKER_CONTAINER = "sub2api-postgres";
const DB_USER = "sub2api";
const DB_NAME = "sub2api";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

function cookiesToString(cookies: Cookie[]): string {
  return cookies
    .filter((c) => c.name && c.value)
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function decryptCookies(account: Account): Cookie[] {
  const json = decrypt(account.encryptedCookies, account.iv, account.authTag);
  return JSON.parse(json) as Cookie[];
}

/**
 * 通过 SSH 执行 psql SQL 语句。
 * 用 stdin 管道传 SQL，避免 shell 转义问题。
 */
function execSql(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-o", "ConnectTimeout=15",
      "-o", "StrictHostKeyChecking=no",
      "-o", "BatchMode=yes",
      "-i", SSH_KEY,
      "-p", SSH_PORT,
      `${SSH_USER}@${SSH_HOST}`,
      `docker exec -i ${DOCKER_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} -t -A`,
    ];

    const proc = execFile("ssh", args, {
      maxBuffer: 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });

    proc.on("error", (err) => {
      reject(new Error(`SSH 执行失败: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`SSH 退出码 ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      resolve(stdout);
    });

    // 通过 stdin 传 SQL
    proc.stdin?.end(sql);
  });
}

/**
 * 从远程数据库查下一个可用的序号。
 * 查找已存在的 opencode-go-NN 中最大 NN。
 */
async function getNextSequence(): Promise<number> {
  const sql = `SELECT COALESCE(MAX(SUBSTRING(name FROM 'opencode-go-([0-9]+)')::int), 0) FROM accounts WHERE name LIKE 'opencode-go%';`;
  const result = await execSql(sql);
  const max = parseInt(result.trim(), 10);
  return isNaN(max) ? 1 : max + 1;
}

/**
 * 检查账号是否已存在（按 API key 去重）。
 * 返回已存在的 account id，或 null。
 */
async function findExistingByKey(apiKey: string): Promise<number | null> {
  const sql = `SELECT id FROM accounts WHERE credentials->>'api_key' = '${apiKey.replace(/'/g, "''")}' AND deleted_at IS NULL LIMIT 1;`;
  const result = await execSql(sql);
  const trimmed = result.trim();
  if (!trimmed) return null;
  const id = parseInt(trimmed, 10);
  return isNaN(id) ? null : id;
}

/**
 * 检查账号是否已在分组中。
 */
async function isAlreadyInGroup(accountId: number): Promise<boolean> {
  const sql = `SELECT 1 FROM account_groups WHERE account_id = ${accountId} AND group_id = ${GROUP_ID} LIMIT 1;`;
  const result = await execSql(sql);
  return result.trim().length > 0;
}

/**
 * 插入新账号到 accounts 表，返回新 id。
 */
async function insertAccount(name: string, apiKey: string): Promise<number> {
  const credentials = JSON.stringify({ api_key: apiKey, base_url: BASE_URL });
  // 转义 JSON 中的单引号
  const escapedCreds = credentials.replace(/'/g, "''");
  const sql = `INSERT INTO accounts (name, platform, type, credentials, concurrency, priority, schedulable) VALUES ('${name}', '${PLATFORM}', '${PLATFORM}', '${escapedCreds}'::jsonb, ${DEFAULT_CONCURRENCY}, ${DEFAULT_PRIORITY}, true) RETURNING id;`;
  const result = await execSql(sql);
  const id = parseInt(result.trim(), 10);
  if (isNaN(id)) throw new Error("插入账号后未返回有效 id");
  return id;
}

/**
 * 关联账号到分组。
 */
async function linkToGroup(accountId: number, priority: number): Promise<void> {
  const sql = `INSERT INTO account_groups (account_id, group_id, priority) VALUES (${accountId}, ${GROUP_ID}, ${priority}) ON CONFLICT DO NOTHING;`;
  await execSql(sql);
}

/**
 * 从 OpenCode /keys 页面提取 API key。
 */
async function fetchApiKey(
  workspaceId: string,
  cookieHeader: string,
  baseHeaders: Record<string, string>
): Promise<string | null> {
  const keysUrl = `https://opencode.ai/workspace/${workspaceId}/keys`;
  const keysRes = await fetch(keysUrl, {
    headers: { ...baseHeaders, Referer: "https://opencode.ai/" },
  });
  if (!keysRes.ok) {
    throw new Error(`访问 /keys 页面失败: ${keysRes.status}`);
  }
  const html = await keysRes.text();

  // 从 HTML 中提取 sk-xxx key
  const keyMatch = html.match(/sk-[A-Za-z0-9]{20,}/);
  return keyMatch ? keyMatch[0] : null;
}

/**
 * 获取 workspaceId（带 Cookie 访问 /auth → 302）。
 */
async function getWorkspaceId(cookieHeader: string, baseHeaders: Record<string, string>): Promise<string> {
  const authRes = await fetch("https://opencode.ai/auth", {
    headers: baseHeaders,
    redirect: "manual",
  });
  const location = authRes.headers.get("location") || "";
  const wsMatch = location.match(/\/workspace\/(wrk_[A-Za-z0-9]+)/);
  if (!wsMatch) {
    throw new Error(
      `Cookie 可能已失效（状态码 ${authRes.status}，未重定向到工作区）`
    );
  }
  return wsMatch[1];
}

/**
 * 为指定账号同步到 sub2api。
 */
export async function syncToSub2api(accountId: string): Promise<SyncResult> {
  const account = getAccountById(accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);

  const cookies = decryptCookies(account);
  const cookieHeader = cookiesToString(cookies);

  const baseHeaders: Record<string, string> = {
    Cookie: cookieHeader,
    "User-Agent": UA,
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };

  // 第 1 步：获取 workspaceId
  const workspaceId = await getWorkspaceId(cookieHeader, baseHeaders);

  // 第 2 步：从 /keys 页面提取 API key
  const apiKey = await fetchApiKey(workspaceId, cookieHeader, baseHeaders);

  if (!apiKey) {
    return {
      accountId,
      alias: account.alias,
      success: false,
      message: "未找到 API key（/keys 页面无 sk-xxx）",
    };
  }

  // 第 3 步：检查 sub2api 中是否已存在相同 key
  const existingId = await findExistingByKey(apiKey);

  if (existingId) {
    // 已存在，检查是否在分组中
    const inGroup = await isAlreadyInGroup(existingId);
    if (inGroup) {
      return {
        accountId,
        alias: account.alias,
        success: true,
        message: `已存在且在 ${GROUP_NAME} 分组中（ID: ${existingId}）`,
        apiKey,
        sub2apiId: existingId,
      };
    }
    // 不在分组中，加进去
    await linkToGroup(existingId, DEFAULT_PRIORITY);
    return {
      accountId,
      alias: account.alias,
      success: true,
      message: `已关联到 ${GROUP_NAME} 分组（现有账号 ID: ${existingId}）`,
      apiKey,
      sub2apiId: existingId,
    };
  }

  // 第 4 步：插入新账号
  const seq = await getNextSequence();
  const name = `opencode-go-${String(seq).padStart(2, "0")}`;
  const newId = await insertAccount(name, apiKey);

  // 第 5 步：关联到分组
  await linkToGroup(newId, DEFAULT_PRIORITY);

  return {
    accountId,
    alias: account.alias,
    success: true,
    message: `已添加 ${name}（ID: ${newId}）到 ${GROUP_NAME} 分组`,
    apiKey,
    sub2apiId: newId,
    sub2apiName: name,
  };
}
