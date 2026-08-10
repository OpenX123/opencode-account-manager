import assert from "node:assert/strict";
import { goSettingEnableValue, parseGoSettings } from "./account-insights.js";

assert.deepEqual(
  parseGoSettings('useBalance:!0,region:$R[1]=["us","cn"]', ""),
  { useBalance: true, useChinaProviders: true }
);
assert.equal(goSettingEnableValue("useBalance"), "true");
assert.equal(goSettingEnableValue("useChinaProviders"), "false");
assert.deepEqual(
  parseGoSettings('useBalance:!1,region:$R[1]=["us","eu"]', ""),
  { useBalance: false, useChinaProviders: false }
);

console.log("account-insights parser: ok");
