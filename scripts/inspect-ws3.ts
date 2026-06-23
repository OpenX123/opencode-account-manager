import { chromium } from "playwright";
import { getAccountById } from "./src/services/account-store.js";
import { cookiesToPlaywrightFormat } from "./src/services/cookie-manager.js";
import { decrypt } from "./src/utils/crypto.js";

async function main() {
  const id = "ecbd58da-0363-430d-bce9-90dbb435937b";
  const account = getAccountById(id);
  if (!account) return;
  const cookies = JSON.parse(decrypt(account.encryptedCookies, account.iv, account.authTag));

  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext();
  await ctx.addCookies(cookiesToPlaywrightFormat(cookies));
  const page = await ctx.newPage();

  const reqs: string[] = [];
  page.on("request", (r) => {
    const u = r.url();
    if (/_server|wrk_|workspace|\/api|user|account|session/i.test(u)) {
      reqs.push(`${r.method()} ${u}`);
    }
  });

  // 直接访问已知能进的 go 页，看它发起了哪些 RPC
  await page.goto("https://opencode.ai/workspace/wrk_01KS4PZDXG88Q0FEG8V6D90EFT/go", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(5000);
  console.log("=== GO page network ===");
  for (const r of reqs) console.log("  ", r);

  // 再试 POST _server 常见 RPC 方法
  console.log("\n=== POST _server probes ===");
  const methods = ["workspaces", "listWorkspaces", "getWorkspaces", "user", "me", "session", "account"];
  for (const m of methods) {
    const resp = await ctx.request.post(`https://opencode.ai/_server`, {
      data: { method: m },
      headers: { "content-type": "application/json" },
      timeout: 10000,
    }).catch(() => null);
    if (resp) {
      const status = resp.status();
      const body = (await resp.text().catch(() => "")).slice(0, 200);
      console.log(`  POST _server {method:${m}} -> ${status}: ${body}`);
    }
  }

  // GET _server 带路径
  console.log("\n=== GET _server path probes ===");
  const paths = ["/_server/workspaces", "/_server/user", "/_server/me", "/_server/session", "/_server/rpc"];
  for (const p of paths) {
    const resp = await ctx.request.get(`https://opencode.ai${p}`, { timeout: 10000 }).catch(() => null);
    if (resp) {
      const status = resp.status();
      const body = (await resp.text().catch(() => "")).slice(0, 200);
      console.log(`  GET ${p} -> ${status}: ${body}`);
    }
  }

  await ctx.close();
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
