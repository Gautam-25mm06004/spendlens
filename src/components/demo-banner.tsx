"use client";

import { useQuery } from "@tanstack/react-query";

export function DemoBanner() {
  const { data } = useQuery({
    queryKey: ["runtime"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      return res.json() as Promise<{ demo?: boolean; mode?: string }>;
    },
    staleTime: 60_000,
  });

  if (!data?.demo) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      Demo mode — in-memory data, mock extraction & chat. No database, Clerk, or API keys required.
    </div>
  );
}
