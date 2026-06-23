import fs from "fs";

const harPath = "C:/Users/qingfeng/Downloads/进入订阅界面.har";
const raw = fs.readFileSync(harPath, "utf8");
const har = JSON.parse(raw);

const entries = har.log.entries;
console.log(`Total entries: ${entries.length}`);
console.log(`Pages: ${har.log.pages.length}`);
console.log("");

// Summarize by domain
const domains = {};
const methods = {};
const statusCodes = {};
const resourceTypes = {};

for (const e of entries) {
  try {
    const url = new URL(e.request.url);
    domains[url.hostname] = (domains[url.hostname] || 0) + 1;
  } catch {}
  methods[e.request.method] = (methods[e.request.method] || 0) + 1;
  const status = e.response?.status || 0;
  statusCodes[status] = (statusCodes[status] || 0) + 1;
  resourceTypes[e._resourceType] = (resourceTypes[e._resourceType] || 0) + 1;
}

console.log("=== Domains ===");
for (const [d, c] of Object.entries(domains).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d}: ${c}`);
}

console.log("\n=== HTTP Methods ===");
for (const [m, c] of Object.entries(methods)) {
  console.log(`  ${m}: ${c}`);
}

console.log("\n=== Status Codes ===");
for (const [s, c] of Object.entries(statusCodes).sort()) {
  console.log(`  ${s}: ${c}`);
}

console.log("\n=== Resource Types ===");
for (const [t, c] of Object.entries(resourceTypes)) {
  console.log(`  ${t}: ${c}`);
}

// Find interesting API calls
console.log("\n=== API / XHR / Fetch calls ===");
for (const e of entries) {
  if (e._resourceType === "xhr" || e._resourceType === "fetch") {
    const u = e.request.url.substring(0, 200);
    const status = e.response?.status || "?";
    const method = e.request.method;
    console.log(`  ${method} ${status} ${u}`);
  }
}

// Find any non-2xx/3xx responses for key domains
console.log("\n=== Non-2xx/3xx responses (opencode.ai / stripe.com) ===");
for (const e of entries) {
  const status = e.response?.status || 0;
  if (status >= 400) {
    const url = e.request.url;
    if (url.includes("opencode.ai") || url.includes("stripe.com")) {
      console.log(`  ${e.request.method} ${status} ${url.substring(0,200)}`);
      if (e.response?.content?.text) {
        console.log(`    body: ${e.response.content.text.substring(0,500)}`);
      }
    }
  }
}
