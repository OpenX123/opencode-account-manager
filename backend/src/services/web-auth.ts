import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function passwordHash(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  return safeEqual(passwordHash(password, salt), expectedHash.toLowerCase());
}

export function createSession(username: string, secret: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ username, expiresAt: now + SESSION_TTL_MS })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token: string, username: string, secret: string, now = Date.now()): boolean {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { username?: string; expiresAt?: number };
    return session.username === username && typeof session.expiresAt === "number" && session.expiresAt > now;
  } catch {
    return false;
  }
}

export function readCookie(header: string | undefined, name: string): string {
  if (!header) return "";
  for (const item of header.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export class LoginLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly maxAttempts = 5, private readonly windowMs = 15 * 60 * 1000) {}

  blocked(key: string, now = Date.now()): boolean {
    const state = this.failures.get(key);
    if (!state || state.resetAt <= now) {
      if (state) this.failures.delete(key);
      return false;
    }
    return state.count >= this.maxAttempts;
  }

  fail(key: string, now = Date.now()): void {
    const state = this.failures.get(key);
    if (!state || state.resetAt <= now) {
      this.failures.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    state.count += 1;
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
