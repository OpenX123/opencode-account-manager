import fs from "fs";

const harPath = "C:/Users/qingfeng/Downloads/进入订阅界面.har";
const raw = fs.readFileSync(harPath, "utf8");
const har = JSON.parse(raw);

const entries = har.log.entries;

// Find and show key API calls with request/response bodies
const keywords = ["init", "payment_pages", "wallet-config", "get-cookie", "elements"];
for (const e of entries) {
  const url = e.request.url;
  const match = keywords.some(k => url.includes(k));
  if (!match) continue;

  const method = e.request.method;
  const status = e.response?.status || "?";
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${method} ${status} ${url}`);
  console.log(`${"=".repeat(60)}`);
  
  // Show request body
  if (e.request.postData?.text) {
    console.log(`\n[Request Body]`);
    const text = e.request.postData.text.substring(0, 2000);
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
  }
  
  // Show response body
  if (e.response?.content?.text) {
    const text = e.response.content.text.substring(0, 3000);
    console.log(`\n[Response Body]`);
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text.substring(0, 1000));
    }
  }
  
  // Show cookies
  if (e.response?.cookies?.length) {
    console.log(`\n[Cookies Set]`);
    for (const c of e.response.cookies) {
      console.log(`  ${c.name}=${c.value?.substring(0, 50)}... (domain: ${c.domain}, httpOnly: ${c.httpOnly})`);
    }
  }
}
