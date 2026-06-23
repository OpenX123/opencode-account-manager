import { chromium } from "playwright";
import { getAccountById } from "./src/services/account-store.js";
import { cookiesToPlaywrightFormat } from "./src/services/cookie-manager.js";
import { decrypt } from "./src/utils/crypto.js";

async function main() {
  const id = "ecbd58da-0363-430d-bce9-90dbb435937b";
  const account = getAccountById(id);
  if (!account) { console.log("no account"); return; }
  const json = decrypt(account.encryptedCookies, account.iv, account.authTag);
  const cookies = JSON.parse(json);
  console.log("COOKIE names:", cookies.map((c: any) => c.name));
  // 打印含 wrk / workspace / session 的 cookie
  for (const c of cookies) {
    const v = String(c.value);
    if (/wrk|workspace|sess|auth|token|user/i.test(c.name) || /wrk_[A-Za-z0-9]/.test(v)) {
      console.log(`COOKIE ${c.name} = ${v.slice(0, 80)}`);
    }
  }

  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext();
  await ctx.addCookies(cookiesToPlaywrightFormat(cookies));
  const page = await ctx.newPage();

  // 抓所有网络请求里含 workspace/wrk 的
  const seen: string[] = [];
  page.on("response", (r) => {
    const u = r.url();
    if (/wrk_|workspace|\/api\/|user|account/i.test(u)) seen.push(`${r.status()} ${u}`);
  });

  // 试几个可能返回 workspace 列表的路由
  const probes = [
    "https://opencode.ai/api/workspaces",
    "https://opencode.ai/api/me",
    "https://opencode.ai/api/user",
    "https://opencode.ai/_server/workspace",
    "https://opencode.ai/_server",
  ];
  for (const u of probes) {
    const resp = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null);
    if (resp) {
      const status = resp.status();
      const body = await resp.text().catch(() => "").then((t) => t.slice(0, 300));
      console.log(`PROBE ${u} -> ${status}: ${body}`);
    }
  }

  // 访问首页等更久，看网络请求
  await page.goto("https://opencode.ai", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(6000);
  console.log("NETWORK (filtered):");
  for (const s of seen.slice(0, 40)) console.log("  ", s);

  await ctx.close();
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
