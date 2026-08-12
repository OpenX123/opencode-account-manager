import assert from "node:assert/strict";
import { accountInsightsToUsageResult, goSettingEnableValue, parseGoSettings } from "./account-insights.js";
import type { AccountInsightsBatchItem } from "./account-insights.js";

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
assert.deepEqual(
  accountInsightsToUsageResult({
    accountId: "a1",
    alias: "主号",
    insights: { windows: { rolling: { usagePercent: 25, remainingPercent: 75, resetInSec: 60, resetAt: 1, status: "ok" } } },
  } as AccountInsightsBatchItem),
  {
    accountId: "a1",
    alias: "主号",
    success: true,
    message: "查询成功",
    rolling: { usagePercent: 25, remainingPercent: 75, resetInSec: 60, resetAt: 1, status: "ok" },
  }
);

console.log("account-insights parser: ok");
