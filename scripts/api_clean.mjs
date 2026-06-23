import fs from "fs";

const harPath = "C:/Users/qingfeng/Downloads/进入订阅界面.har";
const raw = fs.readFileSync(harPath, "utf8");
const har = JSON.parse(raw);

const entries = har.log.entries;

// Only business-critical APIs (skip analytics, telemetry, static, Google Pay logging)
const skipDomains = ["r.stripe.com", "play.google.com", "www.gstatic.com"];
const skipPaths = ["/log?", "/csp-report", ".deploy_status_henson.json", "/b", "/6", "/ns?"];

const bizCalls = entries.filter(e => {
  const url = e.request.url;
  const host = new URL(url).hostname;
  if (skipDomains.includes(host)) return false;
  for (const p of skipPaths) {
    if (url.includes(p)) return false;
  }
  if (url.match(/\.(js|css|png|woff2|html|webmanifest|svg)($|\?)/)) return false;
  return true;
});

console.log("## Stripe Checkout — 业务 API 调用链路\n");
console.log(`共 ${bizCalls.length} 个核心请求 (已过滤 遥测/日志/静态资源)\n`);

let step = 0;
for (const e of bizCalls) {
  step++;
  const method = e.request.method;
  const url = e.request.url;
  const u = new URL(url);
  const path = u.pathname + (u.search || "");
  const status = e.response?.status || "?";

  // Skip OPTIONS (CORS preflight)
  if (method === "OPTIONS") {
    // Still show but minimal
    console.log(`### ${step}. ${method} ${status} \`${path}\` — _CORS preflight_`);
    console.log("");
    continue;
  }

  console.log(`### ${step}. ${method} ${status} \`${path}\``);
  console.log(`> Host: **${u.hostname}**`);

  // Request body
  if (e.request.postData?.text) {
    let body = e.request.postData.text;
    if (body.includes("=") && !body.startsWith("{")) {
      try {
        const params = new URLSearchParams(body);
        const obj = {};
        for (const [k,v] of params) obj[k] = v.substring(0, 80);
        body = JSON.stringify(obj, null, 2);
      } catch {}
    }
    if (body.length > 600) body = body.substring(0, 600) + "\n...";
    console.log(`\n\`\`\`json\n${body}\n\`\`\``);
  }

  // Response body
  if (e.response?.content?.text) {
    let resp = e.response.content.text;
    try {
      resp = JSON.stringify(JSON.parse(resp), null, 2);
    } catch {}
    if (resp.length > 800) resp = resp.substring(0, 800) + "\n...";
    console.log(`\n\`\`\`json\n${resp}\n\`\`\``);
  }

  console.log(`> ⏱ ${e.time}ms\n`);
}
