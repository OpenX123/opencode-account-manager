import { chromium } from "playwright";
import { getAccountById } from "./src/services/account-store.js";
import { cookiesToPlaywrightFormat } from "./src/services/cookie-manager.js";
import { decrypt } from "./src/utils/crypto.js";

async function main() {
  const id = "ecbd58da-0363-430d-bce9-90dbb435937b";
  const account = getAccountById(id);
  if (!account) { console.log("no account"); return; }
  const cookies = JSON.parse(decrypt(account.encryptedCookies, account.iv, account.authTag));

  const b = await chromium.launch({ headless: false });
  const ctx = await b.newContext();
  await ctx.addCookies(cookiesToPlaywrightFormat(cookies));
  const page = await ctx.newPage();

  await page.goto("https://opencode.ai", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // 找登录按钮
  const loginBtn = await page.$(
    'button:has-text("登录"), button:has-text("Login"), button:has-text("Log in"), button:has-text("Sign in"), a:has-text("登录"), a:has-text("Login"), a:has-text("Log in"), a:has-text("Sign in")'
  );
  console.log("login btn found:", !!loginBtn);
  if (loginBtn) {
    const tag = await loginBtn.evaluate((e) => e.tagName);
    const text = (await loginBtn.textContent())?.trim();
    console.log("login btn:", tag, text);
  }

  if (loginBtn) {
    await loginBtn.click();
    await page.waitForTimeout(6000);
    console.log("AFTER CLICK url:", page.url());

    // 抓 workspaceId
    const wsInput = await page.$(`input[name="workspaceID"]`).then((e) => e?.getAttribute("value")).catch(() => null);
    console.log("workspaceID input:", wsInput);
    const urlMatch = page.url().match(/\/workspace\/(wrk_[A-Za-z0-9]+)/);
    console.log("url wsId:", urlMatch?.[1]);
    const wsLinks = await page.$$eval("a[href*='/workspace/']", (els) => els.map((e) => e.href).slice(0, 10)).catch(() => []);
    console.log("ws links:", JSON.stringify(wsLinks));
  }

  await ctx.close();
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
