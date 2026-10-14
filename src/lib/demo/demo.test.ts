import { describe, expect, it } from "vitest";
import { demoStore } from "@/lib/demo/store";
import { DEMO_USER_ID } from "@/lib/config";
import { mockExtract } from "@/lib/extraction/mock";
import { runSqlTool } from "@/lib/data/repository";

describe("demo mode", () => {
  it("seeds receipts for demo user", () => {
    const rows = demoStore.listReceipts(DEMO_USER_ID);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  it("mock extraction always returns valid structure", () => {
    const result = mockExtract("coffee-shop.jpg");
    expect(result.extraction.isReceipt).toBe(true);
    expect(result.model).toBe("demo/mock");
  });

  it("sql tool works in demo without database", async () => {
    const data = await runSqlTool(DEMO_USER_ID, { operation: "group_by_category" });
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.receiptIds.length).toBeGreaterThan(0);
  });
});
