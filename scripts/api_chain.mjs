import fs from "fs";

const harPath = "C:/Users/qingfeng/Downloads/进入订阅界面.har";
const raw = fs.readFileSync(harPath, "utf8");
const har = JSON.parse(raw);

const entries = har.log.entries;

// Filter to API calls only: POST requests, XHR/fetch/preflight, and GETs to API endpoints
const apiCalls = entries.filter(e => {
  const url = e.request.url;
  // Exclude static assets
  if (url.match(/\.(js|css|png|jpg|woff2|html|webmanifest|svg|ico)($|\?)/)) return false;
  if (url.match(/\/fingerprinted\//)) return false;
  // Keep API calls
  if (e._resourceType === "xhr" || e._resourceType === "fetch" || e._resourceType === "preflight") return true;
  if (e.request.method === "POST") return true;
  if (url.includes("api.") || url.includes("merchant-ui-api")) return true;
  return false;
});

// Sort by start time
apiCalls.sort((a, b) => new Date(a.startedDateTime) - new Date(b.startedDateTime));

console.log(`# Stripe Checkout API 调用链路\n`);
console.log(`共 ${apiCalls.length} 个 API 请求\n`);

let step = 0;
for (const e of apiCalls) {
  step++;
  const method = e.request.method;
  const url = e.request.url;
  const host = new URL(url).hostname;
  const path = new URL(url).pathname + (new URL(url).search || "");
  const status = e.response?.status || "?";
  const statusText = e.response?.statusText || "";

  console.log(`## ${step}. ${method} ${status} ${path}`);
  console.log(`   域名: ${host}`);

  // Request body for POST
  if (e.request.postData?.text) {
    let body = e.request.postData.text;
    // Decode URL-encoded
    if (body.includes("=") && !body.startsWith("{")) {
      try {
        const params = new URLSearchParams(body);
        body = JSON.stringify(Object.fromEntries(params), null, 2);
      } catch {}
    }
    // Truncate
    if (body.length > 500) body = body.substring(0, 500) + "...";
    console.log(`   Request: ${body}`);
  }

  // Response summary
  if (e.response?.content?.text) {
    let resp = e.response.content.text;
    try {
      const json = JSON.parse(resp);
      // Show key fields only
      const summary = {};
      if (json.id) summary.id = json.id;
      if (json.object) summary.object = json.object;
      if (json.mode) summary.mode = json.mode;
      if (json.payment_status) summary.payment_status = json.payment_status;
      if (json.currency) summary.currency = json.currency;
      if (json.amount_subtotal !== undefined) summary.amount_subtotal = json.amount_subtotal;
      if (json.amount_total !== undefined) summary.amount_total = json.amount_total;
      if (json.customer_email) summary.customer_email = json.customer_email;
      if (json.payment_method_types) summary.payment_method_types = json.payment_method_types;
      if (json.link_available !== undefined) summary.link_available = json.link_available;
      if (json.google_pay_available !== undefined) summary.google_pay_available = json.google_pay_available;
      if (json.apple_pay_available !== undefined) summary.apple_pay_available = json.apple_pay_available;
      if (json.auth_session_client_secret !== undefined) summary.auth_session_client_secret = json.auth_session_client_secret;
      if (json.config_id) summary.config_id = json.config_id;
      resp = JSON.stringify(summary, null, 2);
    } catch {
      if (resp.length > 200) resp = resp.substring(0, 200) + "...";
    }
    console.log(`   Response: ${resp}`);
  }

  // Timing
  if (e.time) {
    console.log(`   耗时: ${e.time}ms`);
  }

  console.log("");
}
