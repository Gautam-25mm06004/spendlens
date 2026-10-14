"use client";

import { useQuery } from "@tanstack/react-query";

export function UsageBanner() {
  const { data, isError } = useQuery({
    queryKey: ["usage"],
    queryFn: async () => {
      const res = await fetch("/api/usage");
      if (!res.ok) return null;
      return res.json() as Promise<{
        extractions: number;
        chats: number;
        extractionQuota: number;
        chatQuota: number;
      }>;
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  if (isError || !data) return null;

  return (
    <div className="border-t border-border bg-muted/40 px-4 py-1.5 text-center text-xs text-muted-foreground">
      This month: {data.extractions}/{data.extractionQuota} extractions ·{" "}
      {data.chats}/{data.chatQuota} chat messages
    </div>
  );
}
