// ============================================================
// OpenCode Account Manager — Shared Types (Backend)
// ============================================================

/** Cookie 对象（标准浏览器格式） */
export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

/** 账号记录（存储在 SQLite 中） */
export interface Account {
  id: string;
  alias: string;
  email: string;
  /** 用户名（从 opencode.ai 抓取） */
  username: string;
  /** 头像 URL */
  avatarUrl: string;
  /** AES-256-GCM 加密后的 Cookie JSON */
  encryptedCookies: string;
  /** 加密 IV（hex） */
  iv: string;
  /** 加密 auth tag（hex） */
  authTag: string;
  /** Cookie 最后验证通过的时间 */
  lastVerifiedAt: number;
  /** 创建时间 */
  createdAt: number;
  /** 备注 */
  note: string;
  /** 邀请来源账号 ID */
  invitedBy: string | null;
  /** AES-256-GCM 加密后的 OpenCode API Key（按需获取并缓存） */
  encryptedApiKey?: string;
  /** API Key 独立加密 IV */
  apiKeyIv?: string;
  /** API Key 独立加密 auth tag */
  apiKeyAuthTag?: string;
  /** API Key 最后从官方刷新时间 */
  apiKeyUpdatedAt?: number;
}

/** 创建账号的输入 */
export interface CreateAccountInput {
  alias: string;
  cookies: Cookie[];
  note?: string;
  invitedBy?: string;
}

/** 更新账号的输入 */
export interface UpdateAccountInput {
  alias?: string;
  note?: string;
  cookies?: Cookie[];
}

/** 从 Cookie 验证结果中提取的用户信息 */
export interface SessionInfo {
  username: string;
  email: string;
  avatarUrl: string;
  valid: boolean;
}
