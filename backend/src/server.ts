// ============================================================
// Express Server 入口
// 既可作为独立进程运行（开发 / node dist/server.js），
// 也可被 Electron 主进程导入并手动调用 startServer()。
// ============================================================

import express from "express";
import cors from "cors";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { accountsRouter } from "./routes/accounts.js";
import { browserRouter } from "./routes/browser.js";
import { inviteRouter } from "./routes/invite.js";
import { settingsRouter } from "./routes/settings.js";
import { assertWebAuthConfig, authRouter, requireWebAuth } from "./routes/auth.js";

export interface StartServerOptions {
  /** 监听端口，0 表示随机空闲端口 */
  port?: number;
  /** 前端静态产物目录（Electron 打包后由后端托管前端） */
  frontendDist?: string;
}

export interface StartedServer {
  port: number;
  server: Server;
  close: () => Promise<void>;
}

/** 构建并启动 Express 应用，返回实际监听端口与关闭函数 */
export function startServer(opts: StartServerOptions = {}): Promise<StartedServer> {
  assertWebAuthConfig();
  const port = opts.port ?? 0;

  const app = express();
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
      ],
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });
  app.use("/api/auth", authRouter);
  app.use("/api", requireWebAuth);
  app.get("/api/auth/check", (_req, res) => res.sendStatus(204));

  // --- REST API 路由 ---
  app.use("/api/accounts", accountsRouter);
  app.use("/api/browser", browserRouter);
  app.use("/api/invite", inviteRouter);
  app.use("/api/settings", settingsRouter);

  // --- 健康检查 ---
  // --- 静态托管前端（打包模式） ---
  if (opts.frontendDist) {
    app.use(express.static(opts.frontendDist));
    // 非 /api 路径一律回退到 index.html（SPA）
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(opts.frontendDist!, "index.html"));
    });
  }

  const server = createServer(app);

  return new Promise<StartedServer>((resolve) => {
    server.listen(port, () => {
      const addr = server.address();
      const actualPort =
        typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: actualPort,
        server,
        close: () =>
          new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

// ============================================================
// 独立运行（开发 tsx / 生产 node dist/server.js）
// 当被 Electron 导入时，会设置 NO_AUTO_START=1 抑制自动启动，
// 改由主进程手动调用 startServer()。
// ============================================================

if (process.env.NO_AUTO_START !== "1") {
  const PORT = parseInt(process.env.PORT || "3001", 10);
  const frontendDist = process.env.FORCE_FRONTEND_DIST || undefined;

  startServer({ port: PORT, frontendDist }).then(({ port }) => {
    console.log(`\n🚀 OpenCode Account Manager 后端已启动`);
    console.log(`   HTTP:  http://localhost:${port}`);
    console.log(`   API:   http://localhost:${port}/api/health\n`);
    // 供 Electron 主进程通过 stdout 读取端口
    console.log(`OCAM_PORT:${port}`);
  });

  process.on("SIGINT", async () => {
    console.log("\n正在关闭...");
    const { closeBrowser } = await import("./services/browser-pool.js");
    await closeBrowser();
    process.exit(0);
  });
}
