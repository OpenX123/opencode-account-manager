// ============================================================
// 打包辅助：将 Playwright 所需的 chromium 浏览器从本地缓存拷贝到
// electron/build-assets/playwright-browsers，供 electron-builder 以
// extraResources 内置进安装包。运行时由主进程设置
// PLAYWRIGHT_BROWSERS_PATH 指向该目录。
//
// 使用 robocopy（Windows 原生）以正确处理中文路径与大目录拷贝。
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");

// --- 定位 playwright-core/browsers.json ---
function findBrowsersJson() {
  const roots = [
    path.join(root, "node_modules"),
    path.join(root, "backend", "node_modules"),
  ];
  for (const r of roots) {
    const direct = path.join(r, "playwright-core", "browsers.json");
    if (fs.existsSync(direct)) return direct;
  }
  const pnpm = path.join(root, "node_modules", ".pnpm");
  if (fs.existsSync(pnpm)) {
    const dir = fs
      .readdirSync(pnpm)
      .find((d) => d.startsWith("playwright-core@"));
    if (dir) {
      const f = path.join(
        pnpm,
        dir,
        "node_modules",
        "playwright-core",
        "browsers.json"
      );
      if (fs.existsSync(f)) return f;
    }
  }
  throw new Error("找不到 playwright-core/browsers.json，请先安装依赖");
}

// --- ms-playwright 缓存目录 ---
function cacheDir() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, "AppData", "Local", "ms-playwright");
}

// --- robocopy 拷贝目录（Unicode 路径安全），退出码 < 8 视为成功 ---
function robocopy(src, dest) {
  const result = spawnSync("robocopy", [
    src,
    dest,
    "/E", // 含子目录
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP",
    "/MT:8", // 多线程加速
  ], { windowsVerbatimArguments: false, stdio: "ignore" });
  // robocopy: 0-7 成功，>=8 失败
  if (result.status === null || result.status >= 8) {
    throw new Error(
      `robocopy 失败 (exit=${result.status}): ${src} -> ${dest}`
    );
  }
}

const browsersJson = findBrowsersJson();
const browsers = JSON.parse(
  fs.readFileSync(browsersJson, "utf-8")
).browsers;

const chromium = browsers.find((b) => b.name === "chromium");
const headless = browsers.find((b) => b.name === "chromium-headless-shell");
if (!chromium) throw new Error("browsers.json 中未找到 chromium 记录");

const rev = chromium.revision;
const targets = [`chromium-${rev}`];
if (headless) targets.push(`chromium_headless_shell-${headless.revision}`);

const cache = cacheDir();
if (!fs.existsSync(cache)) {
  throw new Error(
    `Playwright 浏览器缓存不存在: ${cache}\n请先运行: npx playwright install chromium`
  );
}

const outDir = path.join(
  import.meta.dirname,
  "build-assets",
  "playwright-browsers"
);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const t of targets) {
  const src = path.join(cache, t);
  if (!fs.existsSync(src)) {
    console.warn(`⚠️  缺少浏览器目录: ${src}（跳过）`);
    continue;
  }
  const dest = path.join(outDir, t);
  console.log(`📦 复制 ${t} ...`);
  robocopy(src, dest);
  const count = fs.readdirSync(dest).length;
  console.log(`   ✓ ${count} 项`);
}

console.log(`\n✅ Playwright 浏览器就位 → ${outDir}`);
