// ============================================================
// Sub2Api Sync — 同步 OpenCode Go 账号到 sub2api 数据库
//
// 流程：
//   1. 从共用 Key 服务读取本机加密缓存（没有缓存时从官方获取）
//   2. 通过 SSH 连接远程服务器，docker exec psql 执行 SQL：
//      a. 检查是否已存在同名账号（按 name 去重）
//      b. INSERT INTO accounts ... RETURNING id
//      c. INSERT INTO account_groups (account_id, 9, 50)
// ============================================================

import { execFile } from "node:child_process";
import { getAccountById } from "./account-store.js";
import { getSub2ApiSettings, type Sub2ApiSettings } from "./settings-store.js";
import { getApiKey } from "./api-key.js";

export interface SyncResult {
  accountId: string;
  alias: string;
  success: boolean;
  message: string;
  apiKey?: string;
  sub2apiId?: number;
  sub2apiName?: string;
}

/**
 * 通过 SSH 执行 psql SQL 语句。
 * 用 stdin 管道传 SQL，避免 shell 转义问题。
 */
function execSql(sql: string, cfg: Sub2ApiSettings): Promise<string> {
  return new Promise((resolve, reject) => {
    const directHost = process.env.SUB2API_PSQL_HOST?.trim();
    const command = directHost ? "psql" : "ssh";
    const args = directHost ? [
      "-h", directHost,
      "-p", process.env.SUB2API_PSQL_PORT || "5432",
      "-U", cfg.dbUser,
      "-d", cfg.dbName,
      "-t", "-A",
    ] : [
      "-o", "ConnectTimeout=15",
      "-o", "StrictHostKeyChecking=no",
      "-o", "BatchMode=yes",
      "-i", cfg.sshKey,
      "-p", cfg.sshPort,
      `${cfg.sshUser}@${cfg.sshHost}`,
      `docker exec -i ${cfg.dockerContainer} psql -U ${cfg.dbUser} -d ${cfg.dbName} -t -A`,
    ];

    const proc = execFile(command, args, {
      maxBuffer: 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
      env: directHost
        ? { ...process.env, PGPASSWORD: process.env.SUB2API_PSQL_PASSWORD || "" }
        : process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });

    proc.on("error", (err) => {
      reject(new Error(`${directHost ? "PostgreSQL" : "SSH"} 执行失败: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${directHost ? "psql" : "SSH"} 退出码 ${code}: ${stderr.trim() || stdout.trim()}`));
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
async function getNextSequence(cfg: Sub2ApiSettings): Promise<number> {
  const sql = `SELECT COALESCE(MAX(SUBSTRING(name FROM 'opencode-go-([0-9]+)')::int), 0) FROM accounts WHERE name LIKE 'opencode-go%';`;
  const result = await execSql(sql, cfg);
  const max = parseInt(result.trim(), 10);
  return isNaN(max) ? 1 : max + 1;
}

/**
 * 检查账号是否已存在（按 API key 去重）。
 * 返回已存在的 account id，或 null。
 */
async function findExistingByKey(apiKey: string, cfg: Sub2ApiSettings): Promise<number | null> {
  const sql = `SELECT id FROM accounts WHERE credentials->>'api_key' = '${apiKey.replace(/'/g, "''")}' AND deleted_at IS NULL LIMIT 1;`;
  const result = await execSql(sql, cfg);
  const trimmed = result.trim();
  if (!trimmed) return null;
  const id = parseInt(trimmed, 10);
  return isNaN(id) ? null : id;
}

export async function findSub2ApiSchedulingAccount(accountId: string): Promise<{
  id: number;
  schedulable: boolean;
} | null> {
  const cfg = getSub2ApiSettings();
  const { apiKey } = await getApiKey(accountId);
  const escaped = apiKey.replace(/'/g, "''");
  const result = await execSql(
    `SELECT id, schedulable FROM accounts WHERE credentials->>'api_key' = '${escaped}' AND deleted_at IS NULL LIMIT 1;`,
    cfg
  );
  const [id, schedulable] = result.trim().split("|");
  const parsedId = Number.parseInt(id, 10);
  return Number.isFinite(parsedId) ? { id: parsedId, schedulable: schedulable === "t" } : null;
}

export async function setSub2ApiSchedulable(id: number, schedulable: boolean): Promise<boolean> {
  const result = await execSql(
    `UPDATE accounts SET schedulable = ${schedulable}, updated_at = NOW() WHERE id = ${id} AND deleted_at IS NULL RETURNING id;`,
    getSub2ApiSettings()
  );
  return result.trim() === String(id);
}

async function buildCredentials(apiKey: string, cfg: Sub2ApiSettings): Promise<string> {
  const modelMapping: Record<string, string> = {};
  try {
    const response = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/v1/models`);
    if (response.ok) {
      const payload = await response.json() as { data?: Array<{ id?: string }> };
      for (const model of payload.data || []) {
        if (model.id) modelMapping[model.id] = model.id;
      }
    }
  } catch {
    // The account remains usable even if the public model catalog is temporarily unavailable.
  }
  return JSON.stringify({ api_key: apiKey, base_url: cfg.baseUrl, model_mapping: modelMapping });
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 将已存在的同 Key 账号修正为当前 sub2api 的 OpenAI API Key 结构。
 */
async function updateExistingAccount(
  accountId: number,
  apiKey: string,
  cfg: Sub2ApiSettings
): Promise<void> {
  const credentials = await buildCredentials(apiKey, cfg);
  const sql = `UPDATE accounts SET platform = ${sqlString(cfg.platform)}, type = 'apikey', credentials = COALESCE(credentials, '{}'::jsonb) || ${sqlString(credentials)}::jsonb, concurrency = ${cfg.defaultConcurrency}, priority = ${cfg.defaultPriority}, status = 'active', schedulable = true, updated_at = NOW() WHERE id = ${accountId};`;
  await execSql(sql, cfg);
}

/**
 * 检查账号是否已在分组中。
 */
async function isAlreadyInGroup(accountId: number, cfg: Sub2ApiSettings): Promise<boolean> {
  const sql = `SELECT 1 FROM account_groups WHERE account_id = ${accountId} AND group_id = ${cfg.groupId} LIMIT 1;`;
  const result = await execSql(sql, cfg);
  return result.trim().length > 0;
}

/**
 * 插入新账号到 accounts 表，返回新 id。
 */
async function insertAccount(name: string, apiKey: string, cfg: Sub2ApiSettings): Promise<number> {
  const credentials = await buildCredentials(apiKey, cfg);
  const sql = `INSERT INTO accounts (name, platform, type, credentials, concurrency, priority, schedulable) VALUES (${sqlString(name)}, ${sqlString(cfg.platform)}, 'apikey', ${sqlString(credentials)}::jsonb, ${cfg.defaultConcurrency}, ${cfg.defaultPriority}, true) RETURNING id;`;
  const result = await execSql(sql, cfg);
  const id = parseInt(result.trim(), 10);
  if (isNaN(id)) throw new Error("插入账号后未返回有效 id");
  return id;
}

/**
 * 关联账号到分组。
 */
async function linkToGroup(accountId: number, priority: number, cfg: Sub2ApiSettings): Promise<void> {
  const sql = `INSERT INTO account_groups (account_id, group_id, priority) VALUES (${accountId}, ${cfg.groupId}, ${priority}) ON CONFLICT DO NOTHING;`;
  await execSql(sql, cfg);
}

/**
 * 为指定账号同步到 sub2api。
 */
export async function syncToSub2api(accountId: string): Promise<SyncResult> {
  const account = getAccountById(accountId);
  if (!account) throw new Error(`账号不存在: ${accountId}`);

  const cfg = getSub2ApiSettings();

  // Key 获取能力与账号列表共用；默认优先使用本机加密缓存。
  const { apiKey } = await getApiKey(accountId);

  // 第 3 步：检查 sub2api 中是否已存在相同 key
  const existingId = await findExistingByKey(apiKey, cfg);

  if (existingId) {
    await updateExistingAccount(existingId, apiKey, cfg);
    const inGroup = await isAlreadyInGroup(existingId, cfg);
    if (inGroup) {
      return {
        accountId,
        alias: account.alias,
        success: true,
        message: `已存在且在 ${cfg.groupName} 分组中（ID: ${existingId}）`,
        apiKey,
        sub2apiId: existingId,
      };
    }
    await linkToGroup(existingId, cfg.defaultPriority, cfg);
    return {
      accountId,
      alias: account.alias,
      success: true,
      message: `已关联到 ${cfg.groupName} 分组（现有账号 ID: ${existingId}）`,
      apiKey,
      sub2apiId: existingId,
    };
  }

  // 第 4 步：插入新账号
  const seq = await getNextSequence(cfg);
  const name = `opencode-go-${String(seq).padStart(2, "0")}`;
  const newId = await insertAccount(name, apiKey, cfg);

  // 第 5 步：关联到分组
  await linkToGroup(newId, cfg.defaultPriority, cfg);

  return {
    accountId,
    alias: account.alias,
    success: true,
    message: `已添加 ${name}（ID: ${newId}）到 ${cfg.groupName} 分组`,
    apiKey,
    sub2apiId: newId,
    sub2apiName: name,
  };
}

/**
 * 测试 sub2api SSH 连通性
 */
export async function testSub2apiConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  const cfg = getSub2ApiSettings();
  try {
    const result = await execSql("SELECT 1;", cfg);
    if (result.trim() === "1") {
      return { success: true, message: "连接成功" };
    }
    return { success: false, message: `返回异常: ${result.trim()}` };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}
