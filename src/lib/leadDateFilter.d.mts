export type LeadDateFilter = "all" | "new" | "old" | "custom";
export type LeadDateBounds = { createdAfter?: string; createdBefore?: string };

export function getLeadDateBounds(
  filter: LeadDateFilter,
  startDate?: string,
  endDate?: string,
  now?: Date,
): LeadDateBounds;
