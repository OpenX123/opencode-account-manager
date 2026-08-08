import { Router, type RequestHandler, type Router as ExpressRouter } from "express";
import { createSession, LoginLimiter, readCookie, verifyPassword, verifySession } from "../services/web-auth.js";

const COOKIE_NAME = "ocam_session";
const limiter = new LoginLimiter();

function config() {
  return {
    username: process.env.WEB_AUTH_USERNAME || "",
    salt: process.env.WEB_PASSWORD_SALT || "",
    passwordHash: process.env.WEB_PASSWORD_HASH || "",
    sessionSecret: process.env.WEB_SESSION_SECRET || "",
  };
}

export function assertWebAuthConfig(): void {
  if (process.env.WEB_MODE !== "1") return;
  const value = config();
  if (!value.username || !value.salt || !value.passwordHash || !value.sessionSecret) {
    throw new Error("WEB_MODE requires WEB_AUTH_USERNAME, WEB_PASSWORD_SALT, WEB_PASSWORD_HASH and WEB_SESSION_SECRET");
  }
}

function authenticated(cookieHeader: string | undefined): boolean {
  if (process.env.WEB_MODE !== "1") return true;
  const value = config();
  return verifySession(readCookie(cookieHeader, COOKIE_NAME), value.username, value.sessionSecret);
}

export const requireWebAuth: RequestHandler = (req, res, next) => {
  if (authenticated(req.headers.cookie)) return next();
  res.status(401).json({ error: "请先登录" });
};

export const authRouter: ExpressRouter = Router();

authRouter.get("/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ authenticated: authenticated(req.headers.cookie) });
});

authRouter.post("/login", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const remote = req.ip || req.socket.remoteAddress || "unknown";
  if (limiter.blocked(remote)) {
    res.status(429).json({ error: "登录尝试过多，请 15 分钟后再试" });
    return;
  }

  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const value = config();
  if (!username || !password || username !== value.username || !verifyPassword(password, value.salt, value.passwordHash)) {
    limiter.fail(remote);
    res.status(401).json({ error: "用户名或密码错误" });
    return;
  }

  limiter.clear(remote);
  const token = createSession(value.username, value.sessionSecret);
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? "; Secure" : ""}`);
  res.json({ authenticated: true });
});

authRouter.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.json({ authenticated: false });
});
