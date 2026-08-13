import assert from "node:assert/strict";
import { quotaExhausted } from "./quota-guard.js";
import type { AccountInsights } from "./account-insights.js";

const insights = (windows: AccountInsights["windows"]) => ({ windows }) as AccountInsights;
assert.equal(quotaExhausted(insights({ rolling: { usagePercent: 100 } as never })), true);
assert.equal(quotaExhausted(insights({ weekly: { usagePercent: 99 } as never })), false);
assert.equal(quotaExhausted(insights({})), false);
console.log("quota guard: ok");
