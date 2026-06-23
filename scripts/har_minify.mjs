import fs from "fs";

const harPath = "C:/Users/qingfeng/Downloads/进入订阅界面.har";
const raw = fs.readFileSync(harPath, "utf8");
const har = JSON.parse(raw);

const entries = har.log.entries;

// Keep only business API calls
const keep = entries.filter(e => {
  const url = e.request.url;
  const host = new URL(url).hostname;
  const path = new URL(url).pathname;
  
  // Skip static assets
  if (url.match(/\.(js|css|png|jpg|jpeg|gif|woff2|svg|ico|webmanifest|json)($|\?)/) && 
      !url.includes("deploy_status") && !url.includes("hcaptcha") && !url.includes("px-cloud")) {
    return false;
  }
  
  // Skip telemetry
  if (host === "r.stripe.com" || host === "m.stripe.com" || host === "m.stripe.network") return false;
  if (host === "play.google.com" || host === "www.gstatic.com") return false;
  
  // Skip CSP reports
  if (url.includes("csp-report")) return false;
  
  // Skip deploy status pings
  if (url.includes("deploy_status_henson")) return false;
  
  // Skip OPTIONS preflight
  if (e.request.method === "OPTIONS" && !url.includes("hcaptcha")) return false;
  
  // Skip Google Pay logs
  if (url.includes("/log?format=json")) return false;
  
  // Skip inner-preview
  if (url.includes("inner-preview.html")) return false;
  
  return true;
});

// Build minimal HAR
const cleanHar = {
  log: {
    version: "1.2",
    creator: har.log.creator,
    pages: har.log.pages,
    entries: keep.map(e => ({
      startedDateTime: e.startedDateTime,
      time: e.time,
      request: {
        method: e.request.method,
        url: e.request.url,
        httpVersion: e.request.httpVersion,
        headers: e.request.headers.filter(h => 
          ["content-type", "content-length", "accept", "origin", "referer", "authorization"].includes(h.name.toLowerCase())
        ),
        postData: e.request.postData ? {
          mimeType: e.request.postData.mimeType,
          text: e.request.postData.text.substring(0, 2000)
        } : undefined
      },
      response: {
        status: e.response.status,
        statusText: e.response.statusText,
        httpVersion: e.response.httpVersion,
        headers: e.response.headers.filter(h => 
          ["content-type", "content-length"].includes(h.name.toLowerCase())
        ),
        content: e.response.content ? {
          size: e.response.content.size,
          mimeType: e.response.content.mimeType,
          text: e.response.content.text ? e.response.content.text.substring(0, 3000) : undefined
        } : undefined
      },
      _resourceType: e._resourceType,
      _initiator: e._initiator ? {
        type: e._initiator.type,
        url: e._initiator.stack?.callFrames?.[0]?.url
      } : undefined
    }))
  }
};

const outPath = "C:/Users/qingfeng/Downloads/进入订阅界面_精简.har";
fs.writeFileSync(outPath, JSON.stringify(cleanHar, null, 2));
console.log(`精简完成: ${entries.length} → ${keep.length} 个请求`);
console.log(`输出: ${outPath}`);

// Show what was kept
console.log("\n保留的请求:");
let i = 0;
for (const e of keep) {
  i++;
  const u = new URL(e.request.url);
  console.log(`  ${i}. ${e.request.method} ${u.hostname}${u.pathname}`);
}
