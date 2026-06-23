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

  await page.goto("https://opencode.ai", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  const btns = await page.$$eval("button", (els) => els.map((e) => (e.textContent || "").trim().slice(0, 30)).filter(Boolean));
  console.log("BUTTONS:", JSON.stringify(btns));

  const links = await page.$$eval("a", (els) => els.map((e) => ({ text: (e.textContent || "").trim().slice(0, 30), href: e.href })).filter((x) => x.text));
  console.log("LINKS:", JSON.stringify(links.slice(0, 40)));

  // 找带 /auth 或 /login 或 /signin 或 /workspace 的
  const authLinks = links.filter((x) => /auth|login|signin|sign-in|workspace|dashboard|account|console|app/i.test(x.href));
  console.log("AUTH-ish LINKS:", JSON.stringify(authLinks));

  await ctx.close();
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
