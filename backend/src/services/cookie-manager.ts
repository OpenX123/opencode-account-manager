// ============================================================
// Cookie 管理器 — 格式解析、验证、格式转换
// ============================================================

import type { Cookie, SessionInfo } from "../types.js";

/**
 * 解析用户输入的 Cookie 文本。
 * 支持多种格式：
 *   1. JSON 数组：[{name,value,domain,...}, ...]（浏览器 DevTools 导出）
 *   2. EditThisCookie 格式：[{domain, name, value, ...}, ...]
 *   3. Netscape cookie 格式（curl 风格）
 *   4. Cookie 字符串："name1=value1; name2=value2"
 */
export function parseCookies(input: string): Cookie[] {
  const trimmed = input.trim();

  // 尝试 JSON 格式
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map(normalizeCookie);
    } catch {
      // 不是有效 JSON，继续尝试其他格式
    }
  }

  // Netscape cookie 格式（# Netscape HTTP Cookie File ...）
  if (trimmed.includes("# Netscape") || trimmed.includes("# HTTP Cookie")) {
    return parseNetscapeFormat(trimmed);
  }

  // Cookie 字符串格式："key1=val1; key2=val2"
  if (trimmed.includes("=") && !trimmed.includes("\t")) {
    return parseCookieString(trimmed);
  }

  throw new Error(
    "无法识别的 Cookie 格式。请粘贴浏览器 DevTools 导出的 Cookie JSON 数组，或 Netscape Cookie 文本。"
  );
}

function normalizeCookie(raw: Record<string, unknown>): Cookie {
  return {
    name: String(raw.name ?? ""),
    value: String(raw.value ?? ""),
    domain: String(raw.domain ?? ".opencode.ai"),
    path: String(raw.path ?? "/"),
    expires: raw.expires ? Number(raw.expires) : undefined,
    httpOnly: Boolean(raw.httpOnly),
    secure: Boolean(raw.secure),
    sameSite: parseSameSite(raw.sameSite),
  };
}

function parseSameSite(val: unknown): Cookie["sameSite"] {
  const s = String(val ?? "").toLowerCase();
  if (s === "strict") return "Strict";
  if (s === "lax") return "Lax";
  if (s === "none") return "None";
  return undefined;
}

function parseNetscapeFormat(text: string): Cookie[] {
  const cookies: Cookie[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("\t");
    if (parts.length >= 7) {
      cookies.push({
        domain: parts[0],
        httpOnly: parts[1] === "TRUE",
        path: parts[2],
        secure: parts[3] === "TRUE",
        expires: parseFloat(parts[4]) || undefined,
        name: parts[5],
        value: parts[6],
      });
    }
  }
  return cookies;
}

function parseCookieString(text: string): Cookie[] {
  const pairs = text.split(";").map((s) => s.trim());
  return pairs.map((pair) => {
    const [name, ...rest] = pair.split("=");
    return {
      name: name.trim(),
      value: rest.join("=").trim(),
      domain: ".opencode.ai",
      path: "/",
    };
  });
}

/**
 * 从 Cookie 数组中提取认证相关的关键 Cookie。
 * 用于快速检查 Cookie 是否有效。
 */
export function extractAuthCookies(cookies: Cookie[]): Cookie[] {
  const authPatterns = [
    /^session/i,
    /^token/i,
    /^auth/i,
    /^jwt/i,
    /^sid/i,
    /^connect\.sid/i,
    /^__session/i,
    /^next-auth/i,
    /^supabase-auth/i,
    /^sb-/i,
    /^clerk/i,
  ];
  return cookies.filter((c) =>
    authPatterns.some((p) => p.test(c.name))
  );
}

/**
 * 用 Playwright 无头模式验证 Cookie 是否有效，
 * 并抓取用户信息。
 * （具体实现在 cookie-manager 中，这里提供接口）
 */
export function cookiesToPlaywrightFormat(
  cookies: Cookie[]
): Array<{
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}> {
  return cookies
    .filter((c) => c.name && c.value)
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain || ".opencode.ai",
      path: c.path || "/",
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));
}

export { type SessionInfo };
