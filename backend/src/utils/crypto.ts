// ============================================================
// AES-256-GCM 加密工具
// 用于加密存储账号 Cookie，密钥从环境变量 COOKIE_KEY 派生
// ============================================================

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/** 获取加密密钥（从环境变量或生成默认值） */
function getKey(): Buffer {
  const raw = process.env.COOKIE_KEY;
  if (raw) {
    // 从提供的字符串派生 256-bit 密钥
    return crypto.scryptSync(raw, "opencode-salt", KEY_LENGTH);
  }
  // 默认开发密钥（生产环境务必设置 COOKIE_KEY）
  console.warn(
    "⚠️  COOKIE_KEY 未设置，使用默认开发密钥。生产环境请设置环境变量 COOKIE_KEY。"
  );
  return crypto.scryptSync("dev-key-change-me", "opencode-salt", KEY_LENGTH);
}

const KEY = getKey();

/** 加密明文 JSON 字符串，返回 { encrypted, iv, authTag }（均为 hex 编码） */
export function encrypt(plaintext: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/** 解密，返回明文字符串 */
export function decrypt(
  encrypted: string,
  ivHex: string,
  authTagHex: string
): string {
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
