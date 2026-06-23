# OpenCode 账号工坊

OpenCode 账号管理桌面工具 — Cookie 导入、多账号切换、链式邀请、额度查询、自动领奖。

> 🐧 灌水 QQ 群：**1060714372**

## 功能

- **Cookie 导入** — 支持从浏览器剪贴板导入 OpenCode Cookie，自动验证有效性并加密存储
- **多账号管理** — 一键切号、删号、别名标记
- **浏览器直接登录** — 以目标账号身份直接打开工作空间
- **GO 订阅支付** — 一键跳转 Stripe 支付页面
- **链式邀请** — 生成邀请链接，自动化注册流程
- **额度查询** — 单号/批量查询 rolling/weekly/monthly 使用量
- **自动领奖** — 领取邀请奖励
- **sub2api 同步** — 钥匙分发对接

## 技术栈

| 层 | 技术 |
|---|------|
| 桌面壳 | Electron 33 |
| 前端 UI | React 19 + Vite 6 + Tailwind CSS 3 |
| 后端 API | Express 4 (TypeScript ESM) |
| 浏览器自动化 | Playwright 1.61 (内置 Chromium) |
| 数据存储 | AES-256-GCM 加密 JSON 文件 |
| 打包 | electron-builder (NSIS 安装包) |

## 快速开始

### 环境要求

- Node.js ≥ 22
- pnpm ≥ 10

### 开发

```bash
pnpm install
pnpm electron:dev
```

启动后：后端 (tsx watch) + 前端 (Vite HMR) + Electron 窗口 (加载 localhost:5173)。

`FORCE_PROD=1 electron .` 可在未打包时模拟生产路径（内嵌后端 + 静态托管前端）。

### 构建

```bash
pnpm electron:build
```

生成产物：

- `release/win-unpacked/` — 解包即用版
- `release/OpenCode 账号工坊 Setup 1.0.0.exe` — 安装包

## 目录结构

```
opencode-account-manager/
├── electron/              # Electron 主进程
│   ├── main.ts            #   窗口创建、后端子进程管理
│   ├── preload.ts         #   预加载脚本
│   ├── tsconfig.json
│   └── copy-playwright.mjs # 打包时拷贝 Chromium 浏览器
├── backend/               # Express API 服务
│   ├── src/
│   │   ├── server.ts      #   入口，支持独立运行/库模式
│   │   ├── routes/        #   REST 路由
│   │   ├── services/      #   账号存储、浏览器池、邀请引擎等
│   │   └── utils/         #   AES 加密
│   └── tsconfig.json
├── frontend/              # React 前端
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/           #   后端 API 封装
│   │   ├── components/    #   UI 组件
│   │   └── hooks/         #   数据 hooks
│   ├── vite.config.ts
│   └── tailwind.config.js
├── package.json           # monorepo 根
└── pnpm-workspace.yaml
```

## 数据安全

- 账号 Cookie 使用 **AES-256-GCM** 加密后存入 `%APPDATA%\opencode-account-manager\data\`
- 加密密钥通过 `COOKIE_KEY` 环境变量派生，桌面版启动时生成随机密钥持久化到 `cookie.key`
- 不连接任何外部服务器，所有数据纯本地

## 友情链接

[Linux DO](https://linux.do/) — 技术社区

## License

MIT
