import type { AccountInsightsBatchItem, UsageRecord } from "../api/client";

export interface OverviewRecord extends UsageRecord {
  accountId: string;
  accountAlias: string;
  planName: string;
}

export interface OverviewFilters {
  accountId: string;
  model: string;
  from: string;
  to: string;
}

export function collectOverviewRecords(items: AccountInsightsBatchItem[]): OverviewRecord[] {
  return items
    .flatMap((item) => item.insights?.records.map((record) => ({
      ...record,
      accountId: item.accountId,
      accountAlias: item.alias,
      planName: item.insights?.plan.name ?? "",
    })) ?? [])
    .sort((a, b) => b.timeCreated.localeCompare(a.timeCreated));
}

export function filterOverviewRecords(records: OverviewRecord[], filters: OverviewFilters) {
  const from = filters.from ? new Date(filters.from).getTime() : 0;
  const to = filters.to ? new Date(filters.to).getTime() : Number.POSITIVE_INFINITY;
  return records.filter((record) => {
    const time = new Date(record.timeCreated).getTime();
    return (!filters.accountId || record.accountId === filters.accountId)
      && (!filters.model || record.model === filters.model)
      && time >= from
      && time <= to;
  });
}

export function summarizeOverview(records: OverviewRecord[]) {
  return records.reduce((summary, record) => {
    summary.tokens += record.inputTokens + record.outputTokens + (record.reasoningTokens ?? 0);
    summary.cacheTokens += (record.cacheReadTokens ?? 0)
      + (record.cacheWrite5mTokens ?? 0)
      + (record.cacheWrite1hTokens ?? 0);
    summary.costMicroCents += record.costMicroCents;
    return summary;
  }, { requests: records.length, tokens: 0, cacheTokens: 0, costMicroCents: 0 });
}
