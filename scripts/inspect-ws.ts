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

  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext();
  await ctx.addCookies(cookiesToPlaywrightFormat(cookies));
  const page = await ctx.newPage();

  // 首页
  await page.goto("https://opencode.ai", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log("HOME url:", page.url());
  // 首页 hidden inputs
  const homeInputs = await page.$$eval("input", els => els.map(e => ({ name: e.name, value: (e.value||"").slice(0,60), type: e.type })));
  console.log("HOME inputs:", JSON.stringify(homeInputs));
  // 首页所有含 /workspace/ 的链接
  const homeWsLinks = await page.$$eval("a[href*='/workspace/']", els => els.map(e => e.href).slice(0, 10)).catch(() => []);
  console.log("HOME ws links:", JSON.stringify(homeWsLinks));
  // 首页 body 文本里有没有 wrk_
  const homeText = await page.evaluate(() => (globalThis as any).document?.body?.innerText ?? "");
  const wrkMatch = homeText.match(/wrk_[A-Za-z0-9]+/);
  console.log("HOME text wrk_:", wrkMatch ? wrkMatch[0] : "none");

  // 尝试直接访问 /workspace 列表页或 dashboard
  await page.goto("https://opencode.ai/workspace", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => console.log("workspace nav err:", (e as Error).message));
  await page.waitForTimeout(4000);
  console.log("WORKSPACE url:", page.url());
  const wsInputs = await page.$$eval("input", els => els.map(e => ({ name: e.name, value: (e.value||"").slice(0,60), type: e.type }))).catch(() => []);
  console.log("WORKSPACE inputs:", JSON.stringify(wsInputs));
  const wsLinks2 = await page.$$eval("a[href*='/workspace/']", els => els.map(e => e.href).slice(0, 10)).catch(() => []);
  console.log("WORKSPACE ws links:", JSON.stringify(wsLinks2));

  await ctx.close();
  await b.close();
}
main().catch(e => { console.error(e); process.exit(1); });
