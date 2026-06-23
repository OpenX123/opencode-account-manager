import fs from "fs";

const harPath = "C:/Users/qingfeng/Downloads/进入订阅界面.har";
const raw = fs.readFileSync(harPath, "utf8");
const har = JSON.parse(raw);

const entries = har.log.entries;

// Get the full init response
const initReq = entries.find(e => e.request.url.includes("/payment_pages/") && e.request.url.includes("/init"));
if (initReq) {
  const resp = initReq.response?.content?.text;
  if (resp) {
    try {
      const data = JSON.parse(resp);
      // Show all top-level keys
      console.log("Top-level keys:", Object.keys(data));
      
      // Show line items if available
      if (data.line_items) {
        console.log("\n[Line Items]");
        console.log(JSON.stringify(data.line_items, null, 2).substring(0, 3000));
      }
      
      // Show amount details
      console.log("\n[Amount Details]");
      console.log(`  amount_subtotal: ${data.amount_subtotal}`);
      console.log(`  amount_total: ${data.amount_total}`);
      console.log(`  currency: ${data.currency}`);
      
      // Show payment method types
      console.log(`\n[Payment Method Types]`);
      console.log(`  enabled: ${JSON.stringify(data.payment_method_types)}`);
      
      // Show consent/terms
      if (data.consent || data.consent_collection) {
        console.log(`\n[Consent/Collection]`);
        console.log(`  consent: ${JSON.stringify(data.consent)}`);
        console.log(`  consent_collection: ${JSON.stringify(data.consent_collection)}`);
      }
      
      // Show customer details
      console.log(`\n[Customer]`);
      console.log(`  customer: ${data.customer}`);
      console.log(`  customer_email: ${data.customer_email}`);
      console.log(`  customer_details: ${JSON.stringify(data.customer_details)}`);
      
      // Show subscription details
      if (data.subscription) {
        console.log(`\n[Subscription]`);
        console.log(`  subscription: ${data.subscription}`);
      }
      
      // Show success/cancel URLs
      console.log(`\n[URLs]`);
      console.log(`  success_url: ${data.success_url}`);
      console.log(`  cancel_url: ${data.cancel_url}`);
      
      // Show billing address collection
      console.log(`\n[Billing]`);
      console.log(`  billing_address_collection: ${data.billing_address_collection}`);
      
      // Show invoice creation
      if (data.invoice_creation) {
        console.log(`\n[Invoice]`);
        console.log(`  invoice_creation: ${JSON.stringify(data.invoice_creation)}`);
      }
      
      // Show metadata
      if (data.metadata) {
        console.log(`\n[Metadata]`);
        console.log(JSON.stringify(data.metadata, null, 2));
      }
      
      // Show shipping
      if (data.shipping_address_collection) {
        console.log(`\n[Shipping]`);
        console.log(`  shipping_address_collection: ${JSON.stringify(data.shipping_address_collection)}`);
      }
      
      // Show phone number collection
      if (data.phone_number_collection) {
        console.log(`\n[Phone]`);
        console.log(`  phone_number_collection: ${JSON.stringify(data.phone_number_collection)}`);
      }
      
      // Tax
      if (data.tax_id_collection) {
        console.log(`\n[Tax]`);
        console.log(`  tax_id_collection: ${JSON.stringify(data.tax_id_collection)}`);
      }
      
      // Show custom text
      if (data.custom_text) {
        console.log(`\n[Custom Text]`);
        console.log(JSON.stringify(data.custom_text, null, 2).substring(0, 1000));
      }
      
      // Show mode
      console.log(`\n[Mode]`);
      console.log(`  mode: ${data.mode}`);
      console.log(`  payment_status: ${data.payment_status}`);
      console.log(`  status: ${data.status}`);
      console.log(`  livemode: ${data.livemode}`);
    } catch(e) {
      console.log("Error:", e.message);
      console.log(resp.substring(0, 4000));
    }
  }
}
