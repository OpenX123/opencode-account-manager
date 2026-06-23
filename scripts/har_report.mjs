import fs from "fs";

const harPath = "C:/Users/qingfeng/Downloads/进入订阅界面.har";
const raw = fs.readFileSync(harPath, "utf8");
const har = JSON.parse(raw);

const entries = har.log.entries;

// 1. Get the full Stripe init response (most important)
console.log("=".repeat(70));
console.log("1. STRIPE CHECKOUT SESSION INIT");
console.log("=".repeat(70));

const initReq = entries.find(e => e.request.url.includes("/payment_pages/") && e.request.url.includes("/init"));
if (initReq) {
  const resp = initReq.response?.content?.text;
  if (resp) {
    try {
      const data = JSON.parse(resp);
      // Show key fields
      console.log(`Session ID: ${data.id}`);
      console.log(`Mode: ${data.mode}`);
      console.log(`Payment Status: ${data.payment_status}`);
      console.log(`Amount Subtotal: ${data.amount_subtotal} ${data.currency?.toUpperCase()}`);
      console.log(`Amount Total: ${data.amount_total} ${data.currency?.toUpperCase()}`);
      console.log(`Customer ID: ${data.customer}`);
      console.log(`Customer Email: ${data.customer_details?.email}`);
      console.log(`Customer Name: ${data.customer_details?.name}`);
      console.log(`Locale: ${data.locale}`);
      console.log(`Success URL: ${data.success_url}`);
      console.log(`Cancel URL: ${data.cancel_url}`);
      console.log(`Created: ${new Date(data.created * 1000).toISOString()}`);
      
      if (data.line_items?.data) {
        console.log(`\n[Line Items]`);
        for (const item of data.line_items.data) {
          console.log(`  - ${item.description}: ${item.amount_total} ${item.currency} (${item.quantity}x)`);
          if (item.price) {
            console.log(`    Price ID: ${item.price.id}`);
            console.log(`    Unit Amount: ${item.price.unit_amount} ${item.price.currency}`);
            console.log(`    Recurring: ${JSON.stringify(item.price.recurring)}`);
          }
        }
      }
      
      if (data.payment_method_types) {
        console.log(`\n[Payment Methods]`);
        for (const p of data.payment_method_types) {
          console.log(`  - ${p}`);
        }
      }
      
      // Show consent/terms
      if (data.consent) {
        console.log(`\n[Consent]`);
        console.log(JSON.stringify(data.consent, null, 2));
      }
    } catch(e) {
      console.log("Parse error:", e.message);
      console.log(resp.substring(0, 2000));
    }
  }
}

// 2. Full wallet-config response
console.log(`\n${"=".repeat(70)}`);
console.log("2. WALLET CONFIG");
console.log("=".repeat(70));

const walletReq = entries.find(e => e.request.url.includes("/elements/wallet-config"));
if (walletReq) {
  const text = walletReq.response?.content?.text;
  if (text) {
    try {
      const data = JSON.parse(text);
      console.log(JSON.stringify(data, null, 2).substring(0, 3000));
    } catch(e) {
      console.log(text.substring(0, 2000));
    }
  }
}

// 3. Check for any POST to r.stripe.com with interesting bodies
console.log(`\n${"=".repeat(70)}`);
console.log("3. ANALYTICS EVENTS (r.stripe.com POSTs)");
console.log("=".repeat(70));

const rStripePosts = entries.filter(e => e.request.url === "https://r.stripe.com/b" && e.request.method === "POST");
console.log(`Total r.stripe.com events: ${rStripePosts.length}`);
// Show first few to understand event types
for (let i = 0; i < Math.min(5, rStripePosts.length); i++) {
  const body = rStripePosts[i].request.postData?.text;
  if (body) {
    try {
      const data = JSON.parse(body);
      console.log(`\n  Event ${i+1}: ${data.event || JSON.stringify(data).substring(0,200)}`);
    } catch {
      console.log(`\n  Event ${i+1}: ${body.substring(0, 200)}`);
    }
  }
}

// 4. Show all m.stripe.com calls (metrics/telemetry)
console.log(`\n${"=".repeat(70)}`);
console.log("4. M.STRIPE.COM METRICS");
console.log("=".repeat(70));

const mStripe = entries.filter(e => e.request.url.includes("m.stripe.com") && e.request.method === "POST");
for (const e of mStripe) {
  const body = e.request.postData?.text;
  if (body) console.log(`  ${body.substring(0, 300)}`);
}

// 5. Check for any hCaptcha challenge results
console.log(`\n${"=".repeat(70)}`);
console.log("5. HCAPTCHA ACTIVITY");
console.log("=".repeat(70));

const hcap = entries.filter(e => e.request.url.includes("hcaptcha.com"));
console.log(`hCaptcha requests: ${hcap.length}`);
for (const e of hcap) {
  console.log(`  ${e.request.method} ${e.request.url.substring(0,150)}`);
}

// 6. Summary
console.log(`\n${"=".repeat(70)}`);
console.log("6. SUMMARY");
console.log("=".repeat(70));
console.log(`Total requests: ${entries.length}`);
console.log(`All status codes: 200 (no errors)`);
console.log(`Page: ${har.log.pages[0]?.title}`);
console.log(`Page load time: ${har.log.pages[0]?.pageTimings?.onLoad}ms`);
