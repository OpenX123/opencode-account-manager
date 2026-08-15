import { validate as isUuid, v4 as uuid } from "uuid";
import type { Account, Cookie } from "../types.js";
import { decryptWithSourceKey, encrypt } from "../utils/crypto.js";

export interface AccountMergeResult {
  accounts: Account[];
  added: number;
  updated: number;
  skipped: number;
  failed: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function timestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function decodeCookies(source: Record<string, unknown>, sourceKey: string): Cookie[] {
  const plain = decryptWithSourceKey(
    text(source.encryptedCookies),
    text(source.iv),
    text(source.authTag),
    sourceKey
  );
  const cookies = JSON.parse(plain) as unknown;
  if (!Array.isArray(cookies) || !cookies.every((item) =>
    item && typeof item === "object"
      && typeof (item as Record<string, unknown>).name === "string"
      && typeof (item as Record<string, unknown>).value === "string"
  )) throw new Error("Cookie 数据无效");
  return cookies as Cookie[];
}

function findExisting(source: Record<string, unknown>, accounts: Account[]): Account | undefined {
  const email = text(source.email).trim().toLowerCase();
  if (email) return accounts.find((item) => item.email.trim().toLowerCase() === email);
  const id = text(source.id);
  const byId = accounts.find((item) => item.id === id);
  if (byId) return byId;
  const username = text(source.username).trim().toLowerCase();
  return username
    ? accounts.find((item) => item.username.trim().toLowerCase() === username)
    : undefined;
}

export function mergeAccountBackup(
  source: unknown,
  sourceKey: string,
  current: Account[]
): AccountMergeResult {
  if (!Array.isArray(source) || source.length > 500) throw new Error("账号备份格式无效或数量超过 500");
  const accounts = [...current];
  let added = 0, updated = 0, skipped = 0, failed = 0;

  for (const item of source) {
    if (!item || typeof item !== "object") { failed++; continue; }
    const record = item as Record<string, unknown>;
    try {
      const cookies = decodeCookies(record, sourceKey);
      const encryptedCookies = encrypt(JSON.stringify(cookies));
      const existing = findExisting(record, accounts);
      const lastVerifiedAt = timestamp(record.lastVerifiedAt);

      if (existing) {
        if (lastVerifiedAt <= existing.lastVerifiedAt) { skipped++; continue; }
        Object.assign(existing, {
          email: text(record.email) || existing.email,
          username: text(record.username) || existing.username,
          avatarUrl: text(record.avatarUrl) || existing.avatarUrl,
          encryptedCookies: encryptedCookies.encrypted,
          iv: encryptedCookies.iv,
          authTag: encryptedCookies.authTag,
          lastVerifiedAt,
        });
        updated++;
        continue;
      }

      const sourceId = text(record.id);
      accounts.push({
        id: isUuid(sourceId) && !accounts.some((item) => item.id === sourceId) ? sourceId : uuid(),
        alias: text(record.alias) || text(record.username) || text(record.email) || "未命名账号",
        email: text(record.email),
        username: text(record.username),
        avatarUrl: text(record.avatarUrl),
        encryptedCookies: encryptedCookies.encrypted,
        iv: encryptedCookies.iv,
        authTag: encryptedCookies.authTag,
        lastVerifiedAt,
        createdAt: timestamp(record.createdAt) || Date.now(),
        note: text(record.note),
        invitedBy: typeof record.invitedBy === "string" ? record.invitedBy : null,
      });
      added++;
    } catch {
      failed++;
    }
  }

  return { accounts, added, updated, skipped, failed };
}
