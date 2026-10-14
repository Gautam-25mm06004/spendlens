import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { runSqlTool } from "@/lib/data/repository";
import type { SqlToolInput } from "@/lib/chat/sql-tool-types";

function pickOperation(text: string): SqlToolInput {
  const lower = text.toLowerCase();
  if (lower.includes("category") || lower.includes("categories")) {
    return { operation: "group_by_category" };
  }
  if (lower.includes("merchant") || lower.includes("store")) {
    return { operation: "group_by_merchant" };
  }
  if (lower.includes("month") || lower.includes("trend")) {
    return { operation: "monthly_totals" };
  }
  if (lower.includes("how many") || lower.includes("count")) {
    return { operation: "count" };
  }
  if (lower.includes("food")) {
    return { operation: "sum", category: "Food" };
  }
  if (lower.includes("grocer")) {
    return { operation: "sum", category: "Groceries" };
  }
  return { operation: "sum" };
}

function formatAnswer(
  question: string,
  data: Awaited<ReturnType<typeof runSqlTool>>
): string {
  if (!data.rows.length) {
    return "I can't answer that from your receipts — no matching confirmed receipts.";
  }

  const op = pickOperation(question).operation;
  if (op === "count") {
    return `You have ${data.rows[0]?.count ?? 0} matching confirmed receipt(s). Receipt IDs: ${data.receiptIds.join(", ") || "none"}.`;
  }

  if (op === "group_by_category") {
    const lines = data.rows.map(
      (r) => `${r.category}: ${r.total} ${r.currency}`
    );
    return `Spending by category:\n${lines.join("\n")}\n\nCited receipts: ${data.receiptIds.join(", ")}.`;
  }

  if (op === "group_by_merchant") {
    const lines = data.rows.map(
      (r) => `${r.merchant}: ${r.total} ${r.currency}`
    );
    return `Spending by merchant:\n${lines.join("\n")}\n\nCited receipts: ${data.receiptIds.join(", ")}.`;
  }

  if (op === "monthly_totals") {
    const lines = data.rows.map((r) => `${r.month}: ${r.total} ${r.currency}`);
    return `Monthly totals:\n${lines.join("\n")}\n\nCited receipts: ${data.receiptIds.join(", ")}.`;
  }

  const lines = data.rows.map((r) => `${r.total} ${r.currency}`);
  return `Total spend: ${lines.join(", ")}. Cited receipts: ${data.receiptIds.join(", ")}.`;
}

export async function offlineChatResponse(userId: string, userText: string) {
  const input = pickOperation(userText);
  const data = await runSqlTool(userId, input);
  const answer = formatAnswer(userText, data);

  const stream = createUIMessageStream({
    execute({ writer }) {
      const id = "offline-text";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: answer });
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
