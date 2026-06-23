import fs from "fs";

const harPath = "C:/Users/qingfeng/Downloads/进入订阅界面.har";
const raw = fs.readFileSync(harPath, "utf8");
const har = JSON.parse(raw);

const entries = har.log.entries;
const initReq = entries.find(e => e.request.url.includes("/payment_pages/") && e.request.url.includes("/init"));

if (initReq) {
  const resp = initReq.response?.content?.text;
  if (resp) {
    const data = JSON.parse(resp);
    
    console.log("=== SUBSCRIPTION DATA ===");
    console.log(JSON.stringify(data.subscription_data, null, 2));
    
    console.log("\n=== LINE ITEM GROUP ===");
    console.log(JSON.stringify(data.line_item_group, null, 2)?.substring(0, 3000));
    
    console.log("\n=== RECURRING DETAILS ===");
    console.log(JSON.stringify(data.recurring_details, null, 2));
    
    console.log("\n=== ORDERED PAYMENT METHOD TYPES ===");
    console.log(JSON.stringify(data.ordered_payment_method_types, null, 2));
    
    console.log("\n=== PAYMENT METHOD COLLECTION ===");
    console.log(JSON.stringify(data.payment_method_collection, null, 2));
    
    console.log("\n=== CONSENT ===");
    console.log(JSON.stringify(data.consent, null, 2));
    
    console.log("\n=== CONSENT COLLECTION ===");
    console.log(JSON.stringify(data.consent_collection, null, 2));
    
    console.log("\n=== INVOICE CREATION ===");
    console.log(JSON.stringify(data.invoice_creation, null, 2));
    
    console.log("\n=== CUSTOM FIELDS ===");
    console.log(JSON.stringify(data.custom_fields, null, 2));
    
    console.log("\n=== SHIPPING ADDRESS COLLECTION ===");
    console.log(JSON.stringify(data.shipping_address_collection, null, 2));
    
    console.log("\n=== CUSTOMER EMAIL ===");
    console.log(data.customer_email);
    
    console.log("\n=== CLIENT REFERENCE ID ===");
    console.log(data.client_reference_id);
    
    console.log("\n=== METADATA ===");
    console.log(JSON.stringify(data.metadata, null, 2));
    
    console.log("\n=== SITE KEY ===");
    console.log(data.site_key);
    
    console.log("\n=== ELEMENTS SESSION ===");
    console.log(JSON.stringify(data.elements_session, null, 2)?.substring(0, 500));
    
    console.log("\n=== CREATED ===");
    console.log(data.created);
    
    console.log("\n=== INVOICE ===");
    console.log(JSON.stringify(data.invoice, null, 2));
  }
}
