# OpenCode 账号工坊

用于管理多个 OpenCode 账号的桌面端与 Web 工具。支持账号导入、邀请链注册、OpenCode Go 订阅、套餐与额度查询、API Key 获取及 sub2api 同步。

这是非官方工具，与 OpenCode 官方无隶属关系。

## 当前功能

- 浏览器登录：在独立浏览器中完成 OpenCode / Google 登录，成功后加密保存 Cookie
- Cookie 导入：支持 JSON、Netscape 和普通 Cookie 字符串
- 自动去重：按邮箱忽略大小写，跳过已导入账号和同一批次的重复账号
- 多账号管理：查看账号、备注、有效状态、额度和使用记录
- 邀请链注册：按账号列表依次生成邀请链接并完成注册流程
- OpenCode Go：免费账号可直接打开 Stripe 订阅页
- Go 设置：订阅成功后自动开启“达到限额后使用 Zen 余额”和“中国模型”，也可手动开启
- 套餐详情：显示 Go 状态、额度窗口、Token、模型用量和重置时间
- API Key：读取并加密缓存 OpenCode API Key
- 邀请奖励：查询并领取可用邀请奖励
- sub2api：将账号 API Key 同步到已配置的 sub2api 实例
- 桌面与 Web：支持 Electron 本地运行，也支持 Docker + noVNC 远程部署

管理界面的 API 请求最多等待 5 秒；Google 登录、验证码和 Stripe 付款属于用户交互流程，不受这个时间限制。

## 账号列表格式

自动邀请链使用纯文本，每行一个账号：

```text
邮箱----密码----恢复邮箱
```

示例：

```text
user01@example.com----Password01----recovery01@example.com
user02@example.com----Password02----recovery02@example.com
```

恢复邮箱可以省略：

```text
user03@example.com----Password03
```

规则：

- 分隔符必须是四个半角连字符：`----`
- 第一列为 Google Workspace 邮箱
- 第二列为账号密码
- 第三列为恢复邮箱，可选
- 空行会被忽略
- 邮箱匹配不区分大小写
- 已存在的邮箱和当前批次中的重复邮箱会自动跳过
- 不要把真实账号文件提交到 Git；仓库根目录的 `账号.txt` 已被忽略

## Cookie 导入格式

推荐使用浏览器导出的 JSON 数组：

```json
[
  {
    "name": "session",
    "value": "<cookie-value>",
    "domain": ".opencode.ai",
    "path": "/",
    "secure": true,
    "httpOnly": true,
    "sameSite": "Lax"
  }
]
```

也支持普通 Cookie 字符串：

```text
session=<cookie-value>; another_cookie=<cookie-value>
```

以及 Netscape Cookie 文件格式。导入时会实际访问 OpenCode 验证登录状态；无效或过期 Cookie 不会保存。

## 邀请链流程

1. 粘贴账号列表并解析。
2. 选择已经导入的主号。
3. 系统生成邀请链接并按顺序处理账号。
4. 浏览器进入邀请页，选择 OpenCode Go，并通过 Google 登录。
5. 遇到 Google Workspace 条款时滚动到底部并确认。
6. 注册完成后保存账号 Cookie，并继续下一个账号。
7. 用户在 Stripe 完成付款后，系统检测订阅并开启两个 Go 设置。

验证码、二次验证、安全检查和最终付款需要用户本人完成，工具不会绕过这些步骤。

## 本地开发

环境要求：

- Node.js 22 或更高版本
- pnpm 10 或更高版本
- Windows 桌面版默认使用 Microsoft Edge

安装并启动：

```bash
pnpm install
pnpm electron:dev
```

构建 Windows 安装包：

```bash
pnpm electron:build
```

产物位于 `release/`。

## Docker Web 部署

Web 模式包含后端、前端、Chromium、Xvfb 和 noVNC：

```bash
docker compose -f docker-compose.web.yml build
docker compose -f docker-compose.web.yml up -d
```

默认仅监听宿主机回环地址：

- `127.0.0.1:3012`：管理界面与 API
- `127.0.0.1:3013`：noVNC 浏览器

请通过带 HTTPS 和身份验证的反向代理对外提供服务，不要直接暴露 noVNC 端口。

生产环境至少需要设置：

```dotenv
COOKIE_KEY=<随机长密钥>
WEB_AUTH_USERNAME=<管理用户名>
WEB_PASSWORD_SALT=<随机盐>
WEB_PASSWORD_HASH=<scrypt密码哈希>
WEB_SESSION_SECRET=<随机会话密钥>
```

## 数据与安全

- Cookie 和缓存的 API Key 使用 AES-256-GCM 加密后保存
- 桌面数据默认位于 `%APPDATA%\opencode-account-manager\data\`
- Docker 数据保存在项目的 `data/` 挂载目录
- `COOKIE_KEY` 丢失后，已有加密数据将无法解密
- 账号列表包含明文密码；邀请链创建的账号备注也可能包含密码，因此必须限制 `data/` 和备份目录权限
- 不要提交 `.env`、`data/`、`账号.txt`、Cookie、密码或 API Key
- 远程部署必须保护管理界面、API 和 noVNC，且仅通过 HTTPS 访问

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面 | Electron 33 |
| 前端 | React 19、Vite 6、Tailwind CSS 3 |
| 后端 | Express 4、TypeScript ESM |
| 浏览器 | Playwright；Windows 使用 Edge，Docker 使用 Chromium |
| 存储 | JSON 文件；敏感字段使用 AES-256-GCM 加密 |
| 部署 | electron-builder、Docker Compose、noVNC |

## 常用检查

```bash
pnpm --filter ./backend typecheck
pnpm --filter ./frontend typecheck
pnpm --filter ./backend test:account-insights
pnpm --filter ./backend build
pnpm --filter ./frontend build
```
