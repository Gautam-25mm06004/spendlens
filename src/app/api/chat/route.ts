import { z } from "zod";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { isChatLlmConfigured } from "@/lib/config";
import { requireUserId } from "@/lib/auth";
import { offlineChatResponse } from "@/lib/chat/offline";
import { checkQuota, recordUsage, runSqlTool } from "@/lib/data/repository";
import type { SqlToolInput } from "@/lib/chat/sql-tool-types";
import { visionModel } from "@/lib/llm/router";

const sqlToolSchema = z.object({
  operation: z.enum([
    "sum",
    "count",
    "group_by_category",
    "group_by_merchant",
    "monthly_totals",
  ]),
  category: z.string().optional(),
  merchant: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    const text = m.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (text) return text;
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const quota = await checkQuota(userId, "chat");
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({ error: `Monthly chat quota reached (${quota.used}/${quota.quota}).` }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const { messages }: { messages: UIMessage[] } = await req.json();

    if (!isChatLlmConfigured()) {
      const answer = await offlineChatResponse(userId, lastUserText(messages));
      await recordUsage(userId, "chat");
      return answer;
    }

    let citationIds: string[] = [];

    const result = streamText({
      model: visionModel(),
      system: `You are SpendLens, a spending assistant. Answer questions ONLY from query results.
If data is empty or the question is out of scope, say you cannot answer from the user's receipts.
Always cite receipt IDs from tool results when answering with numbers.
Do not invent amounts. Multi-currency: report each currency separately.`,
      messages: await convertToModelMessages(messages),
      tools: {
        querySpending: tool({
          description:
            "Query the user's confirmed receipts. user_id is injected server-side.",
          inputSchema: sqlToolSchema,
          execute: async (input: SqlToolInput) => {
            const data = await runSqlTool(userId, input);
            citationIds = [...new Set([...citationIds, ...data.receiptIds])];
            return data;
          },
        }),
      },
      maxOutputTokens: 1024,
      temperature: 0.2,
      onFinish: async () => {
        await recordUsage(userId, "chat");
      },
    });

    return result.toUIMessageStreamResponse({
      messageMetadata: () => ({ citationReceiptIds: citationIds }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
