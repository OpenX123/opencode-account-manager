// ============================================================
// Electron 主进程
// 开发模式：加载 Vite Dev Server (http://localhost:5173)，后端独立运行
// 打包模式：内嵌启动后端 + 静态托管前端，加载 http://localhost:{port}
// ============================================================

import { app, BrowserWindow, shell, dialog, Menu } from "electron";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";

// --- 文件日志（便于诊断启动问题） ---
const logFile = path.join(
  process.env.TEMP || process.env.TMP || ".",
  "ocam-main.log"
);
function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(logFile, line); } catch {}
}

const isPackaged = app.isPackaged;
// 开发模式：加载 Vite Dev Server；FORCE_PROD=1 可在未打包时测试生产路径
const useDevServer = !isPackaged && process.env.FORCE_PROD !== "1";

// --- 资源路径解析（打包后 app.getAppPath() 指向 resources/app） ---
function appFile(...segments: string[]): string {
  return path.join(app.getAppPath(), ...segments);
}

// --- 持久化 Cookie 加密密钥（存放于 userData） ---
function ensureCookieKey(): string {
  const userData = app.getPath("userData");
  const keyFile = path.join(userData, "cookie.key");
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile, "utf-8").trim();
  }
  fs.mkdirSync(userData, { recursive: true });
  const key = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(keyFile, key, "utf-8");
  return key;
}

// --- 指定 Playwright 浏览器查找路径 ---
function setupPlaywright() {
  if (!isPackaged) {
    // 未打包：使用系统已安装的 ms-playwright 缓存
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const cache = path.join(home, "AppData", "Local", "ms-playwright");
    if (fs.existsSync(cache)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = cache;
    }
    return;
  }
  // 打包后浏览器随 extraResources 内置
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(
    process.resourcesPath,
    "playwright-browsers"
  );
}

// --- 后端子进程引用（退出时清理） ---
let backendProcess: ChildProcess | null = null;

// --- 启动内嵌后端子进程，通过 stdout 读取监听端口 ---
function startEmbeddedBackend(): Promise<number> {
  const serverPath = appFile("backend", "dist", "server.js");
  log(`startEmbeddedBackend: serverPath=${serverPath} exists=${fs.existsSync(serverPath)}`);
  if (!fs.existsSync(serverPath)) {
    return Promise.reject(new Error(`后端入口不存在: ${serverPath}`));
  }

  return new Promise<number>((resolve, reject) => {
    const child = fork(serverPath, [], {
      env: {
        ...process.env,
        // 让 electron.exe 作为纯 Node 运行子进程
        ELECTRON_RUN_AS_NODE: "1",
        // server.js 独立运行模式（不走 NO_AUTO_START 分支）
        NO_AUTO_START: "",
        PORT: "0",
        DATA_DIR: process.env.DATA_DIR,
        COOKIE_KEY: process.env.COOKIE_KEY,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
        FORCE_FRONTEND_DIST: appFile("frontend", "dist"),
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });
    backendProcess = child;

    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("后端启动超时（15s 未收到端口）"));
      }
    }, 15000);

    child.stdout!.on("data", (data: Buffer) => {
      const text = data.toString();
      log(`[backend stdout] ${text.trim()}`);
      const m = text.match(/OCAM_PORT:(\d+)/);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(parseInt(m[1], 10));
      }
    });

    child.stderr!.on("data", (data: Buffer) => {
      log(`[backend stderr] ${data.toString().trim()}`);
    });

    child.on("exit", (code) => {
      log(`[backend] 子进程退出 code=${code}`);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`后端进程异常退出（code=${code}）`));
      }
      backendProcess = null;
    });
  });
}

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0c0c0d",
    title: "OpenCode 账号工坊",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  if (useDevServer) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    try {
      const port = await startEmbeddedBackend();
      log(`加载 URL: http://localhost:${port}`);
      await mainWindow.loadURL(`http://localhost:${port}`);
      log("窗口加载完成");
    } catch (err) {
      log(`启动失败: ${(err as Error).message}\n${(err as Error).stack ?? ""}`);
      dialog.showErrorBox(
        "启动失败",
        `${(err as Error).message}\n\n${(err as Error).stack ?? ""}`
      );
      app.quit();
    }
  }
}

// --- 单实例锁 ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    log(`app ready, isPackaged=${isPackaged}, useDevServer=${useDevServer}`);
    log(`userData: ${app.getPath("userData")}`);
    setupPlaywright();
    log(`PLAYWRIGHT_BROWSERS_PATH: ${process.env.PLAYWRIGHT_BROWSERS_PATH}`);
    process.env.COOKIE_KEY = ensureCookieKey();
    if (isPackaged) {
      process.env.DATA_DIR = path.join(app.getPath("userData"), "data");
    }
    log(`DATA_DIR: ${process.env.DATA_DIR || "(default)"}`);
    await createWindow();
    log("createWindow 完成");
  });

  app.on("window-all-closed", () => {
    if (backendProcess) {
      try { backendProcess.kill(); } catch {}
    }
    app.quit();
  });

  app.on("before-quit", () => {
    if (backendProcess) {
      try { backendProcess.kill(); } catch {}
    }
  });
}
