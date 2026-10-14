"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Spending chat</h1>
      <Card className="min-h-[480px] flex flex-col">
        <CardHeader>
          <CardTitle className="text-base">Ask about your receipts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          <div className="flex-1 space-y-3 overflow-y-auto rounded-md border border-border p-4 min-h-[300px]">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Try: &quot;How much did I spend on food last month?&quot; or &quot;Show spending by category.&quot;
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className="text-sm">
                <span className="font-medium capitalize">{m.role}: </span>
                {m.parts.map((part, i) =>
                  part.type === "text" ? <span key={i}>{part.text}</span> : null
                )}
              </div>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim()) return;
              void sendMessage({ text: input });
              setInput("");
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a spending question…"
              disabled={status === "streaming"}
            />
            <Button type="submit" disabled={status === "streaming"}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
