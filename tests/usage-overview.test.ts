import assert from "node:assert/strict";
import type { AccountInsightsBatchItem } from "../frontend/src/api/client";
import { collectOverviewRecords, filterOverviewRecords, summarizeOverview } from "../frontend/src/components/usage-overview";

const items = [{
  accountId: "a1",
  alias: "主号",
  insights: {
    plan: { name: "OpenCode Go" },
    records: [
      { id: "r1", timeCreated: "2026-08-12T08:00:00.000Z", model: "gpt-5", provider: "openai", inputTokens: 100, outputTokens: 20, reasoningTokens: 5, cacheReadTokens: 10, cacheWrite5mTokens: null, cacheWrite1hTokens: null, costMicroCents: 1000, plan: "go" },
      { id: "r2", timeCreated: "2026-08-11T08:00:00.000Z", model: "claude", provider: "anthropic", inputTokens: 50, outputTokens: 10, reasoningTokens: null, cacheReadTokens: null, cacheWrite5mTokens: 4, cacheWrite1hTokens: 6, costMicroCents: 500, plan: "go" },
    ],
  },
}] as AccountInsightsBatchItem[];

const records = collectOverviewRecords(items);
assert.deepEqual(records.map((record) => record.id), ["r1", "r2"]);
assert.deepEqual(filterOverviewRecords(records, { accountId: "a1", model: "gpt-5", from: "2026-08-12T00:00", to: "" }).map((record) => record.id), ["r1"]);
assert.deepEqual(summarizeOverview(records), { requests: 2, tokens: 185, cacheTokens: 20, costMicroCents: 1500 });
