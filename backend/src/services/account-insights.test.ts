import assert from "node:assert/strict";
import { parseGoSettings } from "./account-insights.js";

assert.deepEqual(
  parseGoSettings('useBalance:!0,region:$R[1]=["us","cn"]', ""),
  { useBalance: true, useChinaProviders: true }
);
assert.deepEqual(
  parseGoSettings('useBalance:!1,region:$R[1]=["us","eu"]', ""),
  { useBalance: false, useChinaProviders: false }
);

console.log("account-insights parser: ok");
