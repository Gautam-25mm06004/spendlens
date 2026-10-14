export type SqlToolInput = {
  operation: "sum" | "count" | "group_by_category" | "group_by_merchant" | "monthly_totals";
  category?: string;
  merchant?: string;
  startDate?: string;
  endDate?: string;
};

export type SqlToolResult = {
  rows: Record<string, unknown>[];
  receiptIds: string[];
};
